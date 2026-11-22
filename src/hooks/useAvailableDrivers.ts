import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAvailableDrivers, type AvailableDriver } from '@/api/driver-presence.api';
import { DRIVERS_MAP_POLL_MS, type VehicleType } from '@/lib/driver-presence';

export interface AvailableDriversParams {
  center: { latitude: number; longitude: number } | null;
  radiusKm: number;
  vehicleType: VehicleType | null;
  enabled?: boolean;
}

/** Erreur portant le code renvoye par le serveur (FORBIDDEN, NETWORK_ERROR, OFFLINE...). */
export class AvailableDriversError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'AvailableDriversError';
  }
}

// Une position GPS au 1/1000e de degre (~110 m): evite de recreer la requete a chaque micro-deplacement du centre.
const roundCoordinate = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Chauffeurs libres et operationnels autour d'un point, rafraichis en continu
 * tant que la page est visible (pas de requetes en arriere-plan).
 *
 * Sur connexion faible, la derniere liste connue reste affichee pendant que la
 * suivante charge ou echoue (`placeholderData`), plutot qu'une carte vide.
 */
export function useAvailableDrivers({ center, radiusKm, vehicleType, enabled = true }: AvailableDriversParams) {
  return useQuery<AvailableDriver[], AvailableDriversError>({
    queryKey: [
      'farmer',
      'available-drivers',
      center ? roundCoordinate(center.latitude) : null,
      center ? roundCoordinate(center.longitude) : null,
      radiusKm,
      vehicleType ?? 'all',
    ],
    queryFn: async () => {
      if (!center) throw new AvailableDriversError('NO_CENTER');
      const result = await getAvailableDrivers({
        latitude: center.latitude,
        longitude: center.longitude,
        radiusKm,
        vehicleType,
      });
      if (!result.success) throw new AvailableDriversError(result.error?.code || 'FAILED', result.error?.message);
      return result.data ?? [];
    },
    enabled: enabled && !!center,
    refetchInterval: DRIVERS_MAP_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    // Une erreur d'autorisation ne se corrige pas en reessayant.
    retry: (failureCount, error) => error.code !== 'FORBIDDEN' && failureCount < 1,
    staleTime: 0,
  });
}
