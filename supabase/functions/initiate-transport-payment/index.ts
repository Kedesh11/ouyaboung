import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { initiateTransportPayment } from '../_shared/pvit-transport.ts'

// Appelee uniquement a la demande de l'agriculteur ("Payer la course").
serve((req) => initiateTransportPayment({ req }))
