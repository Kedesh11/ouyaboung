import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { OFFLINE_ACTION_TYPES } from '@/lib/offline/actions';
import { isBrowserOffline, isLikelyOfflineError } from '@/lib/offline/cache';
import { enqueueOfflineQueueItem } from '@/lib/offline/queue';
import type { ApiResponse } from '@/types';

/**
 * Cancel an order using RPC function (bypasses RLS issues)
 */
export const cancelOrderViaRPCOnline = async (
    orderId: string,
    reason?: string
): Promise<ApiResponse<any>> => {
    if (!isSupabaseConfigured()) {
        return {
            data: null,
            error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
            success: false,
        };
    }

    const client = requireSupabaseClient();
    try {
        const { data, error } = await client.rpc('cancel_user_order', {
            p_order_id: orderId,
            p_cancellation_reason: reason || null,
        });

        if (error) {
            return {
                data: null,
                error: { code: error.code, message: error.message },
                success: false,
            };
        }

        // The RPC function returns a JSON object with success/error
        if (data && typeof data === 'object') {
            if (data.success === false) {
                return {
                    data: null,
                    error: { code: 'RPC_ERROR', message: data.error || 'Unknown error' },
                    success: false,
                };
            }

            return {
                data: data.data,
                error: null,
                success: true,
            };
        }

        return {
            data: null,
            error: { code: 'INVALID_RESPONSE', message: 'Invalid RPC response' },
            success: false,
        };
    } catch (err: any) {
        return {
            data: null,
            error: { code: 'EXCEPTION', message: err.message || 'Unknown error' },
            success: false,
        };
    }
};

export const cancelOrderViaRPC = async (
    orderId: string,
    reason?: string
): Promise<ApiResponse<any>> => {
    const queueCancellation = (): ApiResponse<any> => {
        const queued = enqueueOfflineQueueItem(OFFLINE_ACTION_TYPES.CANCEL_ORDER, {
            orderId,
            reason,
        });
        return {
            data: null,
            error: {
                code: 'OFFLINE_QUEUED',
                message: 'Annulation enregistree hors ligne. Elle sera synchronisee automatiquement.',
                details: { queue_action_id: queued.id },
            },
            success: false,
        };
    };

    if (isBrowserOffline()) {
        return queueCancellation();
    }

    const result = await cancelOrderViaRPCOnline(orderId, reason);
    if (!result.success && isLikelyOfflineError(result.error)) {
        return queueCancellation();
    }
    return result;
};
