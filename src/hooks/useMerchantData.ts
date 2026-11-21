
import { useQuery } from '@tanstack/react-query';
import {
    getMyMerchantProfile,
    getMerchantStats,
    getMerchantOrders,
    getMerchantItems,
    getActive // Import generic active orders fetcher
} from '@/services';
import type { OrderStatus } from '@/types';

/**
 * Hook to fetch the merchant profile for a user
 */
export function useMerchantProfile(userId: string | undefined) {
    return useQuery({
        queryKey: ['merchant', 'profile', userId],
        queryFn: async () => {
            if (!userId) throw new Error("User ID required");
            const result = await getMyMerchantProfile(userId);
            if (!result.success) throw new Error(result.error?.message || "Failed to fetch profile");
            return result.data;
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

/**
 * Hook to fetch merchant dashboard stats
 */
export function useMerchantStats(merchantId: string | null | undefined) {
    return useQuery({
        queryKey: ['merchant', 'stats', merchantId],
        queryFn: async () => {
            if (!merchantId) throw new Error("Merchant ID required");
            const result = await getMerchantStats(merchantId);
            if (!result.success) throw new Error(result.error?.message || "Failed to fetch stats");
            return result.data;
        },
        enabled: !!merchantId,
    });
}

/**
 * Hook to fetch merchant orders
 */
export function useMerchantOrders(
    merchantId: string | null | undefined,
    status?: OrderStatus | 'all',
    page: number = 1
) {
    return useQuery({
        queryKey: ['merchant', 'orders', merchantId, status, page],
        queryFn: async () => {
            if (!merchantId) throw new Error("Merchant ID required");

            const filterStatus = status === 'all' ? undefined : status;
            const result = await getMerchantOrders(merchantId, {
                status: filterStatus as OrderStatus | undefined,
                page,
                perPage: 5 // Default for dashboard preview
            });

            if (!result.success) throw new Error(result.error?.message || "Failed to fetch orders");
            return result.data;
        },
        enabled: !!merchantId,
    });
}

/**
 * Hook to fetch merchant food items (inventory)
 */
export function useMerchantItems(merchantId: string | null | undefined) {
    return useQuery({
        queryKey: ['merchant', 'items', merchantId],
        queryFn: async () => {
            if (!merchantId) throw new Error("Merchant ID required");
            const result = await getMerchantItems(merchantId, true);
            if (!result.success) throw new Error(result.error?.message || "Failed to fetch items");
            return result.data;
        },
        enabled: !!merchantId,
    });
}

/**
 * Hook to fetch active merchant orders count
 */
export function useMerchantActiveOrders(merchantId: string | null | undefined) {
    return useQuery({
        queryKey: ['merchant', 'active-orders', merchantId],
        queryFn: async () => {
            if (!merchantId) throw new Error("Merchant ID required");
            // getActiveOrders takes ({ userId, merchantId }) as object in service layer?
            // Checking service definition: export const getActive = async (options?: { userId?: string; merchantId?: string; })
            // Wait service exports `getActiveOrders` (aliased to getActiveOrdersApi in order.service.ts? No, let's check order.service.ts export)
            // In src/services/index.ts: getActiveOrders is exported from order.service.ts
            // In src/services/order.service.ts: export const getActiveOrders = async (options: { userId: string }) ... WAIT this is for USER ONLY?
            // I need to check order.service.ts again.

            // Re-reading order.service.ts content from Step 142...
            // Line 65: export const getActiveOrders = async (options: { userId: string }): Promise<ApiResponse<Order[]>> ...
            // This implementation strictly takes userId! It does not accept merchantId.

            // BUT, line 142: export const getActive = async (options?: { userId?: string; merchantId?: string; }): Promise<ApiResponse<Order[]>> ...
            // This one calls getActiveOrdersApi from @/api.

            // So I should use `getActive` from service, OR `getActiveOrders` from API directly? 
            // Better to use service. `getActive` is exported.

            // Let's assume I need to import `getActiveOrders` from API or `getActive` from service.
            // In src/services/index.ts line 87: getActiveOrders is exported... mapped to `getActiveOrders` from order.service.ts?
            // Line 87 says `getActiveOrders`.
            // Let's check src/services/order.service.ts exports again.
            // Line 65: export const getActiveOrders ...
            // Line 142: export const getActive ...

            // It seems `getActiveOrders` in service is for CONSUMER usage.
            // I should probably use `getActive` which seems more generic? 
            // Or use `getMerchantOrders` with status filter?

            // The user wants dynamic badges. The simplest reliable way for a count is fetching active orders.
            // Using `getMerchantOrders` with status='pending' might be safer if `getActive` is ambiguous.
            // But `getActiveOrders` from API layer (aliased as `getActiveOrdersApi` in service) handles both.
            // Use `getActive` from service in hooks.

            const result = await getActive({ merchantId });
            if (!result.success) throw new Error(result.error?.message || "Failed to fetch active orders");
            return result.data;
        },
        enabled: !!merchantId,
        refetchInterval: 30000, // Refresh every 30s
    });
}
