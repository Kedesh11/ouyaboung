import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Operator = 'airtel' | 'moov'

const VALID_AIRTEL_LOCAL_PREFIXES = ['74', '77', '76']
const VALID_MOOV_LOCAL_PREFIXES = ['66', '62', '65']

type PaymentInput = {
  req: Request
  operator: Operator
}

type PlatformWallet = {
  id: string
  wallet_id: string
  client_id: string | null
  client_secret_encrypted: string | null
}

type MerchantPayoutAccount = {
  id: string
  merchant_id: string
  operator: string
  disbursement_id: string | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const maskPhone = (phone: string) => `${phone.slice(0, 3)}****${phone.slice(-2)}`

const normalizePhone = (rawPhone: unknown): string => {
  if (typeof rawPhone !== 'string') return ''
  let cleaned = rawPhone.replace(/\D/g, '')

  if (cleaned.startsWith('241') && cleaned.length === 11) {
    cleaned = `0${cleaned.slice(3)}`
  }

  if (cleaned.length === 8) {
    cleaned = `0${cleaned}`
  }

  return cleaned
}

const hasOperatorPrefix = (phone: string, operator: Operator): boolean => {
  if (!/^0\d{8}$/.test(phone)) return false

  const localNumber = phone.slice(1)
  const prefixes = operator === 'airtel'
    ? VALID_AIRTEL_LOCAL_PREFIXES
    : VALID_MOOV_LOCAL_PREFIXES

  return prefixes.some((prefix) => localNumber.startsWith(prefix))
}

const getPhoneValidationMessage = (operator: Operator) => {
  if (operator === 'airtel') {
    return 'Numero Airtel invalide. Prefixes acceptes: 74, 77, 76.'
  }

  return 'Numero Libertis/Moov invalide. Prefixes acceptes: 66, 62, 65.'
}

const getEnv = (name: string): string => Deno.env.get(name)?.trim() || ''

const getServiceClient = () => createClient(
  getEnv('SUPABASE_URL'),
  getEnv('SUPABASE_SERVICE_ROLE_KEY'),
)

const getUserClient = (authHeader: string) => createClient(
  getEnv('SUPABASE_URL'),
  getEnv('SUPABASE_ANON_KEY'),
  { global: { headers: { Authorization: authHeader } } },
)

const getSingPayEndpoint = (operator: Operator): string => {
  const baseUrl = getEnv('SINGPAY_BASE_URL') || 'https://gateway.singpay.ga/v1'
  const path = operator === 'airtel' ? '/74/paiement' : '/62/paiement'
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

const getTransferEndpoint = (): string => {
  const baseUrl = getEnv('SINGPAY_BASE_URL') || 'https://gateway.singpay.ga/v1'
  return `${baseUrl.replace(/\/$/, '')}/transfer`
}

const getTransactionByReferenceEndpoint = (reference: string): string => {
  const baseUrl = getEnv('SINGPAY_BASE_URL') || 'https://gateway.singpay.ga/v1'
  return `${baseUrl.replace(/\/$/, '')}/transaction/api/search/by-reference/${encodeURIComponent(reference)}`
}

const getTransactionStatusEndpoint = (id: string): string => {
  const baseUrl = getEnv('SINGPAY_BASE_URL') || 'https://gateway.singpay.ga/v1'
  return `${baseUrl.replace(/\/$/, '')}/transaction/api/status/${encodeURIComponent(id)}`
}

const toSingPayOperator = (operator: Operator) =>
  operator === 'airtel' ? 'AIRTEL_MONEY' : 'MOOV_MONEY'

const parseSingPayTransaction = (payload: any) => {
  const transaction = payload?.transaction || payload?.data?.transaction || payload?.data || payload
  return {
    transaction,
    providerTransactionId: transaction?.id || transaction?._id || payload?.id || payload?.transaction_id || null,
    reference: transaction?.reference || payload?.reference || payload?.data?.reference || null,
    status: transaction?.status || payload?.status || payload?.data?.status || null,
    result: transaction?.result || payload?.result || payload?.data?.result || null,
    amount: Number(transaction?.amount || payload?.amount || payload?.data?.amount || 0),
    wallet: transaction?.portefeuille || payload?.portefeuille || payload?.data?.portefeuille || null,
    message: payload?.status?.message || payload?.message || payload?.data?.message || null,
  }
}

const mapProviderStatus = (status?: string | null, result?: string | null) => {
  if (result === 'Success') return 'confirmed'
  if (result === 'TimeOutError') return 'expired'
  if (['PasswordError', 'BalanceError', 'Error'].includes(result || '')) return 'failed'
  if (status === 'Terminate' && !result) return 'pending'
  if (status === 'Start' || status === 'Partenaire') return 'pending'
  return 'pending'
}

const mapLegacyStatus = (internalStatus: string) => {
  if (internalStatus === 'confirmed') return 'SUCCESS'
  if (internalStatus === 'expired') return 'TIMEOUT'
  if (internalStatus === 'failed') return 'FAILED'
  if (internalStatus === 'cancelled') return 'CANCELLED'
  return 'PENDING'
}

const generateReference = (orderId: string) => {
  const shortOrder = orderId.replace(/-/g, '').slice(0, 10).toUpperCase()
  const suffix = Date.now().toString(36).toUpperCase()
  return `OYB-${shortOrder}-${suffix}`
}

const getOrCreatePlatformWallet = async (client: any): Promise<PlatformWallet> => {
  const { data: existing, error } = await client
    .from('platform_payment_wallets')
    .select('id,wallet_id,client_id,client_secret_encrypted')
    .eq('provider', 'singpay')
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(`Wallet principal SingPay introuvable: ${error.message}`)
  if (existing?.wallet_id) return existing

  const walletId = getEnv('SINGPAY_PLATFORM_WALLET_ID')
  const clientId = getEnv('SINGPAY_CLIENT_ID')

  if (!walletId || !clientId || !getEnv('SINGPAY_CLIENT_SECRET')) {
    throw new Error('Configuration SingPay manquante: SINGPAY_PLATFORM_WALLET_ID, SINGPAY_CLIENT_ID, SINGPAY_CLIENT_SECRET')
  }

  const { data: created, error: insertError } = await client
    .from('platform_payment_wallets')
    .insert({
      provider: 'singpay',
      wallet_id: walletId,
      client_id: clientId,
      client_secret_encrypted: 'env:SINGPAY_CLIENT_SECRET',
      callback_url: `${getEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/payment-callback`,
      is_active: true,
    })
    .select('id,wallet_id,client_id,client_secret_encrypted')
    .single()

  if (insertError || !created) {
    throw new Error(`Impossible de creer le wallet principal SingPay: ${insertError?.message || 'unknown error'}`)
  }

  return created
}

const getMerchantPayoutAccount = async (
  client: any,
  merchantId: string,
): Promise<MerchantPayoutAccount | null> => {
  const { data, error } = await client
    .from('merchant_payout_accounts')
    .select('id,merchant_id,operator,disbursement_id')
    .eq('merchant_id', merchantId)
    .eq('provider', 'singpay')
    .eq('verification_status', 'verified')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Erreur lecture compte payout marchand: ${error.message}`)
  return data
}

const calculateSettlement = (amount: number) => {
  const commissionRate = Number(getEnv('PLATFORM_COMMISSION_RATE') || '0.10')
  const safeRate = Number.isFinite(commissionRate) && commissionRate >= 0 && commissionRate < 1
    ? commissionRate
    : 0.10
  const feeAmount = Math.round(amount * safeRate)
  return {
    feeAmount,
    merchantNetAmount: amount - feeAmount,
  }
}

const getSingPayHeaders = (platformWallet: PlatformWallet) => {
  const clientId = getEnv('SINGPAY_CLIENT_ID') || platformWallet.client_id || ''
  const clientSecret = getEnv('SINGPAY_CLIENT_SECRET')

  if (!clientId || !clientSecret || !platformWallet.wallet_id) {
    throw new Error('Configuration SingPay incomplete')
  }

  return {
    'Content-Type': 'application/json',
    'x-client-id': clientId,
    'x-client-secret': clientSecret,
    'x-wallet': platformWallet.wallet_id,
  }
}

export const initiateSingPayPayment = async ({ req, operator }: PaymentInput) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ success: false, error: { message: 'Unauthorized', code: 'NO_AUTH_HEADER' } }, 401)
  }

  const userClient = getUserClient(authHeader)
  const serviceClient = getServiceClient()

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return json({ success: false, error: { message: 'Invalid token', code: 'AUTH_FAILED' } }, 401)
  }

  const { phone: rawPhone, orderId } = await req.json()
  const phone = normalizePhone(rawPhone)
  if (!phone || !orderId) {
    return json({ success: false, error: { message: 'Missing required fields', code: 'INVALID_PAYLOAD' } }, 400)
  }

  if (!hasOperatorPrefix(phone, operator)) {
    return json({
      success: false,
      error: { message: getPhoneValidationMessage(operator), code: 'INVALID_PHONE_OPERATOR' },
    }, 400)
  }

  console.log('[SingPay] Initiating payment', { orderId, operator, phone: maskPhone(phone) })

  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .select('id,merchant_id,user_id,status,total_price,food_item_id')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return json({ success: false, error: { message: 'Order not found', code: 'ORDER_NOT_FOUND' } }, 404)
  }

  if (order.user_id !== user.id) {
    return json({ success: false, error: { message: 'Unauthorized access to order', code: 'ORDER_OWNERSHIP' } }, 403)
  }

  if (order.status !== 'pending') {
    return json({ success: false, error: { message: 'Order is not awaiting payment', code: 'INVALID_ORDER_STATUS' } }, 409)
  }

  const amount = Math.round(Number(order.total_price))
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ success: false, error: { message: 'Invalid order amount', code: 'INVALID_AMOUNT' } }, 400)
  }

  const platformWallet = await getOrCreatePlatformWallet(serviceClient)
  const payoutAccount = await getMerchantPayoutAccount(serviceClient, order.merchant_id)
  const requirePayout = getEnv('SINGPAY_REQUIRE_VERIFIED_PAYOUT') !== 'false'

  if (requirePayout && (!payoutAccount || !payoutAccount.disbursement_id)) {
    return json({
      success: false,
      error: {
        message: 'Cette boutique n’a pas encore de compte Mobile Money verifie pour recevoir les reversements.',
        code: 'MERCHANT_PAYOUT_NOT_VERIFIED',
      },
    }, 409)
  }

  let singPayHeaders: Record<string, string>
  try {
    singPayHeaders = getSingPayHeaders(platformWallet)
  } catch {
    return json({ success: false, error: { message: 'Configuration SingPay incomplete', code: 'SINGPAY_CONFIG_MISSING' } }, 500)
  }

  const reference = generateReference(order.id)
  const singPayPayload: Record<string, unknown> = {
    amount,
    reference,
    client_msisdn: phone,
    portefeuille: platformWallet.wallet_id,
    isTransfer: true,
  }

  if (getEnv('SINGPAY_PAYMENT_DISBURSEMENT_MODE') === 'merchant' && payoutAccount?.disbursement_id) {
    singPayPayload.disbursement = payoutAccount.disbursement_id
  }

  const { data: legacyTransaction, error: legacyInsertError } = await serviceClient
    .from('transactions')
    .insert({
      order_id: order.id,
      merchant_id: order.merchant_id,
      user_id: user.id,
      phone,
      amount,
      account_code: platformWallet.wallet_id,
      product: 'singpay',
      agent: 'SINGPAY',
      airtel_fees: 0,
      pvit_fees: 0,
      app_fees: 0,
      total_amount: amount,
      operator: toSingPayOperator(operator),
      status: 'PENDING',
      provider: 'singpay',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (legacyInsertError || !legacyTransaction) {
    return json({ success: false, error: { message: 'Failed to create transaction', code: 'DB_ERROR' } }, 500)
  }

  const { data: paymentTransaction, error: paymentTxError } = await serviceClient
    .from('payment_transactions')
    .insert({
      order_id: order.id,
      food_item_id: order.food_item_id,
      merchant_id: order.merchant_id,
      user_id: user.id,
      legacy_transaction_id: legacyTransaction.id,
      platform_wallet_id: platformWallet.id,
      provider: 'singpay',
      operator,
      internal_reference: reference,
      status: 'initiated',
      amount,
      raw_request: singPayPayload,
    })
    .select()
    .single()

  if (paymentTxError || !paymentTransaction) {
    return json({ success: false, error: { message: 'Failed to create payment ledger', code: 'PAYMENT_LEDGER_ERROR' } }, 500)
  }

  await serviceClient
    .from('transactions')
    .update({ payment_transaction_id: paymentTransaction.id, reference })
    .eq('id', legacyTransaction.id)

  let providerData: any
  let providerOk = false

  const response = await fetch(getSingPayEndpoint(operator), {
    method: 'POST',
    headers: singPayHeaders,
    body: JSON.stringify(singPayPayload),
  })
  providerData = await response.json().catch(() => ({ error: 'Invalid JSON response' }))
  providerOk = response.ok && providerData?.status?.success !== false && providerData?.success !== false

  const parsed = parseSingPayTransaction(providerData)
  const internalStatus = providerOk ? 'pending' : 'failed'
  const legacyStatus = mapLegacyStatus(internalStatus)

  const { data: updatedPaymentTransaction } = await serviceClient
    .from('payment_transactions')
    .update({
      provider_transaction_id: parsed.providerTransactionId,
      provider_status: parsed.status,
      provider_result: parsed.result,
      status: internalStatus,
      raw_response: providerData,
    })
    .eq('id', paymentTransaction.id)
    .select()
    .single()

  const { data: updatedLegacyTransaction } = await serviceClient
    .from('transactions')
    .update({
      q_gabon_response: providerData,
      transaction_id: parsed.providerTransactionId,
      merchant_reference_id: reference,
      reference,
      status: legacyStatus,
      provider_status: parsed.status,
      provider_result: parsed.result,
      status_code: parsed.status || '',
      message: parsed.message || (providerOk ? 'Paiement SingPay initie' : 'Echec initialisation SingPay'),
    })
    .eq('id', legacyTransaction.id)
    .select()
    .single()

  return json({
    success: providerOk,
    data: {
      transaction: updatedLegacyTransaction,
      paymentTransaction: updatedPaymentTransaction,
      transactionId: legacyTransaction.id,
      paymentTransactionId: paymentTransaction.id,
      qGabonReference: reference,
      singPayReference: reference,
      totalAmount: amount,
      fees: { airtel: 0, pvit: 0, app: 0, total: 0 },
      status: legacyStatus,
      message: providerOk ? 'Paiement SingPay initie. Validez la demande sur votre telephone.' : 'Echec initialisation SingPay',
    },
  }, providerOk ? 200 : 400)
}

const getProvidedWebhookSecret = (req: Request): string => {
  const bearer = req.headers.get('authorization')
  const bearerToken = bearer?.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : ''

  return (
    req.headers.get('x-singpay-secret')
    || req.headers.get('x-webhook-secret')
    || req.headers.get('x-callback-secret')
    || bearerToken
    || ''
  )
}

const isWebhookAuthorized = (req: Request): boolean => {
  const expectedSecret = getEnv('SINGPAY_CALLBACK_SECRET') || getEnv('QGABON_WEBHOOK_SECRET')
  if (!expectedSecret) return getEnv('ALLOW_INSECURE_WEBHOOKS') === 'true'
  return getProvidedWebhookSecret(req) === expectedSecret
}

const createSettlementIfNeeded = async (client: any, paymentTransaction: any) => {
  const { data: existing } = await client
    .from('payment_settlements')
    .select('id,status')
    .eq('payment_transaction_id', paymentTransaction.id)
    .eq('recipient_type', 'merchant')
    .maybeSingle()

  if (existing) return existing

  const payoutAccount = await getMerchantPayoutAccount(client, paymentTransaction.merchant_id)
  const { feeAmount, merchantNetAmount } = calculateSettlement(Number(paymentTransaction.amount))

  const status = payoutAccount?.disbursement_id ? 'ready' : 'manual_review'

  const { data, error } = await client
    .from('payment_settlements')
    .insert({
      payment_transaction_id: paymentTransaction.id,
      order_id: paymentTransaction.order_id,
      merchant_id: paymentTransaction.merchant_id,
      recipient_type: 'merchant',
      merchant_payout_account_id: payoutAccount?.id || null,
      disbursement_id: payoutAccount?.disbursement_id || null,
      gross_amount: Number(paymentTransaction.amount),
      fee_amount: feeAmount,
      net_amount: merchantNetAmount,
      status,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de creer le settlement: ${error.message}`)
  return data
}

const executeTransferIfEnabled = async (client: any, settlement: any, paymentTransaction: any, platformWallet: PlatformWallet) => {
  if (getEnv('SINGPAY_TRANSFERS_ENABLED') !== 'true') return settlement
  if (!settlement?.disbursement_id || settlement.status !== 'ready') return settlement

  let singPayHeaders: Record<string, string>
  try {
    singPayHeaders = getSingPayHeaders(platformWallet)
  } catch {
    return settlement
  }

  const transferPayload = {
    reference: paymentTransaction.internal_reference,
    disbursement: settlement.disbursement_id,
    amount: settlement.net_amount,
  }

  await client
    .from('payment_settlements')
    .update({
      status: 'processing',
      raw_transfer_request: transferPayload,
    })
    .eq('id', settlement.id)

  let transferData: any
  let transferOk = false

  const response = await fetch(getTransferEndpoint(), {
    method: 'POST',
    headers: singPayHeaders,
    body: JSON.stringify(transferPayload),
  })
  transferData = await response.json().catch(() => ({ error: 'Invalid JSON response' }))
  transferOk = response.ok && transferData?.status?.success !== false && transferData?.success !== false

  const { data: updated } = await client
    .from('payment_settlements')
    .update({
      status: transferOk ? 'paid' : 'failed',
      provider_transfer_reference: transferData?.reference || transferData?.transaction?.reference || null,
      provider_transfer_status: transferOk ? 'success' : 'failed',
      raw_transfer_response: transferData,
      paid_at: transferOk ? new Date().toISOString() : null,
    })
    .eq('id', settlement.id)
    .select()
    .single()

  return updated || settlement
}

export const handleSingPayCallback = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!isWebhookAuthorized(req)) {
    return json({ error: 'Unauthorized webhook' }, 401)
  }

  const payload = await req.json()
  const parsed = parseSingPayTransaction(payload)
  const reference = parsed.reference

  if (!reference && !parsed.providerTransactionId) {
    return json({ error: 'Missing reference' }, 400)
  }

  const client = getServiceClient()
  let query = client
    .from('payment_transactions')
    .select('*, platform_payment_wallets(id,wallet_id,client_id,client_secret_encrypted)')

  query = reference
    ? query.eq('internal_reference', reference)
    : query.eq('provider_transaction_id', parsed.providerTransactionId)

  const { data: paymentTransaction, error: txError } = await query.maybeSingle()

  if (txError || !paymentTransaction) {
    return json({ error: 'Transaction not found' }, 404)
  }

  const newStatus = mapProviderStatus(parsed.status, parsed.result)
  const legacyStatus = mapLegacyStatus(newStatus)
  const isFinal = ['confirmed', 'failed', 'expired', 'cancelled'].includes(newStatus)

  await client
    .from('payment_transactions')
    .update({
      provider_transaction_id: parsed.providerTransactionId || paymentTransaction.provider_transaction_id,
      provider_status: parsed.status,
      provider_result: parsed.result,
      status: newStatus,
      raw_callback: payload,
      confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : paymentTransaction.confirmed_at,
    })
    .eq('id', paymentTransaction.id)

  await client
    .from('transactions')
    .update({
      status: legacyStatus,
      transaction_id: parsed.providerTransactionId || paymentTransaction.provider_transaction_id,
      provider_status: parsed.status,
      provider_result: parsed.result,
      status_code: parsed.status || '',
      message: parsed.message || (newStatus === 'confirmed' ? 'Paiement SingPay confirme' : 'Paiement SingPay mis a jour'),
      completed_at: isFinal ? new Date().toISOString() : null,
      settlement_status: newStatus === 'confirmed' ? 'pending' : null,
    })
    .eq('id', paymentTransaction.legacy_transaction_id)

  if (newStatus === 'confirmed') {
    await client
      .from('orders')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', paymentTransaction.order_id)

    const settlement = await createSettlementIfNeeded(client, paymentTransaction)
    const updatedSettlement = await executeTransferIfEnabled(
      client,
      settlement,
      paymentTransaction,
      paymentTransaction.platform_payment_wallets,
    )

    await client
      .from('transactions')
      .update({ settlement_status: updatedSettlement?.status || settlement?.status || 'pending' })
      .eq('id', paymentTransaction.legacy_transaction_id)
  }

  return json({ success: true, message: 'SingPay callback processed successfully' })
}

export const syncSingPayTransactionStatus = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const userClient = getUserClient(authHeader)
  const serviceClient = getServiceClient()

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Invalid token' }, 401)

  const body = await req.json().catch(() => ({}))
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
  const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : ''

  if (!reference && !transactionId) {
    return json({ error: 'Missing reference or transactionId' }, 400)
  }

  let query = serviceClient
    .from('payment_transactions')
    .select('*, platform_payment_wallets(id,wallet_id,client_id,client_secret_encrypted)')

  query = reference
    ? query.eq('internal_reference', reference)
    : query.eq('provider_transaction_id', transactionId)

  const { data: paymentTransaction, error: txError } = await query.maybeSingle()
  if (txError || !paymentTransaction) return json({ error: 'Transaction not found' }, 404)

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: merchant } = await serviceClient
    .from('merchants')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const canRead = paymentTransaction.user_id === user.id
    || merchant?.id === paymentTransaction.merchant_id
    || profile?.role === 'admin'

  if (!canRead) return json({ error: 'Forbidden' }, 403)

  let providerData: any
  let response: Response

  try {
    const headers = getSingPayHeaders(paymentTransaction.platform_payment_wallets)
    if (paymentTransaction.provider_transaction_id || transactionId) {
      response = await fetch(
        getTransactionStatusEndpoint(paymentTransaction.provider_transaction_id || transactionId),
        { method: 'GET', headers },
      )
    } else {
      response = await fetch(
        getTransactionByReferenceEndpoint(paymentTransaction.internal_reference),
        { method: 'GET', headers },
      )
    }
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'SingPay configuration error',
    }, 500)
  }

  providerData = await response.json().catch(() => ({ error: 'Invalid JSON response' }))
  if (!response.ok || providerData?.status?.success === false || providerData?.success === false) {
    return json({
      success: false,
      error: { message: 'SingPay status lookup failed', details: providerData },
    }, 502)
  }

  const parsed = parseSingPayTransaction(providerData)
  const newStatus = mapProviderStatus(parsed.status, parsed.result)
  const legacyStatus = mapLegacyStatus(newStatus)
  const isFinal = ['confirmed', 'failed', 'expired', 'cancelled'].includes(newStatus)

  const { data: updatedPaymentTransaction } = await serviceClient
    .from('payment_transactions')
    .update({
      provider_transaction_id: parsed.providerTransactionId || paymentTransaction.provider_transaction_id,
      provider_status: parsed.status,
      provider_result: parsed.result,
      status: newStatus,
      raw_callback: providerData,
      confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : paymentTransaction.confirmed_at,
    })
    .eq('id', paymentTransaction.id)
    .select()
    .single()

  await serviceClient
    .from('transactions')
    .update({
      status: legacyStatus,
      transaction_id: parsed.providerTransactionId || paymentTransaction.provider_transaction_id,
      provider_status: parsed.status,
      provider_result: parsed.result,
      status_code: parsed.status || '',
      message: parsed.message || 'Statut SingPay synchronise',
      completed_at: isFinal ? new Date().toISOString() : null,
    })
    .eq('id', paymentTransaction.legacy_transaction_id)

  if (newStatus === 'confirmed') {
    await serviceClient
      .from('orders')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', paymentTransaction.order_id)

    const settlement = await createSettlementIfNeeded(serviceClient, paymentTransaction)
    const updatedSettlement = await executeTransferIfEnabled(
      serviceClient,
      settlement,
      paymentTransaction,
      paymentTransaction.platform_payment_wallets,
    )

    await serviceClient
      .from('transactions')
      .update({ settlement_status: updatedSettlement?.status || settlement?.status || 'pending' })
      .eq('id', paymentTransaction.legacy_transaction_id)
  }

  return json({
    success: true,
    data: {
      paymentTransaction: updatedPaymentTransaction,
      provider: providerData,
    },
  })
}
