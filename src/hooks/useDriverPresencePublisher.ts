import { useEffect, useRef, useState } from 'react';
import { updateDriverPresence } from '@/api/driver-presence.api';
import { shouldPublishPosition, type PositionFix } from '@/lib/driver-presence';

export type PublisherStatus = 'off' | 'starting' | 'sharing' | 'denied' | 'unavailable' | 'error';

// Verifie souvent s'il faut republier: un chauffeur immobile ne declenche plus
// d'evenement GPS, c'est ce battement qui le maintient visible.
const TICK_MS = 5_000;

/**
 * Publie la position du chauffeur pour la carte des agriculteurs, tant que
 * `enabled` est vrai (chauffeur approuve, consentant et disponible).
 *
 * La position n'est partagee que pendant que l'application est ouverte: un
 * navigateur ne fournit pas la position en arriere-plan.
 */
export function useDriverPresencePublisher(enabled: boolean) {
  const [status, setStatus] = useState<PublisherStatus>('off');
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);

  const lastSentRef = useRef<PositionFix | null>(null);
  const latestRef = useRef<{ fix: PositionFix; heading: number | null; speed: number | null; accuracy: number | null } | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      lastSentRef.current = null;
      latestRef.current = null;
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    setStatus('starting');
    let cancelled = false;

    const publishIfNeeded = async () => {
      const latest = latestRef.current;
      if (!latest || inFlightRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      // L'horodatage est celui de maintenant: la derniere position connue reste valable tant que le GPS ne bouge pas.
      const candidate: PositionFix = { ...latest.fix, at: Date.now() };
      if (!shouldPublishPosition(lastSentRef.current, candidate)) return;

      inFlightRef.current = true;
      try {
        const result = await updateDriverPresence({
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          heading: latest.heading,
          speed: latest.speed,
          accuracy: latest.accuracy,
        });
        if (cancelled) return;
        if (result.success) {
          lastSentRef.current = candidate;
          setLastSentAt(candidate.at);
          setStatus('sharing');
        } else {
          // Echec reseau ou refus serveur: la prochaine verification reessaiera.
          setStatus('error');
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestRef.current = {
          fix: { latitude: position.coords.latitude, longitude: position.coords.longitude, at: Date.now() },
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        };
        void publishIfNeeded();
      },
      (error) => {
        // 1 = permission refusee; le reste (signal perdu, delai) est temporaire.
        setStatus(error.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    const timer = setInterval(() => void publishIfNeeded(), TICK_MS);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
    };
  }, [enabled]);

  return { status, lastSentAt };
}
