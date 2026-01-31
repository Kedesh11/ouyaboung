/**
 * Edge Function: Moov Callback (Structure Unifiée Q-Gabon)
 * 
 * Reçoit les webhooks de Q-Gabon avec la structure réelle du provider
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
        // 1. PARSE PAYLOAD (Structure Q-Gabon réelle)
        // ===================================================================

        const payload = await req.json()
        console.log('[Moov Callback] Received:', JSON.stringify(payload))

        // ===================================================================
        // 2. LOG TO WEBHOOK_LOGS
        // ===================================================================
        
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const logId = await supabaseClient.from('webhook_logs').insert({
            provider: 'MOOV',
            payload: payload,
            headers: Object.fromEntries(req.headers.entries()),
            ip_address: req.headers.get('x-forwarded-for') || 'unknown'
        }).select('id').single()

        console.log('[Moov Callback] Logged to webhook_logs:', logId.data?.id)

        // ===================================================================
        // 3. VALIDATION & EXTRACTION
        // ===================================================================
        
        // Structure Q-Gabon: {transactionId, merchantReferenceId, status, code, ...}
        const {
            transactionId,
            merchantReferenceId,
            merchant_reference_id, // Q-Gabon peut envoyer les deux formats
            status,
            code,
            amount,
            amountCredited,
            totalAmount,
            fees,
            operatorFees,
            operator,
            customerId,
            chargeOwner,
            operatorOwnerCharge
        } = payload

        // Utiliser merchantReferenceId (notre référence envoyée lors de l'initiation)
        const reference = merchantReferenceId || merchant_reference_id

        if (!reference) {
            console.error('[Moov Callback] Missing merchantReferenceId')
            return new Response(
                JSON.stringify({ success: false, error: 'Missing reference' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 4. RECHERCHE TRANSACTION
        // ===================================================================

        const { data: transaction, error: txError } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('reference', reference)
            .single()

        if (txError || !transaction) {
            console.error('[Moov Callback] Transaction not found:', reference)
            // Marquer le webhook comme traité mais en erreur
            await supabaseClient.from('webhook_logs').update({
                processed: false,
                error: `Transaction not found: ${reference}`
            }).eq('id', logId.data?.id)
            
            return new Response(
                JSON.stringify({ success: false, error: 'Transaction not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Moov Callback] Transaction found:', transaction.id)

        // ===================================================================
        // 5. IDEMPOTENCE - Vérifier si déjà traité
        // ===================================================================

        if (transaction.status === 'SUCCESS' && status === 'SUCCESS') {
            console.log('[Moov Callback] Transaction already processed as SUCCESS')
            await supabaseClient.from('webhook_logs').update({
                processed: true,
                error: 'Duplicate callback - already SUCCESS'
            }).eq('id', logId.data?.id)
            
            return new Response(
                JSON.stringify({ success: true, message: 'Already processed' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 6. MISE À JOUR TRANSACTION
        // ===================================================================

        // Mapper le statut Q-Gabon vers notre statut interne
        let finalStatus = 'PENDING'
        if (status === 'SUCCESS' && code === 200) {
            finalStatus = 'SUCCESS'
        } else if (status === 'FAILED' || code !== 200) {
            finalStatus = 'FAILED'
        }

        const { error: updateError } = await supabaseClient
            .from('transactions')
            .update({
                status: finalStatus,
                status_code: String(code),
                message: status || 'Payment processed',
                operator: operator || 'MOOV_MONEY',
                transaction_id: transactionId,
                merchant_reference_id: reference,
                amount_credited: amountCredited,
                operator_fees: operatorFees,
                charge_owner: chargeOwner,
                completed_at: finalStatus !== 'PENDING' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', transaction.id)

        if (updateError) {
            console.error('[Moov Callback] Update error:', updateError)
            await supabaseClient.from('webhook_logs').update({
                processed: false,
                error: `DB update failed: ${updateError.message}`
            }).eq('id', logId.data?.id)
            
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to update transaction' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Moov Callback] Transaction updated to:', finalStatus)

        // ===================================================================
        // 7. MISE À JOUR ORDER (si paiement réussi)
        // ===================================================================

        if (finalStatus === 'SUCCESS') {
            // Générer un code unique pour le QR Code
            const pickupCode = `QR_${crypto.randomUUID()}`
            
            const { error: orderError } = await supabaseClient
                .from('orders')
                .update({
                    status: 'confirmed',
                    confirmed_at: new Date().toISOString(),
                    pickup_code: pickupCode
                })
                .eq('id', transaction.order_id)

            if (orderError) {
                console.error('[Moov Callback] Order update error:', orderError)
            } else {
                console.log('[Moov Callback] Order confirmed:', transaction.order_id, 'QR Code:', pickupCode)
            }
        }

        // ===================================================================
        // 8. MARQUER LE WEBHOOK COMME TRAITÉ
        // ===================================================================

        await supabaseClient.from('webhook_logs').update({
            processed: true
        }).eq('id', logId.data?.id)

        // ===================================================================
        // 9. RETOURNER RÉPONSE CONFORME
        // ===================================================================

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Callback processed successfully',
                transactionId: transaction.id,
                status: finalStatus
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('[Moov Callback] Error:', error)
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: (error as Error).message 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
