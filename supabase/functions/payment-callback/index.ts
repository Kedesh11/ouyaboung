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
        return true
    }

    const providedSecret = getProvidedWebhookSecret(req)
    return !!providedSecret && providedSecret === expectedSecret
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (!PAYMENT_FLOW_ENABLED) {
        return new Response(
            JSON.stringify({ error: 'Payment flow disabled' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        if (!isWebhookAuthorized(req)) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized webhook' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 1. PARSE PAYLOAD CALLBACK
        // ===================================================================

        const payload = await req.json()
        console.log('[Payment Callback] Received callback')

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
            .select('id,status,order_id,user_id,merchant_id,reference')
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

        const newStatus = resolveFinalStatus(data?.status, data?.status_code)

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

        if (newStatus === 'SUCCESS' || newStatus === 'FAILED') {
            const { data: merchantProfile } = await supabaseClient
                .from('merchants')
                .select('user_id')
                .eq('id', transaction.merchant_id)
                .maybeSingle()

            const userNotification = newStatus === 'SUCCESS'
                ? {
                    user_id: transaction.user_id,
                    type: 'system',
                    title: 'Paiement confirme',
                    message: 'Votre paiement mobile est valide. Votre commande est confirmee.',
                    data: {
                        transaction_id: transaction.id,
                        order_id: transaction.order_id,
                        reference: transaction.reference,
                        payment_status: newStatus,
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
                        payment_status: newStatus,
                    },
                }

            const notifications: Array<Record<string, unknown>> = [userNotification]

            if (merchantProfile?.user_id) {
                notifications.push(
                    newStatus === 'SUCCESS'
                        ? {
                            user_id: merchantProfile.user_id,
                            type: 'system',
                            title: 'Paiement client confirme',
                            message: `Le paiement de la commande ${transaction.order_id} est valide.`,
                            data: {
                                transaction_id: transaction.id,
                                order_id: transaction.order_id,
                                reference: transaction.reference,
                                payment_status: newStatus,
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
                                payment_status: newStatus,
                            },
                        }
                )
            }

            const { error: notificationError } = await supabaseClient
                .from('notifications')
                .insert(notifications)

            if (notificationError) {
                console.error('[Payment Callback] Notification error:', notificationError)
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
