import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { initiateSingPayPayment } from '../_shared/singpay.ts'

const normalizePhone = (rawPhone: unknown): string => {
  if (typeof rawPhone !== 'string') return ''
  let cleaned = rawPhone.replace(/\D/g, '')

  if (cleaned.startsWith('241') && cleaned.length === 11) {
    cleaned = `0${cleaned.slice(3)}`
  }

  if (cleaned.length === 8) {
    cleaned = `0${cleaned}`
  }

  return cleaned
}

const detectOperator = async (req: Request): Promise<'airtel' | 'moov'> => {
  if (req.method === 'OPTIONS') return 'airtel'

  const clone = req.clone()
  const body = await clone.json().catch(() => ({}))
  const forced = String(body?.operator || '').toLowerCase()
  const phone = normalizePhone(body?.phone)
  const localPhone = phone.startsWith('0') ? phone.slice(1) : phone

  if (forced.includes('moov') || forced.includes('libertis')) return 'moov'
  if (forced.includes('airtel')) return 'airtel'
  if (['66', '62', '65'].some((prefix) => localPhone.startsWith(prefix))) return 'moov'
  return 'airtel'
}

serve(async (req) => initiateSingPayPayment({ req, operator: await detectOperator(req) }))
