/**
 * Edge Function: Validate QR Code
 *
 * Vérifie et consomme un QR Code scanné par un marchand
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT_BY_IP = 80
const RATE_LIMIT_BY_MERCHANT = 120

const ipRateWindow = new Map<string, number[]>()
const merchantRateWindow = new Map<string, number[]>()

const getRequestIp = (req: Request): string => {
    const cfIp = req.headers.get('cf-connecting-ip')
    if (cfIp) return cfIp.trim()

    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) {
        const first = forwarded.split(',')[0]
        if (first) return first.trim()
    }

    const realIp = req.headers.get('x-real-ip')
    if (realIp) return realIp.trim()

    return 'unknown'
}

const applyRateLimit = (store: Map<string, number[]>, key: string, limit: number) => {
    const now = Date.now()
    const history = store.get(key) ?? []
    const active = history.filter((ts) => now - ts < RATE_WINDOW_MS)

    if (active.length >= limit) {
        const oldest = active[0] ?? now
        const retryAfterMs = RATE_WINDOW_MS - (now - oldest)
        return {
            allowed: false,
            retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        }
    }

    active.push(now)
    store.set(key, active)
    return {
        allowed: true,
        retryAfterSec: 0,
    }
}

const normalizePickupCode = (value: string): string =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '')

const toUuidCandidate = (value: string): string | null => {
    const compact = value.toLowerCase().replace(/[^a-f0-9]/g, '')
    if (!/^[a-f0-9]{32}$/.test(compact)) return null

    return [
        compact.slice(0, 8),
        compact.slice(8, 12),
        compact.slice(12, 16),
        compact.slice(16, 20),
        compact.slice(20),
    ].join('-')
}

const ORDER_SELECT =
    'id,user_id,merchant_id,quantity,total_price,status,pickup_code,confirmed_at,consumed_at,consumed_by,created_at,food_item:food_items(name)'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Method not allowed',
                code: 'METHOD_NOT_ALLOWED'
            }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        const contentType = req.headers.get('content-type') || ''
        if (!contentType.toLowerCase().includes('application/json')) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Invalid content type',
                    code: 'INVALID_CONTENT_TYPE'
                }),
                { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const requestIp = getRequestIp(req)
        const ipLimit = applyRateLimit(ipRateWindow, requestIp, RATE_LIMIT_BY_IP)
        if (!ipLimit.allowed) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Too many validation attempts from this IP',
                    code: 'RATE_LIMITED_IP',
                    retry_after: ipLimit.retryAfterSec,
                }),
                {
                    status: 429,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Retry-After': String(ipLimit.retryAfterSec),
                    }
                }
            )
        }

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: authHeader }
                }
            }
        )

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid authentication' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        let requestPayload: { pickup_code?: unknown } | null = null
        try {
            requestPayload = await req.json() as { pickup_code?: unknown }
        } catch {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Invalid JSON payload',
                    code: 'INVALID_JSON'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const pickup_code = requestPayload?.pickup_code
        const rawPickupCode = typeof pickup_code === 'string' ? pickup_code.trim() : ''
        const normalizedPickupCode =
            typeof pickup_code === 'string'
                ? normalizePickupCode(pickup_code)
                : ''

        if (!normalizedPickupCode) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing pickup_code' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!/^[A-Z0-9]{6,64}$/.test(normalizedPickupCode)) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Invalid pickup code format',
                    code: 'INVALID_CODE_FORMAT'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Resolve merchant ownership from authenticated user.
        const { data: merchant, error: merchantError } = await supabaseClient
            .from('merchants')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_verified', true)
            .eq('is_active', true)
            .eq('is_refused', false)
            .maybeSingle()

        if (merchantError || !merchant) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Compte marchand non autorisé',
                    code: 'MERCHANT_NOT_AUTHORIZED'
                }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const merchantLimit = applyRateLimit(merchantRateWindow, merchant.id, RATE_LIMIT_BY_MERCHANT)
        if (!merchantLimit.allowed) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Too many validation attempts for this merchant account',
                    code: 'RATE_LIMITED_MERCHANT',
                    retry_after: merchantLimit.retryAfterSec,
                }),
                {
                    status: 429,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Retry-After': String(merchantLimit.retryAfterSec),
                    }
                }
            )
        }

        const selectByNormalized = await supabaseClient
            .from('orders')
            .select(ORDER_SELECT)
            .eq('pickup_code_normalized', normalizedPickupCode)
            .eq('merchant_id', merchant.id)
            .maybeSingle()

        let order = selectByNormalized.data
        let orderError = selectByNormalized.error

        // Backward compatibility and resilience across legacy payload formats.
        const lookupShouldContinue =
            !order && (!orderError || orderError?.message?.includes('pickup_code_normalized'))

        if (lookupShouldContinue) {
            const fallbackCandidates = Array.from(
                new Set(
                    [rawPickupCode, normalizedPickupCode]
                        .map((candidate) => candidate.trim())
                        .filter((candidate) => candidate.length > 0)
                )
            )

            if (fallbackCandidates.length > 0) {
                const fallbackLookup = await supabaseClient
                    .from('orders')
                    .select(ORDER_SELECT)
                    .eq('merchant_id', merchant.id)
                    .in('pickup_code', fallbackCandidates)
                    .maybeSingle()

                if (!fallbackLookup.error && fallbackLookup.data) {
                    order = fallbackLookup.data
                    orderError = null
                } else if (fallbackLookup.error) {
                    orderError = fallbackLookup.error
                } else {
                    orderError = null
                }
            }
        }

        if (!order) {
            const uuidCandidate = toUuidCandidate(rawPickupCode) || toUuidCandidate(normalizedPickupCode)
            if (uuidCandidate) {
                const lookupById = await supabaseClient
                    .from('orders')
                    .select(ORDER_SELECT)
                    .eq('id', uuidCandidate)
                    .eq('merchant_id', merchant.id)
                    .maybeSingle()

                if (!lookupById.error && lookupById.data) {
                    order = lookupById.data
                    orderError = null
                }
            }
        }

        if (!order) {
            const recentLookup = await supabaseClient
                .from('orders')
                .select(ORDER_SELECT)
                .eq('merchant_id', merchant.id)
                .order('created_at', { ascending: false })
                .limit(250)

            if (!recentLookup.error && recentLookup.data) {
                order = recentLookup.data.find((candidateOrder) =>
                    normalizePickupCode(candidateOrder.pickup_code || '') === normalizedPickupCode
                    || normalizePickupCode(candidateOrder.id || '') === normalizedPickupCode
                ) || null
                orderError = null
            } else if (recentLookup.error) {
                orderError = recentLookup.error
            }
        }

        if (orderError || !order) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'QR Code invalide ou inexistant',
                    code: 'INVALID_CODE'
                }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (order.consumed_at) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'QR Code déjà utilisé',
                    code: 'ALREADY_CONSUMED',
                    consumedAt: order.consumed_at,
                    consumedBy: order.consumed_by
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Temporary onsite flow:
        // pending is accepted so merchant scan can confirm payment + pickup on-site.
        const allowedStatuses = ['pending', 'confirmed', 'ready']
        if (!allowedStatuses.includes(order.status)) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Commande non eligible pour validation QR',
                    code: 'INVALID_ORDER_STATUS',
                    currentStatus: order.status
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const consumedAt = new Date().toISOString()

        const { data: updatedOrder, error: updateError } = await supabaseClient
            .from('orders')
            .update({
                confirmed_at: order.confirmed_at ?? consumedAt,
                consumed_at: consumedAt,
                consumed_by: user.id,
                status: 'completed'
            })
            .eq('id', order.id)
            .is('consumed_at', null)
            .select('id')
            .maybeSingle()

        if (updateError) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Erreur lors de la validation'
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!updatedOrder) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'QR Code déjà utilisé',
                    code: 'ALREADY_CONSUMED'
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: buyer } = await supabaseClient
            .from('profiles')
            .select('full_name, phone')
            .eq('user_id', order.user_id)
            .maybeSingle()

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Paiement sur place et retrait valides avec succes',
                order: {
                    id: order.id,
                    productName: order.food_item?.name || 'Produit',
                    quantity: order.quantity,
                    totalPrice: order.total_price,
                    customerName: buyer?.full_name || 'Client',
                    customerPhone: buyer?.phone || '',
                    confirmedAt: order.confirmed_at,
                    consumedAt
                }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('[Validate QR] Error:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: (error as Error).message
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
