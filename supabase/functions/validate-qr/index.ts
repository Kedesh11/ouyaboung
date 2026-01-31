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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // ===================================================================
        // 1. AUTHENTIFICATION MARCHAND
        // ===================================================================

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

        console.log('[Validate QR] Merchant:', user.id)

        // ===================================================================
        // 2. PARSE PAYLOAD
        // ===================================================================

        const { pickup_code } = await req.json()

        if (!pickup_code) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing pickup_code' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Validate QR] Code:', pickup_code)

        // ===================================================================
        // 3. RECHERCHER LA COMMANDE
        // ===================================================================

        const { data: order, error: orderError } = await supabaseClient
            .from('orders')
            .select('*, food_item:food_items(*), buyer:profiles!orders_user_id_fkey(*)')
            .eq('pickup_code', pickup_code)
            .single()

        if (orderError || !order) {
            console.error('[Validate QR] Order not found:', pickup_code)
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'QR Code invalide ou inexistant',
                    code: 'INVALID_CODE'
                }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 4. VÉRIFIER LA PROPRIÉTÉ (MERCHANT)
        // ===================================================================

        if (order.merchant_id !== user.id) {
            console.error('[Validate QR] Ownership mismatch')
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Ce QR Code ne vous appartient pas',
                    code: 'UNAUTHORIZED_MERCHANT'
                }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 5. VÉRIFIER QUE PAS DÉJÀ CONSOMMÉ
        // ===================================================================

        if (order.consumed_at) {
            console.warn('[Validate QR] Already consumed:', order.consumed_at)
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

        // ===================================================================
        // 6. VÉRIFIER QUE LA COMMANDE EST CONFIRMÉE
        // ===================================================================

        if (order.status !== 'confirmed') {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Commande non confirmée (paiement non validé)',
                    code: 'NOT_CONFIRMED',
                    currentStatus: order.status
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 7. MARQUER COMME CONSOMMÉ
        // ===================================================================

        const { error: updateError } = await supabaseClient
            .from('orders')
            .update({
                consumed_at: new Date().toISOString(),
                consumed_by: user.id,
                status: 'completed' // Optionnel : passer à completed
            })
            .eq('id', order.id)

        if (updateError) {
            console.error('[Validate QR] Update error:', updateError)
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Erreur lors de la validation'
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Validate QR] Success! Order consumed:', order.id)

        // ===================================================================
        // 8. RETOURNER LES DÉTAILS
        // ===================================================================

        return new Response(
            JSON.stringify({
                success: true,
                message: 'QR Code validé avec succès',
                order: {
                    id: order.id,
                    productName: order.food_item?.name || 'Produit',
                    quantity: order.quantity,
                    totalPrice: order.total_price,
                    customerName: order.buyer?.full_name || 'Client',
                    customerPhone: order.buyer?.phone || '',
                    confirmedAt: order.confirmed_at,
                    consumedAt: new Date().toISOString()
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
