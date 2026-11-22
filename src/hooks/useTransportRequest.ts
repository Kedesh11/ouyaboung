import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelTransportRequest,
  createTransportRequest,
  getMyTransportRequest,
  quoteTransport,
  type CreateTransportRequestInput,
  type FarmerTransportRequest,
  type TransportPoint,
  type TransportQuote,
} from '@/api/transport.api';
import type { VehicleType } from '@/lib/driver-presence';
import {
  payTransport,
  type TransportPaymentInitiation,
  type TransportPaymentOperator,
} from '@/services/transport-payment.service';
import { syncPaymentTransactionStatus } from '@/services/payment-transactions.service';
import { isActiveTransport, TRANSPORT_POLL_MS } from '@/lib/transport';

export const MY_TRANSPORT_REQUEST_KEY = ['farmer', 'transport-request'] as const;

/** Erreur portant le code renvoye par le serveur (ACTIVE_REQUEST_EXISTS, NO_DRIVER_AVAILABLE...). */
export class TransportError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'TransportError';
  }
}

/**
 * Demande de transport de l'agriculteur, rafraichie tant qu'elle est en cours (proposition,
 * course acceptee) et plus lentement ensuite. Le serveur fait avancer les propositions expirees.
 */
export function useMyTransportRequest(enabled = true) {
  return useQuery<FarmerTransportRequest | null, TransportError>({
    queryKey: MY_TRANSPORT_REQUEST_KEY,
    queryFn: async () => {
      const result = await getMyTransportRequest();
      if (!result.success) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data ?? null;
    },
    enabled,
    refetchInterval: (query) => (isActiveTransport(query.state.data?.status) ? TRANSPORT_POLL_MS : 30_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, error) => error.code !== 'FORBIDDEN' && failureCount < 1,
    staleTime: 0,
  });
}

export function useCreateTransportRequest() {
  const client = useQueryClient();
  return useMutation<FarmerTransportRequest, TransportError, CreateTransportRequestInput>({
    mutationFn: async (input) => {
      const result = await createTransportRequest(input);
      if (!result.success || !result.data) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    onSuccess: (request) => {
      client.setQueryData(MY_TRANSPORT_REQUEST_KEY, request);
      // Le chauffeur propose n'est plus libre: la carte doit se rafraichir.
      void client.invalidateQueries({ queryKey: ['farmer', 'available-drivers'] });
    },
  });
}

export function useCancelTransportRequest() {
  const client = useQueryClient();
  return useMutation<FarmerTransportRequest, TransportError, string>({
    mutationFn: async (requestId) => {
      const result = await cancelTransportRequest(requestId);
      if (!result.success || !result.data) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    onSuccess: (request) => {
      client.setQueryData(MY_TRANSPORT_REQUEST_KEY, request);
      void client.invalidateQueries({ queryKey: ['farmer', 'available-drivers'] });
    },
  });
}

export interface TransportQuoteParams {
  vehicleType: VehicleType | null;
  dropoff: TransportPoint | null;
  pickup: TransportPoint | null;
  enabled?: boolean;
}

// Au 1/10000e de degre (~11 m): evite de redemander un devis pour un micro-deplacement du marqueur.
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/** Tarif fixe du trajet, recalcule quand le vehicule ou la destination change. */
export function useTransportQuote({ vehicleType, dropoff, pickup, enabled = true }: TransportQuoteParams) {
  return useQuery<TransportQuote, TransportError>({
    queryKey: [
      'farmer',
      'transport-quote',
      vehicleType,
      dropoff ? round4(dropoff.latitude) : null,
      dropoff ? round4(dropoff.longitude) : null,
      pickup ? round4(pickup.latitude) : null,
      pickup ? round4(pickup.longitude) : null,
    ],
    queryFn: async () => {
      const result = await quoteTransport({ vehicleType: vehicleType as VehicleType, dropoff: dropoff as TransportPoint, pickup });
      if (!result.success || !result.data) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    enabled: enabled && !!vehicleType && !!dropoff,
    staleTime: 60_000,
    retry: (failureCount, error) => !['TOO_FAR', 'TARIFF_UNAVAILABLE', 'PICKUP_REQUIRED', 'INVALID_POSITION'].includes(error.code) && failureCount < 1,
  });
}

/** Paiement de la course (appele seulement au clic sur "Payer"). */
export function usePayTransport() {
  const client = useQueryClient();
  return useMutation<TransportPaymentInitiation, TransportError, { requestId: string; phone: string; operator: TransportPaymentOperator }>({
    mutationFn: async (input) => {
      const result = await payTransport(input);
      if (!result.success || !result.data) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    // Succes ou echec: l'etat reel (pending / unpaid / paid) vient du serveur.
    onSettled: () => client.invalidateQueries({ queryKey: MY_TRANSPORT_REQUEST_KEY }),
  });
}

/** Resynchronise le statut aupres de PVIT quand la confirmation tarde. */
export function useSyncTransportPayment() {
  const client = useQueryClient();
  return useMutation<unknown, TransportError, string>({
    mutationFn: async (reference) => {
      const result = await syncPaymentTransactionStatus({ reference });
      if (!result.success) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    onSettled: () => client.invalidateQueries({ queryKey: MY_TRANSPORT_REQUEST_KEY }),
  });
}
