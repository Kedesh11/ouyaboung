
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const PAYMENT_FLOW_ENABLED = false

serve(async (req) => {
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
        console.log('[Airtel Function] Starting payment initiation (DEBUG V2)...')

        // 1. Auth check
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.error('[Airtel Function] Missing Authorization header')
            throw new Error('Missing Authorization header')
        }
        console.log('[Airtel Function] Auth header present:', authHeader.substring(0, 20) + '...')

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

        if (authError) {
             console.error('[Airtel Function] getUser Error:', JSON.stringify(authError))
        }
        if (!user) {
             console.error('[Airtel Function] No user found.')
        }

        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: { message: 'Invalid token', code: 'AUTH_FAILED', details: authError } }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        console.log('[Airtel Function] Authenticated user:', user.id)

        // 2. Payload
        const { phone: rawPhone, orderId, baseAmount } = await req.json()
        const phone = rawPhone.replace(/\s+/g, '')

        if (!phone || !orderId || !baseAmount) {
            return new Response(
                JSON.stringify({ success: false, error: { message: 'Missing required fields' } }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Airtel Function] Processing order:', orderId)

        // 3. Validate Order
        const { data: order, error: orderError } = await supabaseClient
            .from('orders')
            .select('id, merchant_id, user_id')
            .eq('id', orderId)
            .single()

        if (orderError || !order) {
            return new Response(
                JSON.stringify({ success: false, error: { message: 'Order not found' } }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (order.user_id !== user.id) {
            return new Response(
                JSON.stringify({ success: false, error: { message: 'Unauthorized access to order' } }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 4. Calculate Fees
        const airtelFees = Math.round(baseAmount * 0.03)
        const pvitFees = Math.round(baseAmount * 0.03)
        const appFees = Math.round(baseAmount * 0.03)
        const totalAmount = baseAmount + airtelFees + pvitFees + appFees

        // 5. Config
        const accountCode = Deno.env.get('ACCOUNT_CODE')
        const bearerToken = Deno.env.get('BEAR_TOKEN')

        if (!accountCode || !bearerToken) {
            console.error('[Airtel Function] Missing env vars')
            throw new Error('Server configuration error')
        }

        // ===================================================================
        // 6. INSERTION EN BASE (Statut PENDING avant appel)
        // ===================================================================

        const { data: transaction, error: txError } = await supabaseClient
            .from('transactions')
            .insert({
                order_id: orderId,
                merchant_id: order.merchant_id,
                user_id: user.id,
                phone: phone,
                amount: baseAmount,
                account_code: accountCode,
                product: 'paiement',
                agent: Deno.env.get('AGENT') || 'AG001',
                airtel_fees: airtelFees,
                pvit_fees: pvitFees,
                app_fees: appFees,
                total_amount: totalAmount,
                operator: 'AIRTEL_MONEY',
                status: 'PENDING',
                created_at: new Date().toISOString()
            })
            .select()
            .single()

        if (txError) {
            console.error('[Airtel Function] DB Insert Error:', txError)
            throw new Error('Transaction recording failed')
        }
        console.log('[Airtel Function] Transaction created (PENDING):', transaction.id)

        // 7. Q-Gabon API Call
        const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const baseUrl = projectUrl.replace(/\/$/, '')
        const callbackUrl = `${baseUrl}/functions/v1/airtel-callback`
        
        const qGabonPayload = {
            phone: phone,
            accountCode: accountCode,
            product: 'paiement',
            amount: totalAmount,
            agent: Deno.env.get('AGENT') || 'AG001',
            callbackUrl: callbackUrl
        }

        console.log('[Airtel Function] Calling API...')
        let qGabonData;
        let qGabonSuccess = false;

        try {
            const qGabonResponse = await fetch('https://payment.q-gabon.com/payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${bearerToken}`
                },
                body: JSON.stringify(qGabonPayload)
            })
    
            qGabonData = await qGabonResponse.json()
            qGabonSuccess = qGabonData.success
            console.log('[Airtel Function] API Response:', qGabonSuccess)
        } catch (fetchError) {
            console.error('[Airtel Function] API Call Failed:', fetchError)
            qGabonData = { error: fetchError }
            qGabonSuccess = false
        }

        // 8. Update Transaction
        const { data: updatedTransaction, error: updateError } = await supabaseClient
            .from('transactions')
            .update({
                q_gabon_response: qGabonData,
                transaction_id: qGabonData?.data?.transactionId,
                merchant_reference_id: qGabonData?.data?.merchant_reference_id,
                reference: qGabonData?.reference,
                status: qGabonSuccess ? 'PENDING' : 'FAILED',
                message: qGabonData?.data?.message || (qGabonSuccess ? 'Payment initiated' : 'Payment failed')
            })
            .eq('id', transaction.id)
            .select()
            .single()
        
        if (updateError) console.error('[Airtel Function] Update Error:', updateError)

        return new Response(
            JSON.stringify({
                success: qGabonData.success,
                data: {
                    transaction: updatedTransaction,
                    transactionId: updatedTransaction.id,
                    qGabonReference: updatedTransaction.reference,
                    totalAmount: updatedTransaction.total_amount,
                    status: updatedTransaction.status,
                    fees: { airtel: updatedTransaction.airtel_fees, pvit: updatedTransaction.pvit_fees, app: updatedTransaction.app_fees, total: updatedTransaction.airtel_fees + updatedTransaction.pvit_fees + updatedTransaction.app_fees },
                    message: updatedTransaction.message
                }
            }),
            { status: qGabonData.success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('[Airtel Function] Error:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: {
                    message: (error as Error).message || 'Internal Server Error',
                    code: 'INTERNAL_ERROR'
                }
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
