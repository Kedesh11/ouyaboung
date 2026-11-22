// ============================================
// Transport API - demandes de transport agriculteur -> chauffeur
// Tout passe par des RPC (la table transport_requests n'est pas accessible en direct).
// ============================================

import { callRpc } from './rpc';
import type { ApiResponse } from '@/types';
import type { VehicleType } from '@/lib/driver-presence';
import type { FeeBreakdown } from '@/api/fees.api';

export type TransportStatus = 'proposed' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled' | 'no_driver';
export type DispatchMode = 'auto' | 'manual';
export type TransportPaymentStatus = 'unpaid' | 'pending' | 'paid';

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
  /** Distance routiere estimee (km) et tarif fixe (XAF), figes a la commande. */
  distance_km: number | null;
  fare_amount: number | null;
  /** Paiement PVIT: unpaid -> pending (en cours) -> paid. */
  payment_status: TransportPaymentStatus;
  /** Date limite et secondes restantes pour payer apres l'acceptation du chauffeur. */
  payment_deadline: string | null;
  seconds_to_pay: number | null;
  paid_at: string | null;
  /** Reference du paiement en cours ou confirme (sert a resynchroniser le statut). */
  payment_reference: string | null;
  /** Detail des frais figé sur le paiement en cours ou confirme (commission, PVIT, operateur). */
  payment_breakdown: FeeBreakdown | null;
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
  /** Distance du chauffeur au point de ramassage. */
  distance_km: number | null;
  /** Distance du trajet et tarif du chauffeur, verse en entier (driver_net = tarif). La commission est payee en plus par l'agriculteur. */
  route_distance_km: number | null;
  fare_amount: number | null;
  platform_fee: number | null;
  driver_net: number | null;
  /** Le chargement n'est possible qu'une fois la course payee. */
  payment_status: TransportPaymentStatus;
  seconds_to_pay: number | null;
  paid_at: string | null;
  proposal_expires_at: string | null;
  seconds_left: number | null;
  created_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  client: TransportClientInfo | null;
}

export interface TransportQuote {
  vehicle_type: VehicleType;
  distance_km: number;
  fare_amount: number;
  platform_fee: number;
  driver_net: number;
  commission_rate: number;
  currency: string;
}

export interface TransportPoint {
  latitude: number;
  longitude: number;
}

export interface CreateTransportRequestInput {
  mode: DispatchMode;
  /** Obligatoire en mode manuel (le vehicule du chauffeur fixe alors le tarif). */
  driverId?: string | null;
  dropoffAddress: string;
  /** Destination choisie sur la carte: sert au calcul du tarif. */
  dropoff: TransportPoint;
  cargoDescription: string;
  /** Sans point de ramassage, le serveur utilise l'exploitation. */
  pickup?: (TransportPoint & { address?: string | null }) | null;
  /** Obligatoire en mode automatique: seuls les chauffeurs de ce type sont sollicites. */
  vehicleType?: VehicleType | null;
}

/** Tarif fixe d'un trajet (sans rien creer). */
export const quoteTransport = (input: {
  vehicleType: VehicleType;
  dropoff: TransportPoint;
  pickup?: TransportPoint | null;
}): Promise<ApiResponse<TransportQuote>> =>
  callRpc(
    'quote_transport',
    {
      p_vehicle_type: input.vehicleType,
      p_dropoff_latitude: input.dropoff.latitude,
      p_dropoff_longitude: input.dropoff.longitude,
      p_pickup_latitude: input.pickup?.latitude ?? null,
      p_pickup_longitude: input.pickup?.longitude ?? null,
    },
    (p) => p as unknown as TransportQuote,
  );

export const createTransportRequest = (input: CreateTransportRequestInput): Promise<ApiResponse<FarmerTransportRequest>> =>
  callRpc(
    'create_transport_request',
    {
      p_mode: input.mode,
      p_driver_id: input.mode === 'manual' ? (input.driverId ?? null) : null,
      p_dropoff_address: input.dropoffAddress,
      p_cargo_description: input.cargoDescription,
      p_dropoff_latitude: input.dropoff.latitude,
      p_dropoff_longitude: input.dropoff.longitude,
      p_vehicle_type: input.vehicleType ?? null,
      p_pickup_latitude: input.pickup?.latitude ?? null,
      p_pickup_longitude: input.pickup?.longitude ?? null,
      p_pickup_address: input.pickup?.address ?? null,
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
