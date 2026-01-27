/**
 * Edge Function: Payment Callback
 * 
 * Reçoit les webhooks de Q-Gabon et met à jour les transactions
 * 
 * Processus:
 * 1. Parse payload callback Q-Gabon
 * 2. Recherche transaction par reference
 * 3. Mise à jour statut transaction
 * 4. Mise à jour statut order
 * 5. Notification temps réel
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
        // 1. PARSE PAYLOAD CALLBACK
        // ===================================================================

        const payload = await req.json()
        console.log('[Payment Callback] Received:', payload)

        const { success, data, reference } = payload

        if (!reference) {
            console.error('[Payment Callback] Missing reference')
            return new Response(
                JSON.stringify({ error: 'Missing reference' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 2. CLIENT SUPABASE (service role)
        // ===================================================================

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // ===================================================================
        // 3. RECHERCHE TRANSACTION PAR REFERENCE
        // ===================================================================

        const { data: transaction, error: txError } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('reference', reference)
            .single()

        if (txError || !transaction) {
            console.error('[Payment Callback] Transaction not found:', reference)
            return new Response(
                JSON.stringify({ error: 'Transaction not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Payment Callback] Transaction found:', transaction.id)

        // ===================================================================
        // 4. MISE À JOUR TRANSACTION
        // ===================================================================

        const newStatus = data.status === 'SUCCESS' ? 'SUCCESS' :
            data.status === 'FAILED' ? 'FAILED' : 'PENDING'

        const { error: updateError } = await supabaseClient
            .from('transactions')
            .update({
                status: newStatus,
                status_code: data.status_code,
                message: data.message,
                operator: data.operator,
                transaction_id: data.reference_id,
                merchant_reference_id: data.merchant_reference_id,
                completed_at: newStatus !== 'PENDING' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id)

        if (updateError) {
            console.error('[Payment Callback] Update error:', updateError)
            return new Response(
                JSON.stringify({ error: 'Failed to update transaction' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Payment Callback] Transaction updated to:', newStatus)

        // ===================================================================
        // 5. MISE À JOUR ORDER (si paiement réussi)
        // ===================================================================

        if (newStatus === 'SUCCESS') {
            const { error: orderError } = await supabaseClient
                .from('orders')
                .update({
                    status: 'confirmed',
                    confirmed_at: new Date().toISOString()
                })
                .eq('id', transaction.order_id)

            if (orderError) {
                console.error('[Payment Callback] Order update error:', orderError)
            } else {
                console.log('[Payment Callback] Order confirmed:', transaction.order_id)
            }
        }

        // ===================================================================
        // 6. NOTIFICATION TEMPS RÉEL
        // ===================================================================

        // Supabase Realtime diffusera automatiquement les changements
        // Les clients abonnés au channel 'transactions' recevront l'update

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Payment callback processed successfully'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('[Payment Callback] Error:', error)
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
