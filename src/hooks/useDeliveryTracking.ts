import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getLastKnownLocation,
  subscribeToDeliveryLocation,
  subscribeToTableChanges,
  unsubscribeChannel,
} from '@/services';
import type { DriverLocationBroadcastPayload } from '@/types';

export interface TrackedPosition {
  latitude: number;
  longitude: number;
  recordedAt: string;
}

/**
 * Observer-side (merchant/farmer/admin) live tracking of a driver's position
 * for a given delivery. Reads the last persisted position on mount as an
 * immediate fallback, then follows the broadcast channel for live updates;
 * also listens for `driver_locations` inserts (postgres_changes) in case a
 * broadcast frame is missed.
 */
export function useDeliveryTracking(deliveryId: string | null | undefined, active: boolean) {
  const [position, setPosition] = useState<TrackedPosition | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const tableChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!active || !deliveryId) {
      setPosition(null);
      return;
    }

    let cancelled = false;

    getLastKnownLocation(deliveryId).then((result) => {
      if (!cancelled && result.success && result.data) {
        setPosition({
          latitude: result.data.latitude,
          longitude: result.data.longitude,
          recordedAt: result.data.recorded_at,
        });
      }
    });

    const applyPayload = (payload: DriverLocationBroadcastPayload) => {
      setPosition({
        latitude: payload.latitude,
        longitude: payload.longitude,
        recordedAt: payload.recorded_at,
      });
    };

    broadcastChannelRef.current = subscribeToDeliveryLocation(deliveryId, applyPayload);

    tableChannelRef.current = subscribeToTableChanges({
      channelName: `delivery-locations-${deliveryId}`,
      table: 'driver_locations',
      event: 'INSERT',
      filter: `delivery_id=eq.${deliveryId}`,
      onPayload: (payload) => {
        const row = (payload as { new?: Record<string, unknown> })?.new;
        if (row && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
          setPosition({
            latitude: row.latitude as number,
            longitude: row.longitude as number,
            recordedAt: (row.recorded_at as string) || new Date().toISOString(),
          });
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribeChannel(broadcastChannelRef.current);
      unsubscribeChannel(tableChannelRef.current);
      broadcastChannelRef.current = null;
      tableChannelRef.current = null;
    };
  }, [active, deliveryId]);

  return position;
}
