import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { initiateSingPayPayment } from '../_shared/singpay.ts'

serve((req) => initiateSingPayPayment({ req, operator: 'airtel' }))
