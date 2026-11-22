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
    default:
      return '';
  }
};

export const mapsDirectionsUrl = (latitude: number, longitude: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
