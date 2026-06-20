import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handleSingPayCallback } from '../_shared/singpay.ts'

serve((req) => handleSingPayCallback(req))
