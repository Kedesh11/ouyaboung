/**
 * Edge Function: Initiate Payment
 * 
 * Processus:
 * 1. Authentification utilisateur via JWT
 * 2. Validation business logic
 * 3. Calcul des frais (3% + 3% + 3%)
 * 4. Appel API Q-Gabon
 * 5. Création transaction en base
 * 6. Notification temps réel
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const PAYMENT_FLOW_ENABLED = true

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (!PAYMENT_FLOW_ENABLED) {
        return new Response(
            JSON.stringify({
                success: false,
                error: { message: 'Payment flow disabled', code: 'PAYMENT_DISABLED' }
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        // ===================================================================
        // 1. AUTHENTIFICATION
        // ===================================================================
        
        console.log('[Edge Function] initiate-payment called (v2-debug)')

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.error('[Edge Function] Missing Authorization header')
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: { message: 'Unauthorized', code: 'NO_AUTH_HEADER' },
                    debug: 'Header missing'
                }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Créer le client Supabase avec le token utilisateur
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: authHeader }
                }
            }
        )

        // Vérifier authentification
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

        if (authError || !user) {
            console.error('[Edge Function] Authentication failed:', authError?.message)
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: { message: 'Invalid token', code: 'AUTH_FAILED', details: authError },
                    debug: 'Auth check failed'
                }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Edge Function] Authenticated user:', user.id)

        // ===================================================================
        // 2. PARSE ET VALIDATION DU PAYLOAD
        // ===================================================================

        const { phone: rawPhone, orderId, operator: forcedOperator } = await req.json()
        const phone = typeof rawPhone === 'string' ? rawPhone.replace(/\s+/g, '') : ''

        if (!phone || !orderId) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { message: 'Missing required fields', code: 'INVALID_PAYLOAD' }
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Edge Function] Request:', { orderId, baseAmount, phone: phone.slice(0, 3) + '****' })

        // ===================================================================
        // 3. RÉCUPÉRATION DE LA COMMANDE
        // ===================================================================

        const { data: order, error: orderError } = await supabaseClient
            .from('orders')
            .select('id, merchant_id, user_id, status, total_price')
            .eq('id', orderId)
            .single()

        if (orderError || !order) {
            console.error('[Edge Function] Order not found:', orderId)
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { message: 'Order not found', code: 'ORDER_NOT_FOUND' }
                }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Vérifier que c'est bien la commande de l'utilisateur
        if (order.user_id !== user.id) {
            console.error('[Edge Function] Order ownership mismatch')
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { message: 'Unauthorized access to order', code: 'ORDER_OWNERSHIP' }
                }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (order.status !== 'pending') {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { message: 'Order is not awaiting payment', code: 'INVALID_ORDER_STATUS' }
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const baseAmount = Number(order.total_price)
        if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { message: 'Invalid order amount', code: 'INVALID_AMOUNT' }
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ===================================================================
        // 4. CALCUL DES FRAIS (3% + 3% + 3% = 9%)
        // ===================================================================

        const calculateFees = (amount: number) => {
            const airtelFees = Math.round(amount * 0.03)
            const pvitFees = Math.round(amount * 0.03)
            const appFees = Math.round(amount * 0.03)
            return {
                airtelFees,
                pvitFees,
                appFees,
                totalAmount: amount + airtelFees + pvitFees + appFees
            }
        }

        const fees = calculateFees(baseAmount)
        console.log('[Edge Function] Fees calculated:', fees)

        // ===================================================================
        // 4.5 DÉTECTION OPÉRATEUR ET CONFIGURATION
        // ===================================================================

        // Préfixes Airtel: 074, 076, 077, 74, 76, 77
        // Préfixes Moov: 066, 062, 065, 66, 62, 65
        const isMoov = forcedOperator === 'MOOV' || ['066', '062', '065', '66', '62', '65'].some(p => phone.startsWith(p))
        const operator = isMoov ? 'MOOV_MONEY' : 'AIRTEL_MONEY'
        const accountCode = isMoov
            ? (Deno.env.get('ACCOUNT_CODE_MOOV') ?? Deno.env.get('ACCOUNT_CODE'))
            : Deno.env.get('ACCOUNT_CODE')

        console.log(`[Edge Function] Operator detected: ${operator}, AccountCode used: ${accountCode}`)

        // ===================================================================
        // 5. APPEL API Q-GABON
        // ===================================================================

        // ===================================================================
        // 5. INSERTION EN BASE (Statut PENDING avant appel)
        // ===================================================================

        const { data: transaction, error: txError } = await supabaseClient
            .from('transactions')
            .insert({
                order_id: orderId,
                merchant_id: order.merchant_id,
                user_id: user.id,
                phone: phone,
                amount: baseAmount,
                account_code: accountCode, // Use variable from scope
                product: 'paiement',
                agent: Deno.env.get('AGENT'),
                airtel_fees: fees.airtelFees,
                pvit_fees: fees.pvitFees,
                app_fees: fees.appFees,
                total_amount: fees.totalAmount,
                operator: operator,
                status: 'PENDING', // Initial status before external call
                created_at: new Date().toISOString()
            })
            .select()
            .single()

        if (txError) {
            console.error('[Edge Function] Transaction insert error:', txError)
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { message: 'Failed to create transaction', code: 'DB_ERROR', details: txError }
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Edge Function] Transaction created (PENDING):', transaction.id)

        // ===================================================================
        // 6. APPEL API Q-GABON
        // ===================================================================

        // Détérminer l'URL de callback appropriée
        const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const baseUrl = projectUrl.replace(/\/$/, '')
        const callbackEndpoint = isMoov ? 'moov-callback' : 'airtel-callback'
        const callbackUrl = `${baseUrl}/functions/v1/${callbackEndpoint}`

        console.log(`[Edge Function] Callback URL set to: ${callbackUrl}`)

        const qGabonPayload = {
            phone: phone,
            accountCode: accountCode,
            product: 'paiement',
            amount: fees.totalAmount,
            agent: Deno.env.get('AGENT'),
            callbackUrl: callbackUrl
        }

        console.log('[Edge Function] Calling Q-Gabon API...')

        let qGabonData;
        let qGabonSuccess = false;

        try {
            const qGabonResponse = await fetch('https://payment.q-gabon.com/payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('BEAR_TOKEN')}`
                },
                body: JSON.stringify(qGabonPayload)
            })
            
            qGabonData = await qGabonResponse.json()
            qGabonSuccess = qGabonData.success
            console.log('[Edge Function] Q-Gabon response:', { success: qGabonSuccess, status: qGabonData.data?.status })

        } catch (fetchError) {
            console.error('[Edge Function] Q-Gabon API call failed:', fetchError)
            qGabonData = { error: fetchError }
            qGabonSuccess = false
        }

        // ===================================================================
        // 7. mise à jour TRANSACTION (Update with response)
        // ===================================================================

        const { data: updatedTransaction, error: updateError } = await supabaseClient
            .from('transactions')
            .update({
                q_gabon_response: qGabonData,
                transaction_id: qGabonData?.data?.transactionId,
                merchant_reference_id: qGabonData?.data?.merchant_reference_id || qGabonData?.data?.merchantReferenceId,
                reference: qGabonData?.reference,
                operator_fees: qGabonData?.data?.operatorFees,
                // Only mark as FAILED if explicitly failed, otherwise keep PENDING (waiting for callback or user action)
                // If API call success=false, mark FAILED.
                status: qGabonSuccess ? 'PENDING' : 'FAILED', 
                status_code: String(qGabonData?.data?.code || qGabonData?.data?.status_code || ''),
                message: qGabonData?.data?.message || (qGabonSuccess ? 'Payment initiated' : 'Payment init failed'),
            })
            .eq('id', transaction.id)
            .select()
            .single()

        if (updateError) {
            console.error('[Edge Function] Transaction update error:', updateError)
            // Even if update fails, we should probably return the error, but the transaction exists.
        }

        // ===================================================================
        // 7. NOTIFICATION TEMPS RÉEL (Supabase Realtime)
        // ===================================================================

        // Les inserts dans la table transactions déclenchent automatiquement
        // les events Realtime si le client est abonné au channel

        // ===================================================================
        // 8. RETOUR DU RÉSULTAT
        // ===================================================================

        return new Response(
            JSON.stringify({
                success: qGabonData.success,
                data: {
                    transaction: updatedTransaction, // Return full transaction object
                    transactionId: updatedTransaction.id,
                    qGabonReference: updatedTransaction.reference,
                    totalAmount: updatedTransaction.total_amount,
                    fees: {
                        airtel: updatedTransaction.airtel_fees,
                        pvit: updatedTransaction.pvit_fees,
                        app: updatedTransaction.app_fees,
                        total: updatedTransaction.airtel_fees + updatedTransaction.pvit_fees + updatedTransaction.app_fees
                    },
                    status: updatedTransaction.status,
                    message: updatedTransaction.message
                }
            }),
            {
                status: qGabonData.success ? 200 : 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )

    } catch (error) {
        console.error('[Edge Function] Unexpected error:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: {
                    message: (error as Error).message || 'Internal server error',
                    code: 'UNEXPECTED_ERROR',
                    details: error
                }
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
