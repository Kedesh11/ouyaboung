import { createOrder } from '@/api/orders.api';
import { cancelOrderViaRPCOnline } from '@/api/orders-rpc.api';
import {
  OFFLINE_ACTION_TYPES,
  type CancelOrderOfflinePayload,
  type CreateReservationOfflinePayload,
} from '@/lib/offline/actions';
import { isBrowserOnline, isLikelyOfflineError } from '@/lib/offline/cache';
import { getOfflineQueue, saveOfflineQueue, type OfflineQueueItem } from '@/lib/offline/queue';

const MAX_RETRY_ATTEMPTS = 10;

export interface OfflineSyncResult {
  processed: number;
  failed: number;
  dropped: number;
  remaining: number;
}

let activeSyncPromise: Promise<OfflineSyncResult> | null = null;

const shouldDropAction = (code?: string): boolean => {
  if (!code) return false;
  const permanentCodes = new Set([
    'NOT_FOUND',
    'INSUFFICIENT_QUANTITY',
    'MERCHANT_NOT_APPROVED',
    'MERCHANT_NOT_FOUND',
    'INVALID_RESPONSE',
    'INVALID_ORDER_STATUS',
    'INVALID_CODE',
  ]);
  return permanentCodes.has(code);
};

const processCreateReservation = async (
  payload: CreateReservationOfflinePayload
): Promise<{ success: boolean; code?: string; message?: string }> => {
  const result = await createOrder(payload.userId, {
    food_item_id: payload.itemId,
    quantity: payload.quantity,
  });
  return {
    success: result.success,
    code: result.error?.code,
    message: result.error?.message,
  };
};

const processCancelOrder = async (
  payload: CancelOrderOfflinePayload
): Promise<{ success: boolean; code?: string; message?: string }> => {
  const result = await cancelOrderViaRPCOnline(payload.orderId, payload.reason);
  return {
    success: result.success,
    code: result.error?.code,
    message: result.error?.message,
  };
};

const processQueueImpl = async (): Promise<OfflineSyncResult> => {
  const queue = getOfflineQueue();
  if (!queue.length || !isBrowserOnline()) {
    return { processed: 0, failed: 0, dropped: 0, remaining: queue.length };
  }

  const nextQueue: OfflineQueueItem[] = [];
  let processed = 0;
  let failed = 0;
  let dropped = 0;

  for (const item of queue) {
    let outcome: { success: boolean; code?: string; message?: string };

    try {
      if (item.type === OFFLINE_ACTION_TYPES.CREATE_RESERVATION) {
        outcome = await processCreateReservation(item.payload as CreateReservationOfflinePayload);
      } else if (item.type === OFFLINE_ACTION_TYPES.CANCEL_ORDER) {
        outcome = await processCancelOrder(item.payload as CancelOrderOfflinePayload);
      } else {
        outcome = { success: false, code: 'UNKNOWN_ACTION', message: 'Unknown queued action type' };
      }
    } catch (error) {
      outcome = {
        success: false,
        code: 'EXCEPTION',
        message: error instanceof Error ? error.message : 'Unexpected sync error',
      };
    }

    if (outcome.success) {
      processed += 1;
      continue;
    }

    const retries = item.attempts + 1;
    const likelyOffline = isLikelyOfflineError(outcome);
    const dropNow = shouldDropAction(outcome.code) || (!likelyOffline && retries >= MAX_RETRY_ATTEMPTS);

    if (dropNow) {
      dropped += 1;
      continue;
    }

    failed += 1;
    nextQueue.push({
      ...item,
      attempts: retries,
      lastAttemptAt: new Date().toISOString(),
      lastError: outcome.message || outcome.code || 'UNKNOWN_ERROR',
    });
  }

  saveOfflineQueue(nextQueue);

  return {
    processed,
    failed,
    dropped,
    remaining: nextQueue.length,
  };
};

export const processOfflineQueue = async (): Promise<OfflineSyncResult> => {
  if (activeSyncPromise) return activeSyncPromise;
  activeSyncPromise = processQueueImpl().finally(() => {
    activeSyncPromise = null;
  });
  return activeSyncPromise;
};

