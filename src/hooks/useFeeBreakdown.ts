import { useQuery } from '@tanstack/react-query';
import { getFeeBreakdown, type FeeBreakdown, type FeeFlow, type FeeOperator } from '@/api/fees.api';

export class FeeError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'FeeError';
  }
}

interface Params {
  flow: FeeFlow;
  baseAmount: number | null | undefined;
  operator: FeeOperator;
  enabled?: boolean;
}

/**
 * Detail de ce que paiera le client (prix + commission + frais PVIT + frais operateur).
 * Recharge a chaque retour sur la page: les taux sont reglables par l'admin a tout moment.
 */
export function useFeeBreakdown({ flow, baseAmount, operator, enabled = true }: Params) {
  const valid = Number.isInteger(baseAmount) && (baseAmount as number) > 0;
  return useQuery<FeeBreakdown, FeeError>({
    queryKey: ['fees', 'breakdown', flow, baseAmount, operator],
    queryFn: async () => {
      const result = await getFeeBreakdown(flow, baseAmount as number, operator);
      if (!result.success || !result.data) throw new FeeError(result.error?.code || 'FAILED', result.error?.message);
      return result.data;
    },
    enabled: enabled && valid,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !['INVALID_AMOUNT', 'INVALID_FLOW', 'INVALID_OPERATOR'].includes(error.code) && count < 1,
  });
}
