// PVIT payment of a TRANSPORT (farmer -> driver, platform commission).
//
// Isolated on purpose: this module is only called on demand (the farmer pays a
// course the driver has accepted) and shares nothing with the order payment
// handlers except the generic PVIT runtime (pvit-runtime.ts). Nothing here
// runs automatically.
//
// Same security model as the order payments:
//  * PVIT does not sign webhooks: the status API decides, never the callback;
//  * the client only sends requestId / phone / operator. The amount, the
//    commission and the driver's share are the values FROZEN on the transport
//    request when it was ordered (the admin tariff can change meanwhile);
//  * every database write is checked and replayable (idempotent).
//
// Nothing is hard-coded: amounts come from the request, limits and PVIT codes
// from the environment, the payment window from transport_settings.

import {
  canTransitionPaymentStatus,
  inFlightWindowStart,
  initiationWindowStart,
  isReportedAmountValid,
} from './payment-guards.ts'
import {
  beneficiaryCodeFor,
  buildAck,
  buildSplitPayload,
  generateReference,
  hasOperatorPrefix,
  mapPvitStatus,
  normalizeLocalPhone,
  parseInitiationResponse,
  phoneValidationMessage,
  toPvitOperator,
  type Operator,
  type PvitCallback,
} from './pvit-core.ts'
import {
  computeFeeBreakdown,
  ensure,
  fail,
  getOrCreatePlatformWallet,
  getServiceClient,
  getUserClient,
  json,
  maskPhone,
  providerErrorCode,
  pvitFetch,
  readConfig,
  verifyWithProvider,
  withCors,
  type PvitConfig,
} from './pvit-runtime.ts'

const SELECT_TRANSPORT_PAYMENT = '*'

// ---------------------------------------------------------------- initiation

type InitInput = { req: Request }

const initiateTransportPaymentImpl = async ({ req }: InitInput) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return fail(405, 'Method not allowed', 'METHOD_NOT_ALLOWED')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail(401, 'Unauthorized', 'NO_AUTH_HEADER')

  const { data: { user }, error: authError } = await getUserClient(authHeader).auth.getUser()
  if (authError || !user) return fail(401, 'Invalid token', 'AUTH_FAILED')

  const body: any = await req.json().catch(() => ({}))
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  const phone = normalizeLocalPhone(body?.phone)
  if (!requestId || !phone) return fail(400, 'Missing required fields', 'INVALID_PAYLOAD')

  const forced = String(body?.operator || '').toLowerCase()
  const operator: Operator = forced.includes('moov') || forced.includes('libertis')
    ? 'moov'
    : forced.includes('airtel')
      ? 'airtel'
      : hasOperatorPrefix(phone, 'moov') ? 'moov' : 'airtel'
  if (!hasOperatorPrefix(phone, operator)) {
    return fail(400, phoneValidationMessage(operator), 'INVALID_PHONE_OPERATOR')
  }

  const cfg = readConfig()
  if (!cfg || !cfg.codeUrlPayment || !cfg.callbackUrlCode) {
    return fail(503, 'Le paiement n\'est pas encore configure.', 'PAYMENT_NOT_CONFIGURED')
  }

  console.log('[PVIT] Initiating transport payment', { requestId, operator, phone: maskPhone(phone) })

  try {
    const client = getServiceClient()

    const { data: request, error: requestError } = await client
      .from('transport_requests')
      .select('id,farmer_id,driver_id,status,payment_status,payment_deadline,fare_amount')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) throw new Error(`request lookup: ${requestError.message}`)
    if (!request) return fail(404, 'Transport request not found', 'REQUEST_NOT_FOUND')

    const { data: farmer } = await client.from('farmers').select('user_id').eq('id', request.farmer_id).maybeSingle()
    if (!farmer || farmer.user_id !== user.id) return fail(403, 'Unauthorized access to request', 'REQUEST_OWNERSHIP')

    if (request.status !== 'accepted') {
      return fail(409, 'Cette course n\'attend pas de paiement.', 'INVALID_REQUEST_STATUS')
    }
    if (request.payment_status === 'paid') return fail(409, 'Cette course est deja payee.', 'ALREADY_PAID')
    if (request.payment_deadline && new Date(request.payment_deadline).getTime() < Date.now()) {
      return fail(409, 'Le delai de paiement est depasse.', 'PAYMENT_WINDOW_EXPIRED')
    }

    // The driver's price, frozen at the order. The farmer pays it PLUS the platform commission,
    // the PVIT fee and the operator fee (admin-set rates); the driver receives the price in full.
    const driverNet = Math.round(Number(request.fare_amount))
    if (!Number.isFinite(driverNet) || driverNet <= 0) {
      return fail(400, 'Invalid fare', 'INVALID_AMOUNT')
    }

    // Per-user rate limit across all transport payments.
    const { data: recent } = await client
      .from('transport_payments')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', initiationWindowStart(Date.now(), cfg.initiationWindowMs))
      .limit(cfg.maxInitiations)
    if (recent && recent.length >= cfg.maxInitiations) {
      return fail(429, 'Trop de tentatives de paiement. Reessayez dans quelques minutes.', 'TOO_MANY_ATTEMPTS')
    }

    // One payment at a time per course (double click / retry).
    const { data: inFlight } = await client
      .from('transport_payments')
      .select('id')
      .eq('transport_request_id', request.id)
      .in('status', ['initiated', 'pending'])
      .gte('created_at', inFlightWindowStart(Date.now(), cfg.inFlightWindowMs))
      .limit(1)
    if (inFlight && inFlight.length > 0) {
      return fail(409, 'Un paiement est deja en cours pour cette course. Validez la demande sur votre telephone.', 'PAYMENT_IN_PROGRESS')
    }

    const { data: payout, error: payoutError } = await client
      .from('driver_payout_accounts')
      .select('id,operator,normalized_msisdn')
      .eq('driver_id', request.driver_id)
      .eq('provider', 'pvit')
      .eq('verification_status', 'verified')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (payoutError) throw new Error(`payout account lookup: ${payoutError.message}`)
    if (!payout) {
      return fail(409, 'Le chauffeur n\'a pas de compte Mobile Money verifie pour recevoir le paiement.', 'DRIVER_PAYOUT_NOT_VERIFIED')
    }

    const breakdown = await computeFeeBreakdown(client, 'transport', driverNet, operator)
    const amount = breakdown.total_amount
    const platformFee = amount - driverNet

    const wallet = await getOrCreatePlatformWallet(client, cfg)
    const reference = generateReference(request.id)
    const payoutOperator: Operator = payout.operator === 'moov' ? 'moov' : 'airtel'
    const beneficiaryCode = beneficiaryCodeFor(payout.id)

    const pvitPayload = buildSplitPayload({
      amount,
      reference,
      customerPhone: phone,
      operatorCode: toPvitOperator(operator),
      operationAccountCode: cfg.operationAccountCode,
      callbackUrlCode: cfg.callbackUrlCode,
      ownerCharge: cfg.ownerCharge,
      orderId: request.id,
      freeInfoLabel: 'trans',
      merchantNetAmount: driverNet,
      beneficiary: {
        msisdn: payout.normalized_msisdn,
        operatorCode: toPvitOperator(payoutOperator),
        code: beneficiaryCode,
      },
    })

    const insertion = await client
      .from('transport_payments')
      .insert({
        transport_request_id: request.id,
        user_id: user.id,
        driver_id: request.driver_id,
        driver_payout_account_id: payout.id,
        platform_wallet_id: wallet.id,
        provider: 'pvit',
        operator,
        internal_reference: reference,
        status: 'initiated',
        amount,
        platform_fee: platformFee,
        driver_net: driverNet,
        fee_breakdown: breakdown,
        raw_request: { ...pvitPayload, ouyaboung: { payoutAccountId: payout.id, beneficiaryCode, platformFee, driverNet } },
      })
      .select()
      .single()
    if (insertion.error?.code === '23505') {
      // The unique index (one active payment per course) won a concurrent attempt.
      return fail(409, 'Un paiement est deja en cours pour cette course.', 'PAYMENT_IN_PROGRESS')
    }
    const payment = ensure('transport payment ledger', insertion).data

    ensure(
      'request payment pending',
      await client
        .from('transport_requests')
        .update({ payment_status: 'pending' })
        .eq('id', request.id)
        .eq('payment_status', 'unpaid'),
    )

    let providerOk = false
    let providerBody: any = {}
    let networkError = false
    try {
      const result = await pvitFetch(client, cfg, `${cfg.baseUrl}/v2/${cfg.codeUrlPayment}/rest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Callback-MediaType': 'application/json' },
        body: JSON.stringify(pvitPayload),
      })
      providerBody = result.body
      const parsedStatus = parseInitiationResponse(providerBody).status?.toUpperCase()
      providerOk = result.response.ok && parsedStatus !== 'FAILED'
    } catch (error) {
      // Unknown outcome: keep the payment pending so a late callback or a status
      // check can still resolve it.
      networkError = true
      console.error('[PVIT] transport initiation transport error', error instanceof Error ? error.message : error)
    }

    const parsed = parseInitiationResponse(providerBody)
    // The initiation answer never confirms anything: only a webhook or a status
    // check can. Success here means "request accepted, awaiting the farmer".
    const internalStatus = providerOk || networkError ? 'pending' : 'failed'
    const message = networkError
      ? 'Le fournisseur de paiement est momentanement indisponible.'
      : providerOk
        ? 'Paiement initie. Validez la demande sur votre telephone.'
        : parsed.message || 'Echec de l\'initialisation du paiement'

    ensure(
      'transport payment update',
      await client
        .from('transport_payments')
        .update({
          provider_transaction_id: parsed.providerTransactionId,
          provider_status: parsed.status,
          provider_result: parsed.statusCode,
          status: internalStatus,
          raw_response: providerBody,
        })
        .eq('id', payment.id),
    )

    if (internalStatus === 'failed') {
      // Nothing was charged: the farmer can try again within the window.
      ensure(
        'request payment reset',
        await client
          .from('transport_requests')
          .update({ payment_status: 'unpaid' })
          .eq('id', request.id)
          .eq('payment_status', 'pending'),
      )
    }

    if (networkError) return fail(502, message, 'PROVIDER_UNAVAILABLE', { reference })

    return json(
      {
        success: providerOk,
        data: {
          paymentId: payment.id,
          reference,
          totalAmount: amount,
          driverAmount: driverNet,
          platformFee,
          breakdown,
          status: internalStatus,
          message,
        },
        ...(providerOk ? {} : { error: { message, code: 'PROVIDER_REJECTED', providerCode: providerErrorCode(providerBody) || null } }),
      },
      providerOk ? 200 : 400,
    )
  } catch (error) {
    console.error('[PVIT] transport initiation failed', error instanceof Error ? error.message : error)
    return fail(500, 'Erreur interne lors de l\'initialisation du paiement', 'INTERNAL_ERROR')
  }
}

// ------------------------------------------------------------- confirmation

// Writes what a confirmed transport payment implies. Idempotent: it can be
// replayed after a partial failure.
const applyTransportConfirmation = async (client: any, payment: any, raw: unknown) => {
  const nowIso = new Date().toISOString()

  const { data: request } = await client
    .from('transport_requests')
    .select('id,status')
    .eq('id', payment.transport_request_id)
    .maybeSingle()

  // The course was cancelled while the payment was in flight (e.g. the farmer paid
  // right after the deadline): the money was taken, so flag it for a manual refund.
  const cancelled = request?.status === 'cancelled'
  if (cancelled) {
    console.error('[PVIT] REFUND_REQUIRED: transport payment confirmed for a cancelled request', {
      paymentId: payment.id,
      requestId: payment.transport_request_id,
    })
  }

  ensure(
    'transport payment confirm',
    await client
      .from('transport_payments')
      .update({
        provider_status: 'SUCCESS',
        status: 'confirmed',
        raw_callback: raw,
        confirmed_at: payment.confirmed_at || nowIso,
        settlement_status: cancelled ? 'manual_review' : 'paid',
      })
      .eq('id', payment.id),
  )

  ensure(
    'request paid',
    await client
      .from('transport_requests')
      .update({ payment_status: 'paid', paid_at: nowIso })
      .eq('id', payment.transport_request_id)
      .in('payment_status', ['unpaid', 'pending']),
  )
}

const applyTransportNonConfirmed = async (client: any, payment: any, internal: string, providerStatus: string | null, raw: unknown) => {
  ensure(
    'transport payment update',
    await client
      .from('transport_payments')
      .update({ provider_status: providerStatus, status: internal, raw_callback: raw })
      .eq('id', payment.id),
  )
  if (internal === 'failed' || internal === 'cancelled' || internal === 'expired') {
    // Nothing was charged: the farmer can pay again within the window.
    ensure(
      'request payment reset',
      await client
        .from('transport_requests')
        .update({ payment_status: 'unpaid' })
        .eq('id', payment.transport_request_id)
        .eq('payment_status', 'pending'),
    )
  }
}

// Shared by the webhook and the manual sync: verify, then apply what PVIT says.
const reconcileTransportPayment = async (client: any, cfg: PvitConfig, payment: any) => {
  const verified = await verifyWithProvider(client, cfg, payment)
  if (!verified.ok) return { ok: false as const, kind: verified.kind, reason: verified.reason }

  if (!canTransitionPaymentStatus(payment.status, verified.internal)) {
    return { ok: true as const, applied: payment.status, ignored: true }
  }
  if (verified.internal === 'confirmed') {
    // The amount must be reported by PVIT and match the frozen fare exactly.
    if (verified.amount === null || verified.amount <= 0 || !isReportedAmountValid(Number(payment.amount), verified.amount)) {
      console.error('[PVIT] Transport amount mismatch', { reference: payment.internal_reference, expected: payment.amount, reported: verified.amount })
      return { ok: false as const, kind: 'mismatch' as const, reason: 'amount mismatch' }
    }
    await applyTransportConfirmation(client, payment, verified.raw)
  } else if (verified.internal !== payment.status) {
    await applyTransportNonConfirmed(client, payment, verified.internal, verified.providerStatus, verified.raw)
  }
  return { ok: true as const, applied: verified.internal, ignored: false }
}

// ------------------------------------------------------- webhook (dispatched)

// Called by the shared webhook when the reference is not an order payment.
// Returns null when the reference is not a transport payment either.
export const handleTransportCallback = async (client: any, cfg: PvitConfig, callback: PvitCallback): Promise<Response | null> => {
  const { data: payment, error } = await client
    .from('transport_payments')
    .select(SELECT_TRANSPORT_PAYMENT)
    .eq('internal_reference', callback.merchantReferenceId)
    .maybeSingle()
  if (error) throw new Error(`transport payment lookup: ${error.message}`)
  if (!payment) return null

  // Refund notifications (GIVE_CHANGE) are not handled here: acknowledge only.
  if (callback.transactionOperation && callback.transactionOperation !== 'PAYMENT') {
    return json(buildAck(callback))
  }

  if (payment.provider_transaction_id && payment.provider_transaction_id !== callback.transactionId) {
    console.error('[PVIT] Transport callback transaction id differs from the stored one', { reference: callback.merchantReferenceId })
    return json({ error: 'Transaction mismatch' }, 409)
  }

  let current = payment
  if (!payment.provider_transaction_id) {
    ensure(
      'provider id',
      await client.from('transport_payments').update({ provider_transaction_id: callback.transactionId }).eq('id', payment.id),
    )
    current = { ...payment, provider_transaction_id: callback.transactionId }
  }

  // The webhook payload is a hint, not a proof: PVIT's status API decides.
  const claimed = mapPvitStatus(callback.status)
  if (claimed === 'confirmed' && !isReportedAmountValid(Number(current.amount), callback.amount)) {
    console.error('[PVIT] Transport callback amount mismatch', { reference: callback.merchantReferenceId, reported: callback.amount })
    return json({ error: 'Amount mismatch' }, 409)
  }

  const outcome = await reconcileTransportPayment(client, cfg, current)
  if (!outcome.ok) {
    if (outcome.kind === 'unavailable') return json({ error: 'Verification unavailable' }, 502)
    return json({ error: 'Verification failed' }, 409)
  }
  if (!outcome.ignored && outcome.applied !== claimed) {
    console.warn('[PVIT] Transport callback status differs from the status API', {
      reference: callback.merchantReferenceId,
      claimed,
      verified: outcome.applied,
    })
  }
  return json(buildAck(callback))
}

// ---------------------------------------------------------- manual sync (dispatched)

// Called by the shared sync endpoint when the reference is not an order payment.
// Returns null when no transport payment matches.
export const syncTransportPayment = async (
  client: any,
  cfg: PvitConfig,
  userId: string,
  isAdmin: boolean,
  lookup: { reference: string; transactionId: string },
): Promise<Response | null> => {
  let query = client.from('transport_payments').select(SELECT_TRANSPORT_PAYMENT)
  query = lookup.reference ? query.eq('internal_reference', lookup.reference) : query.eq('provider_transaction_id', lookup.transactionId)
  const { data: payment, error } = await query.maybeSingle()
  if (error) throw new Error(`transport payment lookup: ${error.message}`)
  if (!payment) return null

  const { data: driver } = await client.from('drivers').select('id').eq('id', payment.driver_id).eq('user_id', userId).maybeSingle()
  if (!(payment.user_id === userId || !!driver || isAdmin)) return json({ error: 'Forbidden' }, 403)

  const outcome = await reconcileTransportPayment(client, cfg, payment)
  if (!outcome.ok) {
    return json(
      { success: false, error: { message: 'Status lookup failed', code: outcome.kind === 'unavailable' ? 'PROVIDER_UNAVAILABLE' : 'VERIFICATION_FAILED' } },
      outcome.kind === 'unavailable' ? 502 : 409,
    )
  }
  const { data: updated } = await client.from('transport_payments').select('*').eq('id', payment.id).single()
  return json({ success: true, data: { paymentTransaction: updated, status: outcome.applied } })
}

// ---------------------------------------------------------- public handler

export const initiateTransportPayment = (input: InitInput) =>
  withCors(input.req, () => initiateTransportPaymentImpl(input))
