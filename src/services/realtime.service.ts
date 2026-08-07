import { supabaseClient } from '@/api/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { DriverLocationBroadcastPayload } from '@/types';

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

// ============================================
// Driver GPS tracking (broadcast channel, one per delivery)
// ============================================
const deliveryChannelName = (deliveryId: string) => `delivery-${deliveryId}`;

/**
 * Driver side: open (and subscribe) the broadcast channel for a delivery so
 * broadcastDriverLocation() can send on it. Callers are responsible for
 * calling unsubscribeChannel() when tracking stops.
 */
export const openDriverBroadcastChannel = (
  deliveryId: string,
  onStatus?: (status: string) => void
): RealtimeChannel | null => {
  if (!supabaseClient) return null;
  return supabaseClient.channel(deliveryChannelName(deliveryId)).subscribe((status) => onStatus?.(status));
};

/**
 * Driver side: push an immediate, ephemeral position update over the
 * delivery's broadcast channel. Not persisted - callers should also
 * periodically call insertDriverLocation (deliveries.api.ts) for a durable
 * trail / fallback position for late joiners.
 */
export const broadcastDriverLocation = async (
  channel: RealtimeChannel,
  payload: DriverLocationBroadcastPayload
): Promise<void> => {
  await channel.send({
    type: 'broadcast',
    event: 'location',
    payload,
  });
};

/**
 * Observer side (merchant/farmer/admin): subscribe to live position updates
 * for a delivery.
 */
export const subscribeToDeliveryLocation = (
  deliveryId: string,
  onLocation: (payload: DriverLocationBroadcastPayload) => void,
  onStatus?: (status: string) => void
): RealtimeChannel | null => {
  if (!supabaseClient) return null;

  const channel = supabaseClient
    .channel(deliveryChannelName(deliveryId))
    .on('broadcast', { event: 'location' }, ({ payload }) => onLocation(payload as DriverLocationBroadcastPayload))
    .subscribe((status) => onStatus?.(status));

  return channel;
};
