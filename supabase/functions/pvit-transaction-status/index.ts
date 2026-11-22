import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { syncPvitTransactionStatus } from '../_shared/pvit.ts'

serve((req) => syncPvitTransactionStatus(req))
