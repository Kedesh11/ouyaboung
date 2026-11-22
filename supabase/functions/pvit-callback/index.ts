import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { handlePvitCallback } from '../_shared/pvit.ts'

serve((req) => handlePvitCallback(req))
