import { useQuery } from '@tanstack/react-query';
import { getMyDriverProfile, getAvailableForPickup, getDriverDeliveries } from '@/services';

/**
 * Hook to fetch the driver profile for a user (mirrors useFarmerProfile)
 */
export function useDriverProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['driver', 'profile', userId],
    queryFn: async () => {
      if (!userId) throw new Error("User ID required");
      const result = await getMyDriverProfile(userId);
      if (!result.success) throw new Error(result.error?.message || "Failed to fetch profile");
      return result.data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to fetch the pool of deliveries available for drivers to claim
 */
export function useAvailableDeliveries(enabled: boolean) {
  return useQuery({
    queryKey: ['driver', 'deliveries', 'available'],
    queryFn: async () => {
      const result = await getAvailableForPickup();
      if (!result.success) throw new Error(result.error?.message || "Failed to fetch deliveries");
      return result.data || [];
    },
    enabled,
    refetchInterval: 20000,
  });
}

/**
 * Hook to fetch a driver's active (non-terminal) deliveries
 */
export function useDriverActiveDeliveries(driverId: string | null | undefined) {
  return useQuery({
    queryKey: ['driver', 'deliveries', 'active', driverId],
    queryFn: async () => {
      if (!driverId) throw new Error("Driver ID required");
      const [accepted, pickedUp, inTransit] = await Promise.all([
        getDriverDeliveries(driverId, 'accepted'),
        getDriverDeliveries(driverId, 'picked_up'),
        getDriverDeliveries(driverId, 'in_transit'),
      ]);
      return [
        ...(accepted.data || []),
        ...(pickedUp.data || []),
        ...(inTransit.data || []),
      ];
    },
    enabled: !!driverId,
  });
}
