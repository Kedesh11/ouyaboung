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

const normalizePickupCode = (value: string): string =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, '')

const ORDER_SELECT =
    'id,user_id,merchant_id,quantity,total_price,status,pickup_code,confirmed_at,consumed_at,consumed_by,food_item:food_items(name)'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
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

        const { pickup_code } = await req.json()
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

        const selectByNormalized = await supabaseClient
            .from('orders')
            .select(ORDER_SELECT)
            .eq('pickup_code_normalized', normalizedPickupCode)
            .eq('merchant_id', merchant.id)
            .maybeSingle()

        let order = selectByNormalized.data
        let orderError = selectByNormalized.error

        // Backward compatibility for environments where pickup_code_normalized
        // migration has not been applied yet.
        if (!order && orderError?.message?.includes('pickup_code_normalized')) {
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
                } else if (!fallbackLookup.error) {
                    const recentLookup = await supabaseClient
                        .from('orders')
                        .select(ORDER_SELECT)
                        .eq('merchant_id', merchant.id)
                        .order('created_at', { ascending: false })
                        .limit(250)

                    if (!recentLookup.error && recentLookup.data) {
                        order = recentLookup.data.find((candidateOrder) =>
                            normalizePickupCode(candidateOrder.pickup_code || '') === normalizedPickupCode
                        ) || null
                        orderError = null
                    } else {
                        orderError = recentLookup.error
                    }
                } else {
                    orderError = fallbackLookup.error
                }
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

        const { error: updateError } = await supabaseClient
            .from('orders')
            .update({
                confirmed_at: order.confirmed_at ?? consumedAt,
                consumed_at: consumedAt,
                consumed_by: user.id,
                status: 'completed'
            })
            .eq('id', order.id)
            .is('consumed_at', null)

        if (updateError) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Erreur lors de la validation'
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
