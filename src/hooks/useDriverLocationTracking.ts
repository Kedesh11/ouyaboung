import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  openDriverBroadcastChannel,
  broadcastDriverLocation,
  unsubscribeChannel,
  recordLocation,
} from '@/services';

const PERSIST_INTERVAL_MS = 12000;

/**
 * Driver-side GPS tracking for an active delivery. While `active` is true,
 * watches the browser's position continuously: every update is broadcast
 * immediately (ephemeral, for a smooth live marker), and throttled writes
 * persist a durable trail in `driver_locations` (fallback position for
 * observers who join mid-delivery, and a historical record).
 */
export function useDriverLocationTracking(
  driverId: string | null | undefined,
  deliveryId: string | null | undefined,
  active: boolean
) {
  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastPersistRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !driverId || !deliveryId) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    channelRef.current = openDriverBroadcastChannel(deliveryId);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, speed } = position.coords;
        const recordedAt = new Date(position.timestamp).toISOString();

        if (channelRef.current) {
          broadcastDriverLocation(channelRef.current, {
            latitude,
            longitude,
            heading,
            speed,
            recorded_at: recordedAt,
          }).catch(() => {
            // Best-effort: a missed broadcast frame is fine, the next tick corrects it.
          });
        }

        const now = Date.now();
        if (now - lastPersistRef.current >= PERSIST_INTERVAL_MS) {
          lastPersistRef.current = now;
          recordLocation(driverId, deliveryId, latitude, longitude).catch(() => {
            // Best-effort persistence; broadcast already carried the live update.
          });
        }
      },
      () => {
        // Permission denied / unavailable: tracking simply stops updating,
        // last known position stays in driver_locations.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [active, driverId, deliveryId]);
}
