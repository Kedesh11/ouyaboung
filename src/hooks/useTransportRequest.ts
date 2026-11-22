import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelTransportRequest,
  createTransportRequest,
  getMyTransportRequest,
  type CreateTransportRequestInput,
  type FarmerTransportRequest,
} from '@/api/transport.api';
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
