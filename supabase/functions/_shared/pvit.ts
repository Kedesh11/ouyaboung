// PVIT payment handlers (Deno Edge Functions).
//
// Flow: initiate (split payment, status PENDING) -> customer confirms on the
// phone -> PVIT webhook -> we re-check the status with PVIT's status API
// before changing anything -> order confirmed + settlement ledger written.
//
// Security model:
//  * PVIT does not sign webhooks: a callback is never trusted by itself, the
//    status is always confirmed with the status API (authenticated by our
//    X-Secret) before an order is confirmed or a payment is failed.
//  * The caller IP is checked against PVIT's published addresses (mode
//    PVIT_CALLBACK_IP_MODE: enforce | report (default) | off).
//  * The client only ever sends orderId / phone / operator; amount, shop,
//    beneficiary and commission are resolved server-side.
//  * Every database write is checked; a failure answers 500 so the state
//    stays recoverable (confirmations are idempotent and can be replayed).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  canTransitionPaymentStatus,
  DEFAULT_INITIATION_WINDOW_MS,
  DEFAULT_IN_FLIGHT_WINDOW_MS,
  DEFAULT_MAX_INITIATIONS_PER_WINDOW,
  inFlightWindowStart,
  initiationWindowStart,
  isReportedAmountValid,
} from './payment-guards.ts'
import {
  beneficiaryCodeFor,
  buildAck,
  buildSplitPayload,
  computeSplit,
  evaluateCallbackIp,
  generateReference,
  hasOperatorPrefix,
  isFinalStatus,
  mapPvitStatus,
  normalizeLocalPhone,
  parseCallback,
  parseCommissionRate,
  parseInitiationResponse,
  parseCsv,
  parseIpMode,
  parsePositiveInt,
  resolveAllowedOrigin,
  parseStatusResponse,
  phoneValidationMessage,
  toLegacyStatus,
  toPvitOperator,
  type Operator,
} from './pvit-core.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const fail = (status: number, message: string, code: string, extra: Record<string, unknown> = {}) =>
  json({ success: false, error: { message, code, ...extra } }, status)

const getEnv = (name: string): string => Deno.env.get(name)?.trim() || ''

// CORS for the browser-facing functions. The allowed origins come from
// ALLOWED_ORIGINS (comma separated, e.g. the app URL); unset = any origin
// (local development only). The webhook is server-to-server and has no CORS.
const withCors = async (req: Request, run: () => Promise<Response>): Promise<Response> => {
  const res = await run()
  const headers = new Headers(res.headers)
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
  const origin = resolveAllowedOrigin(req.headers.get('origin'), parseCsv(getEnv('ALLOWED_ORIGINS')))
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    if (origin !== '*') headers.set('Vary', 'Origin')
  } else {
    headers.delete('Access-Control-Allow-Origin')
  }
  return new Response(res.body, { status: res.status, headers })
}

const maskPhone = (phone: string) => `${phone.slice(0, 3)}****${phone.slice(-2)}`

const getServiceClient = () => createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

const getUserClient = (authHeader: string) =>
  createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  })

// Throws when a Supabase write failed, so the handler can answer 500.
const ensure = (label: string, res: any) => {
  if (res?.error) throw new Error(`${label}: ${res.error.message || res.error.code || 'db error'}`)
  return res
}

// ------------------------------------------------------------------- config

type PvitConfig = {
  baseUrl: string
  commissionRate: number
  maxInitiations: number
  initiationWindowMs: number
  inFlightWindowMs: number
  operationAccountCode: string
  callbackUrlCode: string
  codeUrlPayment: string
  codeUrlStatus: string
  codeUrlSecret: string
  codeUrlKyc: string
  secretPassword: string
  ownerCharge: 'CUSTOMER' | 'MERCHANT'
}

// Everything comes from the environment: no URL, rate or limit is hard-coded.
// Returns null (=> 503 "not configured") when a required value is missing.
const readConfig = (): PvitConfig | null => {
  const commissionRate = parseCommissionRate(getEnv('PLATFORM_COMMISSION_RATE'))
  const cfg = {
    baseUrl: getEnv('PVIT_BASE_URL').replace(/\/$/, ''),
    commissionRate,
    maxInitiations: parsePositiveInt(getEnv('PAYMENT_MAX_INITIATIONS_PER_WINDOW'), DEFAULT_MAX_INITIATIONS_PER_WINDOW),
    initiationWindowMs:
      parsePositiveInt(getEnv('PAYMENT_INITIATION_WINDOW_MINUTES'), DEFAULT_INITIATION_WINDOW_MS / 60_000) * 60_000,
    inFlightWindowMs:
      parsePositiveInt(getEnv('PAYMENT_IN_FLIGHT_WINDOW_MINUTES'), DEFAULT_IN_FLIGHT_WINDOW_MS / 60_000) * 60_000,
    operationAccountCode: getEnv('PVIT_OPERATION_ACCOUNT_CODE'),
    callbackUrlCode: getEnv('PVIT_CALLBACK_URL_CODE'),
    codeUrlPayment: getEnv('PVIT_CODE_URL_PAYMENT'),
    codeUrlStatus: getEnv('PVIT_CODE_URL_STATUS'),
    codeUrlSecret: getEnv('PVIT_CODE_URL_SECRET'),
    codeUrlKyc: getEnv('PVIT_CODE_URL_KYC'),
    secretPassword: getEnv('PVIT_SECRET_PASSWORD'),
    ownerCharge: getEnv('PVIT_OWNER_CHARGE') === 'CUSTOMER' ? 'CUSTOMER' : 'MERCHANT',
  } as PvitConfig
  const required: Array<keyof PvitConfig> = ['baseUrl', 'operationAccountCode', 'codeUrlSecret', 'secretPassword']
  if (cfg.commissionRate === null || !required.every((k) => cfg[k])) return null
  return cfg
}

// ------------------------------------------------------------------- secret

const SECRET_SAFETY_MARGIN_MS = 60_000

// X-Secret lives 3600 s. The current one is shared through a service-only
// table; it is renewed when missing/expiring (or forced after an auth error).
const getSecret = async (client: any, cfg: PvitConfig, force = false): Promise<string> => {
  if (!force) {
    const { data } = await client
      .from('payment_provider_secrets')
      .select('secret,expires_at')
      .eq('provider', 'pvit')
      .eq('account_code', cfg.operationAccountCode)
      .maybeSingle()
    if (data?.secret && new Date(data.expires_at).getTime() - Date.now() > SECRET_SAFETY_MARGIN_MS) {
      return data.secret
    }
  }

  const response = await fetch(`${cfg.baseUrl}/v2/${cfg.codeUrlSecret}/renew-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      operationAccountCode: cfg.operationAccountCode,
      password: cfg.secretPassword,
    }).toString(),
  })
  const body: any = await response.json().catch(() => ({}))
  if (!response.ok || !body?.secret) {
    throw new Error(`PVIT renew-secret failed (HTTP ${response.status})`)
  }

  const expiresInMs = (Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600) * 1000
  ensure(
    'cache secret',
    await client.from('payment_provider_secrets').upsert(
      {
        provider: 'pvit',
        account_code: cfg.operationAccountCode,
        secret: body.secret,
        expires_at: new Date(Date.now() + expiresInMs).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,account_code' },
    ),
  )
  return body.secret
}

// PVIT answers errors as {status_code, error, message}; the docs also show {code}.
const providerErrorCode = (body: any): number => Number(body?.status_code ?? body?.code ?? body?.error?.code)

// Authenticated call to PVIT; one automatic retry with a fresh secret when
// the secret was rejected (3100 AUTHENTICATION_FAILED).
const pvitFetch = async (client: any, cfg: PvitConfig, url: string, init: RequestInit = {}) => {
  const call = async (force: boolean) => {
    const secret = await getSecret(client, cfg, force)
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), 'X-Secret': secret },
    })
    const body: any = await response.json().catch(() => ({}))
    return { response, body }
  }
  let result = await call(false)
  if (result.response.status === 403 && providerErrorCode(result.body) === 3100) result = await call(true)
  return result
}

// ----------------------------------------------------------------- wallet row

type Wallet = { id: string; wallet_id: string }

// The platform "wallet" row is the PVIT operation account of Ouyaboung.
const getOrCreatePlatformWallet = async (client: any, cfg: PvitConfig): Promise<Wallet> => {
  const { data: existing, error } = await client
    .from('platform_payment_wallets')
    .select('id,wallet_id')
    .eq('provider', 'pvit')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`platform wallet lookup: ${error.message}`)
  if (existing?.wallet_id) return existing

  const { data: created, error: insertError } = await client
    .from('platform_payment_wallets')
    .insert({
      provider: 'pvit',
      wallet_id: cfg.operationAccountCode,
      callback_url: `${getEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/pvit-callback`,
      is_active: true,
    })
    .select('id,wallet_id')
    .single()
  if (insertError || !created) throw new Error(`platform wallet create: ${insertError?.message || 'unknown'}`)
  return created
}

type PayoutAccount = { id: string; operator: string; normalized_msisdn: string }

const getMerchantPayoutAccount = async (client: any, merchantId: string): Promise<PayoutAccount | null> => {
  const { data, error } = await client
    .from('merchant_payout_accounts')
    .select('id,operator,normalized_msisdn')
    .eq('merchant_id', merchantId)
    .eq('provider', 'pvit')
    .eq('verification_status', 'verified')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`payout account lookup: ${error.message}`)
  return data
}

// ---------------------------------------------------------------- initiation

type InitInput = { req: Request }

const initiatePvitPaymentImpl = async ({ req }: InitInput) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return fail(405, 'Method not allowed', 'METHOD_NOT_ALLOWED')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail(401, 'Unauthorized', 'NO_AUTH_HEADER')

  const serviceClient = getServiceClient()
  const { data: { user }, error: authError } = await getUserClient(authHeader).auth.getUser()
  if (authError || !user) return fail(401, 'Invalid token', 'AUTH_FAILED')

  const body: any = await req.json().catch(() => ({}))
  const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
  const phone = normalizeLocalPhone(body?.phone)
  if (!orderId || !phone) return fail(400, 'Missing required fields', 'INVALID_PAYLOAD')

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

  console.log('[PVIT] Initiating payment', { orderId, operator, phone: maskPhone(phone) })

  try {
    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('id,merchant_id,user_id,status,total_price,food_item_id')
      .eq('id', orderId)
      .single()
    if (orderError || !order) return fail(404, 'Order not found', 'ORDER_NOT_FOUND')
    if (order.user_id !== user.id) return fail(403, 'Unauthorized access to order', 'ORDER_OWNERSHIP')
    if (order.status !== 'pending') return fail(409, 'Order is not awaiting payment', 'INVALID_ORDER_STATUS')

    const amount = Math.round(Number(order.total_price))
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, 'Invalid order amount', 'INVALID_AMOUNT')

    // Per-user rate limit across all orders.
    const { data: recent } = await serviceClient
      .from('payment_transactions')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', initiationWindowStart(Date.now(), cfg.initiationWindowMs))
      .limit(cfg.maxInitiations)
    if (recent && recent.length >= cfg.maxInitiations) {
      return fail(429, 'Trop de tentatives de paiement. Reessayez dans quelques minutes.', 'TOO_MANY_ATTEMPTS')
    }

    // One payment at a time per order (double click / retry).
    const { data: inFlight } = await serviceClient
      .from('payment_transactions')
      .select('id')
      .eq('order_id', order.id)
      .in('status', ['initiated', 'pending'])
      .gte('created_at', inFlightWindowStart(Date.now(), cfg.inFlightWindowMs))
      .limit(1)
    if (inFlight && inFlight.length > 0) {
      return fail(
        409,
        'Un paiement est deja en cours pour cette commande. Validez la demande sur votre telephone.',
        'PAYMENT_IN_PROGRESS',
      )
    }

    const payout = await getMerchantPayoutAccount(serviceClient, order.merchant_id)
    if (!payout) {
      return fail(
        409,
        'Cette boutique n\'a pas encore de compte Mobile Money verifie pour recevoir les reversements.',
        'MERCHANT_PAYOUT_NOT_VERIFIED',
      )
    }

    const wallet = await getOrCreatePlatformWallet(serviceClient, cfg)
    const reference = generateReference(order.id)
    const { feeAmount, merchantNetAmount } = computeSplit(amount, cfg.commissionRate)
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
      orderId: order.id,
      merchantNetAmount,
      beneficiary: {
        msisdn: payout.normalized_msisdn,
        operatorCode: toPvitOperator(payoutOperator),
        code: beneficiaryCode,
      },
    })

    const legacy = ensure(
      'legacy transaction',
      await serviceClient
        .from('transactions')
        .insert({
          order_id: order.id,
          merchant_id: order.merchant_id,
          user_id: user.id,
          phone,
          amount,
          account_code: cfg.operationAccountCode,
          product: 'pvit',
          agent: 'PVIT',
          airtel_fees: 0,
          pvit_fees: 0,
          app_fees: 0,
          total_amount: amount,
          operator: toPvitOperator(operator),
          status: 'PENDING',
          provider: 'pvit',
          created_at: new Date().toISOString(),
        })
        .select()
        .single(),
    ).data

    const payment = ensure(
      'payment ledger',
      await serviceClient
        .from('payment_transactions')
        .insert({
          order_id: order.id,
          food_item_id: order.food_item_id,
          merchant_id: order.merchant_id,
          user_id: user.id,
          legacy_transaction_id: legacy.id,
          platform_wallet_id: wallet.id,
          provider: 'pvit',
          operator,
          internal_reference: reference,
          status: 'initiated',
          amount,
          // What we sent to PVIT, plus the split decided at initiation (the
          // confirmation reads it back instead of recomputing the commission).
          raw_request: {
            ...pvitPayload,
            ouyaboung: { payoutAccountId: payout.id, beneficiaryCode, feeAmount, merchantNetAmount },
          },
        })
        .select()
        .single(),
    ).data

    ensure(
      'legacy link',
      await serviceClient
        .from('transactions')
        .update({ payment_transaction_id: payment.id, reference })
        .eq('id', legacy.id),
    )

    let providerOk = false
    let providerBody: any = {}
    let networkError = false
    try {
      const result = await pvitFetch(serviceClient, cfg, `${cfg.baseUrl}/v2/${cfg.codeUrlPayment}/rest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Callback-MediaType': 'application/json' },
        body: JSON.stringify(pvitPayload),
      })
      providerBody = result.body
      const parsedStatus = parseInitiationResponse(providerBody).status?.toUpperCase()
      providerOk = result.response.ok && parsedStatus !== 'FAILED'
    } catch (error) {
      // Unknown outcome: the request may have reached PVIT. Keep the payment
      // pending so a late callback or a status check can still resolve it.
      networkError = true
      console.error('[PVIT] initiation transport error', error instanceof Error ? error.message : error)
    }

    const parsed = parseInitiationResponse(providerBody)
    // The initiation answer never confirms anything: only a webhook or a
    // status check can. Success here means "request accepted, awaiting customer".
    const internalStatus = providerOk || networkError ? 'pending' : 'failed'
    const legacyStatus = toLegacyStatus(internalStatus)
    const message = networkError
      ? 'Le fournisseur de paiement est momentanement indisponible.'
      : providerOk
        ? 'Paiement initie. Validez la demande sur votre telephone.'
        : parsed.message || 'Echec de l\'initialisation du paiement'

    const updatedPayment = ensure(
      'payment update',
      await serviceClient
        .from('payment_transactions')
        .update({
          provider_transaction_id: parsed.providerTransactionId,
          provider_status: parsed.status,
          provider_result: parsed.statusCode,
          status: internalStatus,
          raw_response: providerBody,
        })
        .eq('id', payment.id)
        .select()
        .single(),
    ).data

    const updatedLegacy = ensure(
      'legacy update',
      await serviceClient
        .from('transactions')
        .update({
          q_gabon_response: providerBody,
          transaction_id: parsed.providerTransactionId,
          merchant_reference_id: reference,
          reference,
          status: legacyStatus,
          provider_status: parsed.status,
          provider_result: parsed.statusCode,
          status_code: parsed.statusCode || '',
          message,
        })
        .eq('id', legacy.id)
        .select()
        .single(),
    ).data

    if (networkError) return fail(502, message, 'PROVIDER_UNAVAILABLE', { reference })

    return json(
      {
        success: providerOk,
        data: {
          transaction: updatedLegacy,
          paymentTransaction: updatedPayment,
          transactionId: legacy.id,
          paymentTransactionId: payment.id,
          qGabonReference: reference,
          totalAmount: amount,
          fees: { airtel: 0, pvit: 0, app: 0, total: 0 },
          status: legacyStatus,
          message,
        },
        ...(providerOk ? {} : { error: { message, code: 'PROVIDER_REJECTED', providerCode: providerErrorCode(providerBody) || null } }),
      },
      providerOk ? 200 : 400,
    )
  } catch (error) {
    console.error('[PVIT] initiation failed', error instanceof Error ? error.message : error)
    return fail(500, 'Erreur interne lors de l\'initialisation du paiement', 'INTERNAL_ERROR')
  }
}

// ------------------------------------------------------------- confirmation

const SELECT_PAYMENT = '*, platform_payment_wallets(id,wallet_id)'

// Writes everything a confirmed payment implies. Idempotent: it can be replayed
// after a partial failure (settlements are unique per payment and recipient).
const applyConfirmation = async (client: any, payment: any, provider: { providerTransactionId: string | null }, raw: unknown) => {
  const nowIso = new Date().toISOString()

  ensure(
    'payment confirm',
    await client
      .from('payment_transactions')
      .update({
        provider_transaction_id: provider.providerTransactionId || payment.provider_transaction_id,
        provider_status: 'SUCCESS',
        status: 'confirmed',
        raw_callback: raw,
        confirmed_at: payment.confirmed_at || nowIso,
      })
      .eq('id', payment.id),
  )

  ensure(
    'order confirm',
    await client
      .from('orders')
      .update({ status: 'confirmed', confirmed_at: nowIso })
      .eq('id', payment.order_id)
      .eq('status', 'pending'),
  )

  // If the customer's order was cancelled meanwhile, the shop has already been
  // paid by the split: flag it for a manual refund instead of silently settling.
  const { data: currentOrder } = await client.from('orders').select('status').eq('id', payment.order_id).maybeSingle()
  const orderCancelled = currentOrder?.status === 'cancelled'
  if (orderCancelled) {
    console.error('[PVIT] REFUND_REQUIRED: payment confirmed for a cancelled order', {
      paymentId: payment.id,
      orderId: payment.order_id,
    })
  }

  const split = payment.raw_request?.ouyaboung || {}
  const amount = Number(payment.amount)
  const merchantNet = Number.isFinite(Number(split.merchantNetAmount)) ? Number(split.merchantNetAmount) : amount
  const fee = Number.isFinite(Number(split.feeAmount)) ? Number(split.feeAmount) : amount - merchantNet
  const status = orderCancelled ? 'manual_review' : 'paid'

  const rows = [
    {
      recipient_type: 'merchant',
      merchant_payout_account_id: split.payoutAccountId || null,
      disbursement_id: split.beneficiaryCode || null,
      gross_amount: amount,
      fee_amount: fee,
      net_amount: merchantNet,
    },
    {
      recipient_type: 'platform',
      merchant_payout_account_id: null,
      disbursement_id: null,
      gross_amount: amount,
      fee_amount: 0,
      net_amount: fee,
    },
  ]

  let merchantStatus = status
  for (const row of rows) {
    const { data: existing } = await client
      .from('payment_settlements')
      .select('id,status')
      .eq('payment_transaction_id', payment.id)
      .eq('recipient_type', row.recipient_type)
      .maybeSingle()
    if (existing) {
      if (row.recipient_type === 'merchant') merchantStatus = existing.status
      continue
    }
    const { error } = await client.from('payment_settlements').insert({
      payment_transaction_id: payment.id,
      order_id: payment.order_id,
      merchant_id: payment.merchant_id,
      ...row,
      status,
      provider_transfer_status: 'split',
      paid_at: status === 'paid' ? nowIso : null,
    })
    // A concurrent confirmation won the race on the unique index: fine.
    if (error && error.code !== '23505') throw new Error(`settlement insert: ${error.message}`)
  }

  ensure(
    'legacy confirm',
    await client
      .from('transactions')
      .update({
        status: 'SUCCESS',
        transaction_id: provider.providerTransactionId || payment.provider_transaction_id,
        provider_status: 'SUCCESS',
        status_code: '200',
        message: 'Paiement confirme',
        completed_at: nowIso,
        settlement_status: merchantStatus,
      })
      .eq('id', payment.legacy_transaction_id),
  )
}

const applyNonConfirmed = async (client: any, payment: any, internal: string, providerStatus: string | null, raw: unknown) => {
  ensure(
    'payment update',
    await client
      .from('payment_transactions')
      .update({ provider_status: providerStatus, status: internal, raw_callback: raw })
      .eq('id', payment.id),
  )
  ensure(
    'legacy update',
    await client
      .from('transactions')
      .update({
        status: toLegacyStatus(internal),
        provider_status: providerStatus,
        status_code: providerStatus || '',
        message: internal === 'failed' ? 'Paiement echoue' : 'Paiement en attente',
        completed_at: isFinalStatus(internal) ? new Date().toISOString() : null,
      })
      .eq('id', payment.legacy_transaction_id),
  )
}

type Verification =
  | { ok: true; internal: string; providerStatus: string | null; amount: number | null; raw: unknown }
  | { ok: false; kind: 'unavailable' | 'mismatch'; reason: string }

// Asks PVIT for the authoritative state of a payment.
//
// Verified against the sandbox: the status API finds a transaction by OUR
// merchant reference (merchant_reference_id); the PVIT id (PAY...) returned at
// initiation is not found (4006). The PVIT id is only tried as a fallback.
const verifyWithProvider = async (client: any, cfg: PvitConfig, payment: any): Promise<Verification> => {
  if (!cfg.codeUrlStatus) return { ok: false, kind: 'unavailable', reason: 'status API not configured' }
  try {
    const lookup = (id: string) => {
      const query = new URLSearchParams({
        transactionId: id,
        accountOperationCode: cfg.operationAccountCode,
        transactionOperation: 'PAYMENT',
      })
      return pvitFetch(client, cfg, `${cfg.baseUrl}/${cfg.codeUrlStatus}/status?${query}`, { method: 'GET' })
    }
    const notFound = (r: { response: Response; body: any }) =>
      r.response.status === 404 || providerErrorCode(r.body) === 4006

    let result = await lookup(payment.internal_reference)
    if (notFound(result) && payment.provider_transaction_id) result = await lookup(payment.provider_transaction_id)

    const { response, body } = result
    if (!response.ok) return { ok: false, kind: 'unavailable', reason: `status API HTTP ${response.status}` }
    const parsed = parseStatusResponse(body)
    if (parsed.merchantReferenceId && parsed.merchantReferenceId !== payment.internal_reference) {
      return { ok: false, kind: 'mismatch', reason: 'reference mismatch' }
    }
    return { ok: true, internal: mapPvitStatus(parsed.status), providerStatus: parsed.status, amount: parsed.amount, raw: body }
  } catch (error) {
    return { ok: false, kind: 'unavailable', reason: error instanceof Error ? error.message : 'status lookup failed' }
  }
}

// Shared by the webhook and the manual sync: verify, then apply what PVIT says.
const reconcile = async (client: any, cfg: PvitConfig, payment: any) => {
  const verified = await verifyWithProvider(client, cfg, payment)
  if (!verified.ok) return { ok: false as const, kind: verified.kind, reason: verified.reason }

  if (!canTransitionPaymentStatus(payment.status, verified.internal)) {
    return { ok: true as const, applied: payment.status, ignored: true }
  }
  if (verified.internal === 'confirmed') {
    // The amount must be reported by PVIT and match the order exactly.
    if (verified.amount === null || verified.amount <= 0 || !isReportedAmountValid(Number(payment.amount), verified.amount)) {
      console.error('[PVIT] Amount mismatch', { reference: payment.internal_reference, expected: payment.amount, reported: verified.amount })
      return { ok: false as const, kind: 'mismatch' as const, reason: 'amount mismatch' }
    }
    await applyConfirmation(client, payment, { providerTransactionId: payment.provider_transaction_id }, verified.raw)
  } else if (verified.internal !== payment.status) {
    await applyNonConfirmed(client, payment, verified.internal, verified.providerStatus, verified.raw)
  }
  return { ok: true as const, applied: verified.internal, ignored: false }
}

// ------------------------------------------------------------------ webhook

export const handlePvitCallback = async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const mode = parseIpMode(getEnv('PVIT_CALLBACK_IP_MODE'))
  if (mode !== 'off') {
    const allowlist = parseCsv(getEnv('PVIT_CALLBACK_ALLOWED_IPS'))
    const { allowed, ip } = evaluateCallbackIp(req.headers.get('x-forwarded-for'), allowlist)
    if (!allowed) {
      console.warn('[PVIT] Callback from an address outside the PVIT allowlist', {
        ip,
        mode,
        allowlistConfigured: allowlist.length > 0,
      })
      if (mode === 'enforce') return json({ error: 'Forbidden' }, 403)
    }
  }

  const payload = await req.json().catch(() => null)
  const callback = parseCallback(payload)
  if (!callback) return json({ error: 'Invalid callback payload' }, 400)

  const cfg = readConfig()
  if (!cfg) return json({ error: 'Payment provider not configured' }, 503)

  try {
    const client = getServiceClient()
    const { data: payment, error } = await client
      .from('payment_transactions')
      .select(SELECT_PAYMENT)
      .eq('internal_reference', callback.merchantReferenceId)
      .maybeSingle()
    if (error) throw new Error(`payment lookup: ${error.message}`)
    if (!payment) return json({ error: 'Transaction not found' }, 404)

    // Refund notifications (GIVE_CHANGE) are not handled here: acknowledge only.
    if (callback.transactionOperation && callback.transactionOperation !== 'PAYMENT') {
      return json(buildAck(callback))
    }

    if (payment.provider_transaction_id && payment.provider_transaction_id !== callback.transactionId) {
      console.error('[PVIT] Callback transaction id differs from the stored one', {
        reference: callback.merchantReferenceId,
      })
      return json({ error: 'Transaction mismatch' }, 409)
    }

    // First sight of the PVIT id when the initiation answer was lost.
    let current = payment
    if (!payment.provider_transaction_id) {
      ensure(
        'provider id',
        await client.from('payment_transactions').update({ provider_transaction_id: callback.transactionId }).eq('id', payment.id),
      )
      current = { ...payment, provider_transaction_id: callback.transactionId }
    }

    // The webhook payload is a hint, not a proof: PVIT's status API decides.
    const claimed = mapPvitStatus(callback.status)
    if (claimed === 'confirmed' && !isReportedAmountValid(Number(current.amount), callback.amount)) {
      console.error('[PVIT] Callback amount mismatch', { reference: callback.merchantReferenceId, reported: callback.amount })
      return json({ error: 'Amount mismatch' }, 409)
    }

    const outcome = await reconcile(client, cfg, current)
    if (!outcome.ok) {
      if (outcome.kind === 'unavailable') return json({ error: 'Verification unavailable' }, 502)
      return json({ error: 'Verification failed' }, 409)
    }
    if (!outcome.ignored && outcome.applied !== claimed) {
      console.warn('[PVIT] Callback status differs from the status API', {
        reference: callback.merchantReferenceId,
        claimed,
        verified: outcome.applied,
      })
    }

    return json(buildAck(callback))
  } catch (error) {
    console.error('[PVIT] callback failed', error instanceof Error ? error.message : error)
    return json({ error: 'Internal error' }, 500)
  }
}

// --------------------------------------------------------------------- sync

const syncPvitTransactionStatusImpl = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authError } = await getUserClient(authHeader).auth.getUser()
  if (authError || !user) return json({ error: 'Invalid token' }, 401)

  const body: any = await req.json().catch(() => ({}))
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
  const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : ''
  if (!reference && !transactionId) return json({ error: 'Missing reference or transactionId' }, 400)

  const cfg = readConfig()
  if (!cfg) return json({ error: 'Payment provider not configured' }, 503)

  try {
    const client = getServiceClient()
    let query = client.from('payment_transactions').select(SELECT_PAYMENT)
    query = reference ? query.eq('internal_reference', reference) : query.eq('provider_transaction_id', transactionId)
    const { data: payment, error } = await query.maybeSingle()
    if (error || !payment) return json({ error: 'Transaction not found' }, 404)

    const { data: profile } = await client.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
    const { data: merchant } = await client.from('merchants').select('id').eq('user_id', user.id).maybeSingle()
    const canRead = payment.user_id === user.id || merchant?.id === payment.merchant_id || profile?.role === 'admin'
    if (!canRead) return json({ error: 'Forbidden' }, 403)

    const outcome = await reconcile(client, cfg, payment)
    if (!outcome.ok) {
      return json(
        { success: false, error: { message: 'Status lookup failed', code: outcome.kind === 'unavailable' ? 'PROVIDER_UNAVAILABLE' : 'VERIFICATION_FAILED' } },
        outcome.kind === 'unavailable' ? 502 : 409,
      )
    }

    const { data: updated } = await client.from('payment_transactions').select('*').eq('id', payment.id).single()
    return json({ success: true, data: { paymentTransaction: updated, status: outcome.applied } })
  } catch (error) {
    console.error('[PVIT] sync failed', error instanceof Error ? error.message : error)
    return json({ error: 'Internal error' }, 500)
  }
}

// ------------------------------------------------------------ payout accounts

const UNKNOWN_CUSTOMER_CODES = [3023, 4007]

// Verifies a shop's Mobile Money number with PVIT's KYC API. The merchant
// cannot set `verified` themselves (RLS): only this function (service role) can.
const verifyPayoutAccountImpl = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail(401, 'Unauthorized', 'NO_AUTH_HEADER')

  const { data: { user }, error: authError } = await getUserClient(authHeader).auth.getUser()
  if (authError || !user) return fail(401, 'Invalid token', 'AUTH_FAILED')

  const body: any = await req.json().catch(() => ({}))
  const accountId = typeof body?.accountId === 'string' ? body.accountId : ''
  if (!accountId) return fail(400, 'Missing accountId', 'INVALID_PAYLOAD')

  const cfg = readConfig()
  if (!cfg || !cfg.codeUrlKyc) return fail(503, 'La verification des numeros n\'est pas encore configuree.', 'PAYMENT_NOT_CONFIGURED')

  try {
    const client = getServiceClient()
    const { data: account } = await client
      .from('merchant_payout_accounts')
      .select('id,merchant_id,operator,normalized_msisdn,verification_status,is_active')
      .eq('id', accountId)
      .maybeSingle()
    if (!account) return fail(404, 'Account not found', 'ACCOUNT_NOT_FOUND')

    const { data: merchant } = await client.from('merchants').select('id,user_id').eq('id', account.merchant_id).maybeSingle()
    const { data: profile } = await client.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
    if (merchant?.user_id !== user.id && profile?.role !== 'admin') return fail(403, 'Forbidden', 'FORBIDDEN')

    if (account.verification_status === 'verified') return json({ success: true, data: { status: 'verified' } })
    if (account.verification_status === 'disabled') return fail(409, 'Account disabled', 'ACCOUNT_DISABLED')

    const operator: Operator = account.operator === 'moov' ? 'moov' : 'airtel'
    if (!hasOperatorPrefix(account.normalized_msisdn, operator)) {
      return fail(400, phoneValidationMessage(operator), 'INVALID_PHONE_OPERATOR')
    }

    const query = new URLSearchParams({
      customerAccountNumber: account.normalized_msisdn,
      operatorCode: toPvitOperator(operator),
    })
    const { response, body: kyc } = await pvitFetch(client, cfg, `${cfg.baseUrl}/v2/${cfg.codeUrlKyc}/kyc?${query}`, { method: 'GET' })

    const errorCode = providerErrorCode(kyc)
    const unknownCustomer =
      UNKNOWN_CUSTOMER_CODES.includes(errorCode) || (response.status === 404 && !Number.isFinite(errorCode))
    if (unknownCustomer) {
      ensure(
        'account reject',
        await client
          .from('merchant_payout_accounts')
          .update({ verification_status: 'rejected', rejection_reason: 'Numero inconnu chez l\'operateur' })
          .eq('id', account.id),
      )
      return json({ success: false, error: { message: 'Numero inconnu chez l\'operateur', code: 'CUSTOMER_UNKNOWN' } }, 422)
    }
    if (!response.ok || !kyc?.data) {
      return fail(502, 'La verification est momentanement indisponible.', 'PROVIDER_UNAVAILABLE')
    }

    ensure(
      'account verify',
      await client
        .from('merchant_payout_accounts')
        .update({ verification_status: 'verified', rejection_reason: null, verified_at: new Date().toISOString() })
        .eq('id', account.id),
    )
    return json({ success: true, data: { status: 'verified' } })
  } catch (error) {
    console.error('[PVIT] payout verification failed', error instanceof Error ? error.message : error)
    return fail(500, 'Erreur interne', 'INTERNAL_ERROR')
  }
}

// ---------------------------------------------------------- public handlers

export const initiatePvitPayment = (input: InitInput) =>
  withCors(input.req, () => initiatePvitPaymentImpl(input))

export const syncPvitTransactionStatus = (req: Request) => withCors(req, () => syncPvitTransactionStatusImpl(req))

export const verifyPayoutAccount = (req: Request) => withCors(req, () => verifyPayoutAccountImpl(req))
