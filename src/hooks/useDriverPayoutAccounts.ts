import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDriverPayoutAccount,
  getDriverPayoutAccounts,
  verifyDriverPayoutAccount,
  type CreateDriverPayoutInput,
  type DriverPayoutAccount,
} from '@/services/payout.service';

export const driverPayoutKey = (driverId: string | undefined) => ['driver', 'payout-accounts', driverId] as const;

export class PayoutError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'PayoutError';
  }
}

/** Numeros Mobile Money du chauffeur (necessaires pour recevoir des courses). */
export function useDriverPayoutAccounts(driverId: string | undefined) {
  return useQuery<DriverPayoutAccount[], PayoutError>({
    queryKey: driverPayoutKey(driverId),
    queryFn: async () => {
      const result = await getDriverPayoutAccounts(driverId as string);
      if (!result.success) throw new PayoutError(result.error?.code || 'FAILED', result.error?.message);
      return result.data ?? [];
    },
    enabled: !!driverId,
    staleTime: 30_000,
  });
}

/** Ajoute un numero puis le fait verifier aupres de l'operateur (KYC). */
export function useAddDriverPayoutAccount(driverId: string | undefined) {
  const client = useQueryClient();
  return useMutation<{ verified: boolean; message?: string }, PayoutError, Omit<CreateDriverPayoutInput, 'driverId'>>({
    mutationFn: async (input) => {
      const created = await createDriverPayoutAccount({ ...input, driverId: driverId as string });
      if (!created.success || !created.data) throw new PayoutError(created.error?.code || 'FAILED', created.error?.message);
      const verification = await verifyDriverPayoutAccount(created.data.id);
      return verification.success ? { verified: true } : { verified: false, message: verification.error?.message };
    },
    onSettled: () => client.invalidateQueries({ queryKey: driverPayoutKey(driverId) }),
  });
}

/** Relance la verification d'un numero deja ajoute. */
export function useVerifyDriverPayoutAccount(driverId: string | undefined) {
  const client = useQueryClient();
  return useMutation<void, PayoutError, string>({
    mutationFn: async (accountId) => {
      const result = await verifyDriverPayoutAccount(accountId);
      if (!result.success) throw new PayoutError(result.error?.code || 'FAILED', result.error?.message);
    },
    onSettled: () => client.invalidateQueries({ queryKey: driverPayoutKey(driverId) }),
  });
}
