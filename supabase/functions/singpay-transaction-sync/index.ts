import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { syncSingPayTransactionStatus } from '../_shared/singpay.ts'

serve((req) => syncSingPayTransactionStatus(req))
