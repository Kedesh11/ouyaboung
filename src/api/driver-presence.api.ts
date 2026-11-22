// ============================================
// Driver presence API - position en direct des chauffeurs
// Tout passe par des RPC (la table driver_presence n'est pas accessible en direct).
// ============================================

import { callRpc } from './rpc';
import type { ApiResponse } from '@/types';
import type { VehicleType } from '@/lib/driver-presence';

export interface DriverPresenceState {
  /** NULL tant que le chauffeur n'a pas pris connaissance du message d'information (n'empeche pas le partage). */
  notice_ack_at: string | null;
  /** Disponible par defaut: false seulement si le chauffeur a coupe le partage. */
  is_available: boolean;
  last_sent_at: string | null;
}

export interface AvailableDriver {
  driver_id: string;
  /** Prenom + initiale du nom: jamais le nom complet ni la plaque. */
  display_name: string;
  /** Visible des agriculteurs verifies pour appeler le chauffeur. */
  phone: string | null;
  vehicle_type: VehicleType;
  rating: number;
  total_reviews: number;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
  age_seconds: number;
  distance_km: number;
}

export interface PublishPositionInput {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

export interface AvailableDriversQuery {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  vehicleType?: VehicleType | null;
  limit?: number;
}

export const getMyDriverPresence = (): Promise<ApiResponse<DriverPresenceState>> =>
  callRpc('get_my_driver_presence', undefined, (p) => ({
    notice_ack_at: (p.notice_ack_at as string | null) ?? null,
    is_available: p.is_available !== false,
    last_sent_at: (p.last_sent_at as string | null) ?? null,
  }));

/** Enregistre que le chauffeur a lu le message sur le partage de sa position (ne change pas le partage). */
export const acknowledgeLocationNotice = (): Promise<ApiResponse<{ notice_ack_at: string }>> =>
  callRpc('acknowledge_location_notice', undefined, (p) => ({ notice_ack_at: p.notice_ack_at as string }));

export const setDriverAvailability = (available: boolean): Promise<ApiResponse<{ is_available: boolean }>> =>
  callRpc('set_driver_availability', { p_available: available }, (p) => ({ is_available: p.is_available === true }));

export const updateDriverPresence = (
  input: PublishPositionInput,
): Promise<ApiResponse<{ is_available: boolean; throttled: boolean }>> =>
  callRpc(
    'update_driver_presence',
    {
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_heading: input.heading ?? null,
      p_speed: input.speed ?? null,
      p_accuracy: input.accuracy ?? null,
    },
    (p) => ({ is_available: p.is_available !== false, throttled: p.throttled === true }),
  );

export const getAvailableDrivers = (query: AvailableDriversQuery): Promise<ApiResponse<AvailableDriver[]>> =>
  callRpc(
    'get_available_drivers',
    {
      p_latitude: query.latitude,
      p_longitude: query.longitude,
      p_radius_km: query.radiusKm ?? 50,
      p_vehicle_type: query.vehicleType ?? null,
      p_limit: query.limit ?? 50,
    },
    (p) => (Array.isArray(p.drivers) ? (p.drivers as AvailableDriver[]) : []),
  );
