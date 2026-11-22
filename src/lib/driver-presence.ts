/**
 * Presence temps reel des chauffeurs: regles de publication de la position,
 * libelles et durees. Pur et sans dependance navigateur (testable).
 */
import { calculateDistanceKm } from '@/lib/geo-distance';

export type VehicleType = 'moto' | 'voiture' | 'camionnette' | 'tricycle' | 'other';

export const VEHICLE_TYPES: readonly VehicleType[] = ['camionnette', 'voiture', 'tricycle', 'moto', 'other'];

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  moto: 'Moto',
  voiture: 'Voiture',
  camionnette: 'Camionnette',
  tricycle: 'Tricycle',
  other: 'Autre',
};

export const vehicleLabel = (type: string): string => VEHICLE_LABELS[type as VehicleType] ?? 'Autre';

const readPositiveInt = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/** Intervalle minimal entre deux publications (le serveur en tolere au plus une toutes les 3 s). */
export const PRESENCE_MIN_INTERVAL_MS = readPositiveInt(process.env.NEXT_PUBLIC_DRIVER_PUBLISH_INTERVAL_MS, 8_000);
/** Un chauffeur immobile republie sa position a cette cadence pour rester "operationnel" (le serveur l'oublie apres 2 min). */
export const PRESENCE_HEARTBEAT_MS = readPositiveInt(process.env.NEXT_PUBLIC_DRIVER_HEARTBEAT_MS, 30_000);
/** Deplacement minimal (metres) justifiant une publication avant le battement. */
export const PRESENCE_MIN_MOVE_M = readPositiveInt(process.env.NEXT_PUBLIC_DRIVER_MIN_MOVE_M, 15);
/** Cadence de rafraichissement de la carte cote agriculteur. */
export const DRIVERS_MAP_POLL_MS = readPositiveInt(process.env.NEXT_PUBLIC_DRIVER_MAP_POLL_MS, 5_000);
/** Doit rester aligne sur driver_presence_max_age() cote base. */
export const DRIVER_STALE_AFTER_MS = 120_000;

export interface PositionFix {
  latitude: number;
  longitude: number;
  /** Horodatage en ms. */
  at: number;
}

export const isValidFix = (latitude: unknown, longitude: unknown): boolean =>
  typeof latitude === 'number' &&
  typeof longitude === 'number' &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180;

export interface PublishPolicy {
  minIntervalMs?: number;
  heartbeatMs?: number;
  minMoveM?: number;
}

/**
 * Faut-il envoyer cette position au serveur ?
 *  - jamais plus souvent que l'intervalle minimal (economie de donnees et de batterie);
 *  - des que le chauffeur s'est deplace d'au moins `minMoveM` metres;
 *  - sinon un battement regulier, pour qu'un chauffeur immobile reste visible.
 */
export const shouldPublishPosition = (
  last: PositionFix | null,
  next: PositionFix,
  policy: PublishPolicy = {},
): boolean => {
  if (!isValidFix(next.latitude, next.longitude)) return false;
  if (!last) return true;

  const minIntervalMs = policy.minIntervalMs ?? PRESENCE_MIN_INTERVAL_MS;
  const heartbeatMs = policy.heartbeatMs ?? PRESENCE_HEARTBEAT_MS;
  const minMoveM = policy.minMoveM ?? PRESENCE_MIN_MOVE_M;

  const elapsed = next.at - last.at;
  if (elapsed < minIntervalMs) return false;
  if (elapsed >= heartbeatMs) return true;

  const movedM = calculateDistanceKm(last, next) * 1000;
  return movedM >= minMoveM;
};

/** Anciennete en secondes d'une position, jamais negative (horloges legerement decalees). */
export const ageSeconds = (updatedAt: string | number, now: number = Date.now()): number => {
  const time = typeof updatedAt === 'number' ? updatedAt : Date.parse(updatedAt);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - time) / 1000));
};

export const formatAge = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return 'inconnue';
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${Math.floor(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `il y a ${minutes} min`;
};

/** Position trop ancienne pour etre fiable (le serveur la masque, le client l'estompe en attendant). */
export const isStale = (seconds: number, staleAfterMs: number = DRIVER_STALE_AFTER_MS): boolean =>
  seconds * 1000 >= staleAfterMs;

/** Distance lisible: metres arrondis a 10 m sous le kilometre (10 m minimum), kilometres au-dessus. */
export const formatDistance = (km: number): string => {
  const meters = Math.max(10, Math.round(km * 100) * 10);
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
};
