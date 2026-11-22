// ============================================
// Frais et commissions - detail pour le payeur et administration
// Le calcul est unique et vit en base (compute_fee_breakdown): l'ecran ne recalcule jamais.
// ============================================

import { callRpc } from './rpc';
import type { ApiResponse } from '@/types';

export type FeeFlow = 'order' | 'transport';
export type FeeOperator = 'airtel' | 'moov';

/** Detail de ce que paie le client. Le marchand / chauffeur recoit recipient_amount en entier. */
export interface FeeBreakdown {
  flow: FeeFlow;
  operator: FeeOperator;
  base_amount: number;
  recipient_amount: number;
  platform_fee: number;
  pvit_fee: number;
  operator_fee: number;
  total_amount: number;
  rates: { platform: number; pvit: number; operator: number };
  /** Les frais PVIT et operateur sont une estimation (les frais reels sont fixes par PVIT). */
  fees_estimated: boolean;
  currency: string;
}

export interface FeeSettings {
  order_commission_rate: number;
  transport_commission_rate: number;
  pvit_fee_rate: number;
  airtel_fee_rate: number;
  moov_fee_rate: number;
  updated_at: string;
}

export interface FeeChange {
  field: keyof Omit<FeeSettings, 'updated_at'>;
  label: string;
  old: number;
  new: number;
}

export interface FeeHistoryEntry {
  id: string;
  changed_at: string;
  changed_by_name: string | null;
  changes: FeeChange[];
}

export type FeeSettingsInput = Omit<FeeSettings, 'updated_at'>;

export const getFeeBreakdown = (flow: FeeFlow, baseAmount: number, operator: FeeOperator): Promise<ApiResponse<FeeBreakdown>> =>
  callRpc(
    'compute_fee_breakdown',
    { p_flow: flow, p_base_amount: baseAmount, p_operator: operator },
    (p) => p as unknown as FeeBreakdown,
  );

export const getFeeSchedule = (): Promise<ApiResponse<FeeSettings>> =>
  callRpc('get_fee_schedule', undefined, (p) => p as unknown as FeeSettings);

export const getAdminFeeSettings = (): Promise<ApiResponse<{ settings: FeeSettings; history: FeeHistoryEntry[] }>> =>
  callRpc('admin_get_fee_settings', undefined, (p) => ({
    settings: p.settings as FeeSettings,
    history: (Array.isArray(p.history) ? p.history : []) as FeeHistoryEntry[],
  }));

export const updateFeeSettings = (
  input: FeeSettingsInput,
): Promise<ApiResponse<{ changed: boolean; notified: number; changes: FeeChange[] }>> =>
  callRpc(
    'admin_update_fee_settings',
    {
      p_order_commission_rate: input.order_commission_rate,
      p_transport_commission_rate: input.transport_commission_rate,
      p_pvit_fee_rate: input.pvit_fee_rate,
      p_airtel_fee_rate: input.airtel_fee_rate,
      p_moov_fee_rate: input.moov_fee_rate,
    },
    (p) => ({
      changed: p.changed === true,
      notified: Number(p.notified ?? 0),
      changes: (Array.isArray(p.changes) ? p.changes : []) as FeeChange[],
    }),
  );
