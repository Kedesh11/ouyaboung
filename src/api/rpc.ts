// ============================================
// Appel RPC Supabase normalise (partage par les API de presence et de transport)
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { isBrowserOffline } from '@/lib/offline/cache';
import type { ApiResponse } from '@/types';

export type RpcPayload = { success?: boolean; code?: string; message?: string } & Record<string, unknown>;

const notConfigured = <T,>(): ApiResponse<T> => ({
  data: null,
  error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
  success: false,
});

const offline = <T,>(): ApiResponse<T> => ({
  data: null,
  error: { code: 'OFFLINE', message: 'Vous etes hors ligne.' },
  success: false,
});

/** Appelle une RPC et normalise les deux formes d'echec (erreur reseau/SQL, ou success:false). */
export const callRpc = async <T,>(
  name: string,
  args: Record<string, unknown> | undefined,
  pick: (payload: RpcPayload) => T,
): Promise<ApiResponse<T>> => {
  if (!isSupabaseConfigured()) return notConfigured<T>();
  if (isBrowserOffline()) return offline<T>();

  try {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc(name, args);

    if (error) {
      return { data: null, error: { code: error.code || 'RPC_ERROR', message: error.message }, success: false };
    }

    const payload = (data ?? null) as RpcPayload | null;
    if (!payload?.success) {
      return {
        data: null,
        error: { code: payload?.code || 'RPC_FAILED', message: payload?.message || 'Operation impossible' },
        success: false,
      };
    }

    return { data: pick(payload), error: null, success: true };
  } catch {
    // fetch() leve une TypeError sur reseau coupe: on le traduit en echec normal.
    return { data: null, error: { code: 'NETWORK_ERROR', message: 'Reseau indisponible' }, success: false };
  }
};

