// ============================================
// Transport API - demandes de transport agriculteur -> chauffeur
// Tout passe par des RPC (la table transport_requests n'est pas accessible en direct).
// ============================================

import { callRpc } from './rpc';
import type { ApiResponse } from '@/types';
import type { VehicleType } from '@/lib/driver-presence';

export type TransportStatus = 'proposed' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled' | 'no_driver';
export type DispatchMode = 'auto' | 'manual';

/** Chauffeur vu par l'agriculteur (telephone inclus; position en direct pendant la course seulement). */
export interface TransportDriverInfo {
  driver_id: string;
  display_name: string;
  vehicle_type: VehicleType;
  rating: number;
  total_reviews: number;
  phone: string | null;
  latitude?: number;
  longitude?: number;
  heading?: number | null;
  age_seconds?: number;
}

export interface FarmerTransportRequest {
  id: string;
  status: TransportStatus;
  dispatch_mode: DispatchMode;
  vehicle_type: VehicleType | null;
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_address: string;
  dropoff_address: string;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  cargo_description: string;
  proposal_expires_at: string | null;
  /** Secondes restantes pour que le chauffeur propose reponde (180 au depart). */
  seconds_left: number | null;
  closed_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  driver: TransportDriverInfo | null;
}

/** Contact du client: communique au chauffeur seulement une fois la course acceptee. */
export interface TransportClientInfo {
  name: string;
  phone: string;
  address: string;
}

export interface DriverTransportJob {
  id: string;
  status: 'proposed' | 'accepted' | 'picked_up';
  vehicle_type: VehicleType | null;
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_address: string;
  dropoff_address: string;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  cargo_description: string;
  distance_km: number | null;
  proposal_expires_at: string | null;
  seconds_left: number | null;
  created_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  client: TransportClientInfo | null;
}

export interface CreateTransportRequestInput {
  mode: DispatchMode;
  /** Obligatoire en mode manuel. */
  driverId?: string | null;
  dropoffAddress: string;
  cargoDescription: string;
  /** Sans point de ramassage, le serveur utilise l'exploitation. */
  pickup?: { latitude: number; longitude: number; address?: string | null } | null;
  vehicleType?: VehicleType | null;
}

export const createTransportRequest = (input: CreateTransportRequestInput): Promise<ApiResponse<FarmerTransportRequest>> =>
  callRpc(
    'create_transport_request',
    {
      p_mode: input.mode,
      p_driver_id: input.mode === 'manual' ? (input.driverId ?? null) : null,
      p_dropoff_address: input.dropoffAddress,
      p_cargo_description: input.cargoDescription,
      p_pickup_latitude: input.pickup?.latitude ?? null,
      p_pickup_longitude: input.pickup?.longitude ?? null,
      p_pickup_address: input.pickup?.address ?? null,
      p_dropoff_latitude: null,
      p_dropoff_longitude: null,
      p_vehicle_type: input.vehicleType ?? null,
    },
    (p) => p.request as FarmerTransportRequest,
  );

/** La demande en cours (ou terminee depuis moins de 30 minutes), ou null. */
export const getMyTransportRequest = (): Promise<ApiResponse<FarmerTransportRequest | null>> =>
  callRpc('get_my_transport_request', undefined, (p) => (p.request as FarmerTransportRequest | null) ?? null);

export const cancelTransportRequest = (requestId: string): Promise<ApiResponse<FarmerTransportRequest>> =>
  callRpc('cancel_transport_request', { p_request_id: requestId }, (p) => p.request as FarmerTransportRequest);

export const getMyTransportJobs = (): Promise<ApiResponse<DriverTransportJob[]>> =>
  callRpc('get_my_transport_jobs', undefined, (p) => (Array.isArray(p.jobs) ? (p.jobs as DriverTransportJob[]) : []));

export const respondTransportRequest = (
  requestId: string,
  accept: boolean,
): Promise<ApiResponse<{ declined: boolean; job: DriverTransportJob | null }>> =>
  callRpc('respond_transport_request', { p_request_id: requestId, p_accept: accept }, (p) => ({
    declined: p.declined === true,
    job: (p.job as DriverTransportJob | undefined) ?? null,
  }));

export const updateTransportJobStatus = (
  requestId: string,
  status: 'picked_up' | 'delivered',
): Promise<ApiResponse<DriverTransportJob>> =>
  callRpc('update_transport_job_status', { p_request_id: requestId, p_status: status }, (p) => p.job as DriverTransportJob);
