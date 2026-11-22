import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyTransportJobs,
  respondTransportRequest,
  updateTransportJobStatus,
  type DriverTransportJob,
} from '@/api/transport.api';
import { TRANSPORT_POLL_MS } from '@/lib/transport';
import { TransportError } from '@/hooks/useTransportRequest';

export const MY_TRANSPORT_JOBS_KEY = ['driver', 'transport-jobs'] as const;

/** Courses proposees ou en cours du chauffeur, rafraichies tant que la page est visible. */
export function useTransportJobs(enabled = true) {
  return useQuery<DriverTransportJob[], TransportError>({
    queryKey: MY_TRANSPORT_JOBS_KEY,
    queryFn: async () => {
      const result = await getMyTransportJobs();
      if (!result.success) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data ?? [];
    },
    enabled,
    refetchInterval: TRANSPORT_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, error) => error.code !== 'DRIVER_NOT_APPROVED' && failureCount < 1,
    staleTime: 0,
  });
}

export function useRespondTransportRequest() {
  const client = useQueryClient();
  return useMutation<{ declined: boolean; job: DriverTransportJob | null }, TransportError, { requestId: string; accept: boolean }>({
    mutationFn: async ({ requestId, accept }) => {
      const result = await respondTransportRequest(requestId, accept);
      if (!result.success || !result.data) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    // Succes ou echec (proposition expiree...): on recharge l'etat reel.
    onSettled: () => client.invalidateQueries({ queryKey: MY_TRANSPORT_JOBS_KEY }),
  });
}

export function useUpdateTransportJobStatus() {
  const client = useQueryClient();
  return useMutation<DriverTransportJob, TransportError, { requestId: string; status: 'picked_up' | 'delivered' }>({
    mutationFn: async ({ requestId, status }) => {
      const result = await updateTransportJobStatus(requestId, status);
      if (!result.success || !result.data) throw new TransportError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    onSettled: () => client.invalidateQueries({ queryKey: MY_TRANSPORT_JOBS_KEY }),
  });
}
