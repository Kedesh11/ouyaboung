import { useQuery } from '@tanstack/react-query';
import { getMyFarmerProfile, getFarmerItems } from '@/services';

/**
 * Hook to fetch the farmer profile for a user
 */
export function useFarmerProfile(userId: string | undefined) {
    return useQuery({
        queryKey: ['farmer', 'profile', userId],
        queryFn: async () => {
            if (!userId) throw new Error("User ID required");
            const result = await getMyFarmerProfile(userId);
            if (!result.success) throw new Error(result.error?.message || "Failed to fetch profile");
            return result.data;
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

/**
 * Hook to fetch a farmer's catalogue (mirrors useMerchantItems)
 */
export function useFarmerItems(farmerId: string | null | undefined) {
    return useQuery({
        queryKey: ['farmer', 'items', farmerId],
        queryFn: async () => {
            if (!farmerId) throw new Error("Farmer ID required");
            const result = await getFarmerItems(farmerId, true);
            if (!result.success) throw new Error(result.error?.message || "Failed to fetch items");
            return result.data;
        },
        enabled: !!farmerId,
    });
}
