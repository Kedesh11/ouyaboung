// ============================================
// Tarifs de transport - administration
// Lecture/ecriture reservees aux admins (RPC SECURITY DEFINER, tables sans acces direct).
// ============================================

import { callRpc } from './rpc';
import type { ApiResponse } from '@/types';
import type { VehicleType } from '@/lib/driver-presence';

export interface TransportTariff {
  vehicle_type: VehicleType;
  /** Frais de base (XAF). */
  base_fee: number;
  /** Prix par km (XAF). */
  price_per_km: number;
  /** Tarif minimum (XAF). */
  min_fare: number;
  is_active: boolean;
  updated_at: string;
}

export interface TransportSettings {
  /** Commission de la plateforme, entre 0 et 0,5 (ex. 0,1 = 10 %). */
  commission_rate: number;
  /** Coefficient applique a la distance a vol d'oiseau pour estimer la route (1 a 3). */
  road_distance_factor: number;
  max_distance_km: number;
  /** Delai (minutes) laisse a l'agriculteur pour payer apres l'acceptation du chauffeur. */
  payment_window_minutes: number;
  updated_at: string;
}

export interface TransportPricing {
  tariffs: TransportTariff[];
  settings: TransportSettings;
}

export type TransportTariffInput = Pick<TransportTariff, 'vehicle_type' | 'base_fee' | 'price_per_km' | 'min_fare' | 'is_active'>;
export type TransportSettingsInput = Pick<TransportSettings, 'commission_rate' | 'road_distance_factor' | 'max_distance_km' | 'payment_window_minutes'>;

export const getTransportPricing = (): Promise<ApiResponse<TransportPricing>> =>
  callRpc('admin_get_transport_pricing', undefined, (p) => ({
    tariffs: (Array.isArray(p.tariffs) ? p.tariffs : []) as TransportTariff[],
    settings: p.settings as TransportSettings,
  }));

export const updateTransportTariff = (input: TransportTariffInput): Promise<ApiResponse<TransportTariff>> =>
  callRpc(
    'admin_update_transport_tariff',
    {
      p_vehicle_type: input.vehicle_type,
      p_base_fee: input.base_fee,
      p_price_per_km: input.price_per_km,
      p_min_fare: input.min_fare,
      p_is_active: input.is_active,
    },
    (p) => p.tariff as TransportTariff,
  );

export const updateTransportSettings = (input: TransportSettingsInput): Promise<ApiResponse<TransportSettings>> =>
  callRpc(
    'admin_update_transport_settings',
    {
      p_commission_rate: input.commission_rate,
      p_road_distance_factor: input.road_distance_factor,
      p_max_distance_km: input.max_distance_km,
      p_payment_window_minutes: input.payment_window_minutes,
    },
    (p) => p.settings as TransportSettings,
  );
