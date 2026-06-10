import { callEdgeFunctionWithAuth } from '@/lib/auth/edge-function-client';

export interface PickupValidationResult {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
  order?: {
    id: string;
    productName: string;
    quantity: number;
    totalPrice: number;
    customerName: string;
    customerPhone: string;
    confirmedAt: string;
    consumedAt: string;
  };
}

type ValidateQrApiResponse = PickupValidationResult;

export const validatePickupCode = async (
  pickupCode: string,
  options?: { timeoutMs?: number }
): Promise<{
  ok: boolean;
  status: number;
  result: PickupValidationResult | null;
}> => {
  const edgeResult = await callEdgeFunctionWithAuth<ValidateQrApiResponse>({
    functionName: 'validate-qr',
    body: { pickup_code: pickupCode },
    retryOnUnauthorized: true,
    timeoutMs: options?.timeoutMs ?? 9000,
  });

  if (!edgeResult.ok) {
    const statusCode = edgeResult.status;
    const defaultError =
      statusCode === 0
        ? 'La validation a expire (timeout) ou la connexion est indisponible.'
        : statusCode === 401
          ? 'Acces non autorise. Reconnectez-vous puis reessayez.'
          : statusCode === 403
            ? 'Compte marchand non autorise pour valider cette commande.'
            : 'Erreur lors de la validation du code.';

    return {
      ok: false,
      status: statusCode,
      result: {
        success: false,
        error: edgeResult.error?.error || edgeResult.error?.message || defaultError,
        code:
          edgeResult.error?.code ||
          (statusCode === 0
            ? 'NETWORK_OR_TIMEOUT'
            : statusCode === 401
              ? 'UNAUTHORIZED'
              : statusCode === 403
                ? 'FORBIDDEN'
                : 'VALIDATION_ERROR'),
      },
    };
  }

  return {
    ok: true,
    status: edgeResult.status,
    result: edgeResult.data,
  };
};
