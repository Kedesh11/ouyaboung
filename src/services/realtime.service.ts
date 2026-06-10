import { supabaseClient } from '@/api/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface SubscribeOptions {
  channelName: string;
  table: string;
  schema?: string;
  event?: PostgresChangeEvent;
  filter?: string;
  onPayload: (payload: unknown) => void;
  onStatus?: (status: string) => void;
}

export const subscribeToTableChanges = (options: SubscribeOptions): RealtimeChannel | null => {
  if (!supabaseClient) return null;

  const channel = supabaseClient
    .channel(options.channelName)
    .on(
      'postgres_changes',
      {
        event: options.event ?? '*',
        schema: options.schema ?? 'public',
        table: options.table,
        ...(options.filter ? { filter: options.filter } : {}),
      },
      (payload) => options.onPayload(payload)
    )
    .subscribe((status) => options.onStatus?.(status));

  return channel;
};

export const unsubscribeChannel = (channel: RealtimeChannel | null): void => {
  if (!channel || !supabaseClient) return;
  supabaseClient.removeChannel(channel);
};

export const subscribeToOrders = (
  onPayload: (payload: unknown) => void,
  onStatus?: (status: string) => void
): RealtimeChannel | null =>
  subscribeToTableChanges({
    channelName: 'orders-realtime',
    table: 'orders',
    onPayload,
    onStatus,
  });

export const subscribeToTransactions = (
  channelName: string,
  onPayload: (payload: unknown) => void,
  onStatus?: (status: string) => void
): RealtimeChannel | null =>
  subscribeToTableChanges({
    channelName,
    table: 'transactions',
    onPayload,
    onStatus,
  });
