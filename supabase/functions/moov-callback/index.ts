/**
 * Edge Function: Moov Callback (Structure Unifiée Q-Gabon)
 * 
 * Reçoit les webhooks de Q-Gabon avec la structure réelle du provider
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveFinalStatus } from '../_shared/payment-status.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const PAYMENT_FLOW_ENABLED = true

const getProvidedWebhookSecret = (req: Request): string => {
    const bearer = req.headers.get('authorization')
    const bearerToken = bearer?.toLowerCase().startsWith('bearer ')
        ? bearer.slice(7).trim()
        : null

    return (
        req.headers.get('x-qgabon-secret')
        || req.headers.get('x-webhook-secret')
        || req.headers.get('x-callback-secret')
        || bearerToken
        || ''
    )
}

const isWebhookAuthorized = (req: Request): boolean => {
    const expectedSecret = Deno.env.get('QGABON_WEBHOOK_SECRET')
    if (!expectedSecret) {
        return Deno.env.get('ALLOW_INSECURE_WEBHOOKS') === 'true'
    }

    const providedSecret = getProvidedWebhookSecret(req)
    return !!providedSecret && providedSecret === expectedSecret
}

const redactHeaders = (headers: Headers): Record<string, string> => {
    const sensitive = new Set(['authorization', 'apikey', 'x-api-key', 'proxy-authorization'])
    const result: Record<string, string> = {}

    for (const [key, value] of headers.entries()) {
        result[key] = sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value
    }

    return result
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (!PAYMENT_FLOW_ENABLED) {
        return new Response(
            JSON.stringify({ success: false, error: 'Payment flow disabled' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        if (!isWebhookAuthorized(req)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized webhook' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 1. PARSE PAYLOAD (Structure Q-Gabon réelle)
        // ===================================================================

        const payload = await req.json()
        console.log('[Moov Callback] Received callback')

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
            headers: redactHeaders(req.headers),
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
            .select('id,status,order_id,user_id,merchant_id,reference')
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
        const finalStatus = resolveFinalStatus(status, code)

        const { error: updateError } = await supabaseClient
            .from('transactions')
            .update({
                status: finalStatus,
                status_code: String(code),
                message: status || 'Payment processed',
                operator: operator || 'MOOV_MONEY',
                transaction_id: transactionId,
                merchant_reference_id: reference,
                amount: amount,
                total_amount: totalAmount,
                fees: fees,
                amount_credited: amountCredited,
                operator_fees: operatorFees,
                charge_owner: chargeOwner,
                customer_id: customerId,
                operator_owner_charge: operatorOwnerCharge,
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
            const { error: orderError } = await supabaseClient
                .from('orders')
                .update({
                    status: 'confirmed',
                    confirmed_at: new Date().toISOString()
                })
                .eq('id', transaction.order_id)

            if (orderError) {
                console.error('[Moov Callback] Order update error:', orderError)
            } else {
                console.log('[Moov Callback] Order confirmed:', transaction.order_id)
            }
        }

        if (finalStatus === 'SUCCESS' || finalStatus === 'FAILED') {
            const { data: merchantProfile } = await supabaseClient
                .from('merchants')
                .select('user_id,business_name')
                .eq('id', transaction.merchant_id)
                .maybeSingle()

            const userNotification = finalStatus === 'SUCCESS'
                ? {
                    user_id: transaction.user_id,
                    type: 'system',
                    title: 'Paiement confirme',
                    message: 'Votre paiement mobile est valide. Votre commande est confirmee.',
                    data: {
                        transaction_id: transaction.id,
                        order_id: transaction.order_id,
                        reference: transaction.reference,
                        payment_status: finalStatus,
                    },
                }
                : {
                    user_id: transaction.user_id,
                    type: 'system',
                    title: 'Paiement non valide',
                    message: 'Le paiement n’a pas ete valide. Reessayez ou changez de moyen de paiement.',
                    data: {
                        transaction_id: transaction.id,
                        order_id: transaction.order_id,
                        reference: transaction.reference,
                        payment_status: finalStatus,
                    },
                }

            const notifications: Array<Record<string, unknown>> = [userNotification]

            if (merchantProfile?.user_id) {
                notifications.push(
                    finalStatus === 'SUCCESS'
                        ? {
                            user_id: merchantProfile.user_id,
                            type: 'system',
                            title: 'Paiement client confirme',
                            message: `Le paiement de la commande ${transaction.order_id} est valide.`,
                            data: {
                                transaction_id: transaction.id,
                                order_id: transaction.order_id,
                                reference: transaction.reference,
                                payment_status: finalStatus,
                            },
                        }
                        : {
                            user_id: merchantProfile.user_id,
                            type: 'system',
                            title: 'Paiement client echoue',
                            message: `Le paiement de la commande ${transaction.order_id} n’a pas ete valide.`,
                            data: {
                                transaction_id: transaction.id,
                                order_id: transaction.order_id,
                                reference: transaction.reference,
                                payment_status: finalStatus,
                            },
                        }
                )
            }

            const { error: notificationError } = await supabaseClient
                .from('notifications')
                .insert(notifications)

            if (notificationError) {
                console.error('[Moov Callback] Notification error:', notificationError)
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
