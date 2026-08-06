import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/admin.service';
import type { MerchantRegistration, FarmerRegistration } from '@/types/admin.types';

/**
 * Hook to fetch the full merchant directory for the admin dashboard.
 * Filtering/pagination stays client-side (small dataset), matching the
 * previous manual-fetch behavior - this only replaces the fetch/cache/error
 * plumbing with React Query so mutations can invalidate it explicitly
 * instead of hand-patching local state.
 */
export function useAdminMerchants() {
  return useQuery<MerchantRegistration[]>({
    queryKey: ['admin', 'merchants'],
    queryFn: () => adminService.getMerchants(),
    staleTime: 1000 * 60,
  });
}

export function useInvalidateAdminMerchants() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'merchants'] });
}

/**
 * Hook to fetch the full farmer directory for the admin dashboard.
 * Mirrors useAdminMerchants() above.
 */
export function useAdminFarmers() {
  return useQuery<FarmerRegistration[]>({
    queryKey: ['admin', 'farmers'],
    queryFn: () => adminService.getFarmers(),
    staleTime: 1000 * 60,
  });
}

export function useInvalidateAdminFarmers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'farmers'] });
}
