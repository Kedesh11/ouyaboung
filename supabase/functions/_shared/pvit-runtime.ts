// Shared PVIT runtime (Deno Edge Functions): HTTP helpers, configuration, the
// X-Secret cache, authenticated provider calls and the status verification.
// Used by the order payment handlers (pvit.ts) and the transport payment
// handlers (pvit-transport.ts); it contains nothing specific to either.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  DEFAULT_INITIATION_WINDOW_MS,
  DEFAULT_IN_FLIGHT_WINDOW_MS,
  DEFAULT_MAX_INITIATIONS_PER_WINDOW,
} from './payment-guards.ts'
import {
  mapPvitStatus,
  parseCommissionRate,
  parseCsv,
  parsePositiveInt,
  parseStatusResponse,
  resolveAllowedOrigin,
} from './pvit-core.ts'

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export const fail = (status: number, message: string, code: string, extra: Record<string, unknown> = {}) =>
  json({ success: false, error: { message, code, ...extra } }, status)

export const getEnv = (name: string): string => Deno.env.get(name)?.trim() || ''

// CORS for the browser-facing functions. The allowed origins come from
// ALLOWED_ORIGINS (comma separated, e.g. the app URL); unset = any origin
// (local development only). The webhook is server-to-server and has no CORS.
export const withCors = async (req: Request, run: () => Promise<Response>): Promise<Response> => {
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

export const maskPhone = (phone: string) => `${phone.slice(0, 3)}****${phone.slice(-2)}`

export const getServiceClient = () => createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

export const getUserClient = (authHeader: string) =>
  createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  })

// Throws when a Supabase write failed, so the handler can answer 500.
export const ensure = (label: string, res: any) => {
  if (res?.error) throw new Error(`${label}: ${res.error.message || res.error.code || 'db error'}`)
  return res
}

// ------------------------------------------------------------------- config

export type PvitConfig = {
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
export const readConfig = (): PvitConfig | null => {
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
export const getSecret = async (client: any, cfg: PvitConfig, force = false): Promise<string> => {
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
export const providerErrorCode = (body: any): number => Number(body?.status_code ?? body?.code ?? body?.error?.code)

// Authenticated call to PVIT; one automatic retry with a fresh secret when
// the secret was rejected (3100 AUTHENTICATION_FAILED).
export const pvitFetch = async (client: any, cfg: PvitConfig, url: string, init: RequestInit = {}) => {
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

export type Wallet = { id: string; wallet_id: string }

// The platform "wallet" row is the PVIT operation account of Ouyaboung.
export const getOrCreatePlatformWallet = async (client: any, cfg: PvitConfig): Promise<Wallet> => {
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


export type Verification =
  | { ok: true; internal: string; providerStatus: string | null; amount: number | null; raw: unknown }
  | { ok: false; kind: 'unavailable' | 'mismatch'; reason: string }

// Asks PVIT for the authoritative state of a payment.
//
// Verified against the sandbox: the status API finds a transaction by OUR
// merchant reference (merchant_reference_id); the PVIT id (PAY...) returned at
// initiation is not found (4006). The PVIT id is only tried as a fallback.
export const verifyWithProvider = async (client: any, cfg: PvitConfig, payment: any): Promise<Verification> => {
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

