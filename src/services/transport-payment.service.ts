/**
 * Paiement d'un transport (agriculteur -> chauffeur) par Mobile Money PVIT.
 *
 * Fonction isolee, appelee uniquement quand l'agriculteur clique sur "Payer la course":
 * rien n'est declenche automatiquement. Le client n'envoie que l'identifiant de la
 * course, son numero et l'operateur: le tarif, la commission et le compte du chauffeur
 * sont ceux figes cote serveur.
 */

import { requireSupabaseClient, isSupabaseConfigured } from '@/api/supabaseClient';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';
import { PAYMENT_FLOW_ENABLED } from '@/services/payment.service';
import { getAirtelPhoneError, getMoovPhoneError, normalizePhone } from '@/lib/phone-validation';
import type { ApiResponse } from '@/types';

export type TransportPaymentOperator = 'airtel' | 'moov';

export interface TransportPaymentInitiation {
  paymentId: string;
  /** Reference du paiement: permet de resynchroniser son statut. */
  reference: string;
  totalAmount: number;
  driverAmount: number;
  platformFee: number;
  status: string;
  message: string;
}

const failure = <T,>(code: string, message: string): ApiResponse<T> => ({ data: null, error: { code, message }, success: false });

export const payTransport = async (input: {
  requestId: string;
  phone: string;
  operator: TransportPaymentOperator;
}): Promise<ApiResponse<TransportPaymentInitiation>> => {
  if (!PAYMENT_FLOW_ENABLED) {
    return failure('PAYMENT_DISABLED', 'Paiement temporairement desactive par administration.');
  }
  if (!isSupabaseConfigured()) return failure('NOT_CONFIGURED', 'Supabase non configure.');

  const phoneError = input.operator === 'airtel' ? getAirtelPhoneError(input.phone) : getMoovPhoneError(input.phone);
  if (phoneError) return failure('INVALID_PHONE', phoneError);
  const phone = normalizePhone(input.phone);
  if (!phone) return failure('PHONE_NORMALIZATION_ERROR', 'Numero Mobile Money invalide.');

  const { url } = getSupabasePublicEnv();
  if (!url) return failure('NOT_CONFIGURED', "URL d'Edge Function non configuree.");

  try {
    const client = requireSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return failure('NO_SESSION', 'Session expiree. Veuillez vous reconnecter.');

    const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/initiate-transport-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ requestId: input.requestId, phone, operator: input.operator }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      return failure(payload?.error?.code || 'PAYMENT_FAILED', payload?.error?.message || 'Echec du paiement.');
    }
    return { data: payload.data as TransportPaymentInitiation, error: null, success: true };
  } catch {
    return failure('NETWORK_ERROR', 'Reseau indisponible. Reessayez dans un instant.');
  }
};
