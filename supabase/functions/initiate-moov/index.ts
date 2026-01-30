
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
        console.log('[Moov Function] Starting payment initiation (DEBUG V2)...')

        // 1. Auth check
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.error('[Moov Function] Missing Authorization header')
            throw new Error('Missing Authorization header')
        }
        console.log('[Moov Function] Auth header present:', authHeader.substring(0, 20) + '...')

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

        if (authError) {
             console.error('[Moov Function] getUser Error:', JSON.stringify(authError))
        }
        if (!user) {
             console.error('[Moov Function] No user found.')
        }

        if (authError || !user) {
            console.error('[Moov Function] Auth missing:', authError)
            return new Response(
                JSON.stringify({ success: false, error: { message: 'Invalid token', code: 'AUTH_FAILED', details: authError } }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        console.log('[Moov Function] Authenticated user:', user.id)

        // 2. Payload
        const { phone: rawPhone, orderId, baseAmount } = await req.json()
        const phone = rawPhone.replace(/\s+/g, '')

        if (!phone || !orderId || !baseAmount) {
            return new Response(
                JSON.stringify({ success: false, error: { message: 'Missing required fields' } }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('[Moov Function] Processing order:', orderId)

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
        // IMPORTANT: MOOV Specific
        const accountCode = Deno.env.get('ACCOUNT_CODE_MOOV') ?? Deno.env.get('ACCOUNT_CODE')
        const bearerToken = Deno.env.get('BEAR_TOKEN')

        if (!accountCode || !bearerToken) {
            console.error('[Moov Function] Missing env vars')
            throw new Error('Server configuration error')
        }

        // 6. Q-Gabon API Call
        const qGabonPayload = {
            phone: phone,
            accountCode: accountCode,
            product: 'paiement',
            amount: totalAmount,
            agent: Deno.env.get('AGENT') || 'AG001'
        }

        console.log('[Moov Function] Calling API with Account:', accountCode)
        const qGabonResponse = await fetch('https://payment.q-gabon.com/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`
            },
            body: JSON.stringify(qGabonPayload)
        })

        const qGabonData = await qGabonResponse.json()
        console.log('[Moov Function] API Response:', qGabonData.success)

        // 7. Save Transaction
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
                agent: qGabonPayload.agent,
                airtel_fees: airtelFees,
                pvit_fees: pvitFees,
                app_fees: appFees,
                total_amount: totalAmount,
                q_gabon_response: qGabonData,
                transaction_id: qGabonData.data?.transactionId,
                merchant_reference_id: qGabonData.data?.merchant_reference_id,
                reference: qGabonData.reference,
                operator: 'MOOV_MONEY',
                status: qGabonData.success ? 'PENDING' : 'FAILED',
                message: qGabonData.data?.message || (qGabonData.success ? 'Payment initiated' : 'Payment failed')
            })
            .select()
            .single()

        if (txError) {
            console.error('[Moov Function] DB Insert Error:', txError)
            throw new Error('Transaction recording failed')
        }

        return new Response(
            JSON.stringify({
                success: qGabonData.success,
                data: {
                    transactionId: transaction.id,
                    qGabonReference: qGabonData.reference,
                    totalAmount: totalAmount,
                    status: transaction.status,
                    fees: { airtel: airtelFees, pvit: pvitFees, app: appFees, total: airtelFees + pvitFees + appFees },
                    message: transaction.message
                }
            }),
            { status: qGabonData.success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('[Moov Function] Error:', error)
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
