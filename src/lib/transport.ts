// Libelles et utilitaires du transport (affichage seulement: les regles sont en base).

import type { TransportStatus } from '@/api/transport.api';

/** Delai accorde au chauffeur propose pour repondre (doit rester egal a transport_proposal_ttl() en base). */
export const TRANSPORT_PROPOSAL_TTL_SECONDS = 180;

/** Rafraichissement des demandes/courses tant que la page est visible. */
export const TRANSPORT_POLL_MS = Number(process.env.NEXT_PUBLIC_TRANSPORT_POLL_MS) || 5_000;

export const TRANSPORT_ACTIVE_STATUSES: readonly TransportStatus[] = ['proposed', 'accepted', 'picked_up'];

export const isActiveTransport = (status: TransportStatus | undefined | null): boolean =>
  !!status && TRANSPORT_ACTIVE_STATUSES.includes(status);

export const TRANSPORT_STATUS_LABEL: Record<TransportStatus, string> = {
  proposed: 'En attente du chauffeur',
  accepted: 'Chauffeur en route',
  picked_up: 'Marchandise chargée',
  delivered: 'Livré',
  cancelled: 'Annulée',
  no_driver: 'Aucun chauffeur disponible',
};

/** Secondes restantes a partir de la valeur serveur et du temps ecoule depuis sa reception. */
export const remainingSeconds = (serverSecondsLeft: number | null | undefined, receivedAt: number, now: number): number => {
  if (serverSecondsLeft == null) return 0;
  return Math.max(0, Math.floor(serverSecondsLeft - (now - receivedAt) / 1000));
};

/** 125 -> "2 min 05 s", 45 -> "45 s". */
export const formatCountdown = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

/** Message lisible pour la cloture d'une demande. */
export const closedReasonLabel = (reason: string | null): string => {
  switch (reason) {
    case 'proposal_expired':
      return 'Le chauffeur n\'a pas répondu dans les 3 minutes.';
    case 'declined':
      return 'Le chauffeur a refusé la demande.';
    case 'no_driver_available':
      return 'Aucun chauffeur libre n\'a pu être trouvé.';
    case 'cancelled_by_farmer':
      return 'Vous avez annulé la demande.';
    case 'payment_timeout':
      return 'Le paiement n\'a pas été effectué dans le délai: la course a été annulée.';
    default:
      return '';
  }
};

export const mapsDirectionsUrl = (latitude: number, longitude: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

/** 118700 -> "118 700 FCFA". */
export const formatFare = (amount: number | null | undefined): string =>
  amount == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(amount).replace(/[\u202f\u00a0]/g, ' ')} FCFA`;

/**
 * Estimation du tarif pour une distance routiere donnee: meme formule que la base
 * (max(minimum, base + km x prix), arrondi aux 50 XAF superieurs). Sert a l'apercu admin;
 * le tarif reel est toujours calcule par le serveur.
 */
export const estimateTransportFare = (
  tariff: { base_fee: number; price_per_km: number; min_fare: number },
  distanceKm: number,
  commissionRate: number,
): { fare: number; platformFee: number; driverNet: number } => {
  const raw = Math.max(tariff.min_fare, tariff.base_fee + Math.ceil(distanceKm * tariff.price_per_km));
  const fare = Math.ceil(raw / 50) * 50;
  const platformFee = Math.round(fare * commissionRate);
  return { fare, platformFee, driverNet: fare - platformFee };
};
