"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeLocationNotice,
  getMyDriverPresence,
  setDriverAvailability,
  type DriverPresenceState,
} from "@/api/driver-presence.api";
import { useDriverPresencePublisher } from "@/hooks/useDriverPresencePublisher";

export type PresenceUiStatus =
  | "loading"
  | "not_approved"
  | "off"
  | "starting"
  | "sharing"
  | "denied"
  | "unavailable"
  | "error"
  | "state_unavailable";

interface DriverPresenceContextValue {
  status: PresenceUiStatus;
  isAvailable: boolean;
  /** Le chauffeur a deja lu le message d'information sur le partage de sa position. */
  noticeAcknowledged: boolean;
  lastSentAt: number | null;
  /** Une action (disponibilite, accuse de lecture) est en cours. */
  pending: boolean;
  /** Dernier message d'erreur d'une action, a afficher a l'utilisateur. */
  actionError: string | null;
  acknowledgeNotice: () => Promise<boolean>;
  setAvailable: (available: boolean) => Promise<boolean>;
}

const DriverPresenceContext = createContext<DriverPresenceContextValue | undefined>(undefined);

const QUERY_KEY = ["driver", "presence"] as const;

type PresenceQueryData = { approved: true; state: DriverPresenceState } | { approved: false };

/**
 * Etat de partage de la position du chauffeur, partage par toutes les pages du
 * tableau de bord chauffeur: un chauffeur valide est disponible par defaut, et
 * tant que l'application est ouverte et qu'il n'a pas coupe l'interrupteur, sa
 * position est publiee pour la carte des agriculteurs. Aucun accord prealable
 * n'est exige: le chauffeur est informe par un message et peut desactiver.
 */
export function DriverPresenceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery<PresenceQueryData>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await getMyDriverPresence();
      if (result.success && result.data) return { approved: true, state: result.data };
      if (result.error?.code === "DRIVER_NOT_APPROVED") return { approved: false };
      throw new Error(result.error?.code || "PRESENCE_STATE_FAILED");
    },
    staleTime: 30_000,
    retry: 1,
  });

  const state = query.data && query.data.approved ? query.data.state : null;
  const publishing = !!state && state.is_available;
  const publisher = useDriverPresencePublisher(publishing);

  const status: PresenceUiStatus = (() => {
    if (query.isLoading) return "loading";
    if (query.isError) return "state_unavailable";
    if (!state) return "not_approved";
    if (!state.is_available) return "off";
    return publisher.status === "off" ? "starting" : publisher.status;
  })();

  const writeState = useCallback(
    (patch: Partial<DriverPresenceState>) => {
      queryClient.setQueryData<PresenceQueryData>(QUERY_KEY, (current) =>
        current && current.approved ? { approved: true, state: { ...current.state, ...patch } } : current,
      );
    },
    [queryClient],
  );

  const acknowledgeNotice = useCallback(async () => {
    setPending(true);
    setActionError(null);
    const result = await acknowledgeLocationNotice();
    setPending(false);
    if (!result.success || !result.data) {
      setActionError(result.error?.message || "Impossible d'enregistrer votre accusé de lecture pour le moment.");
      return false;
    }
    writeState({ notice_ack_at: result.data.notice_ack_at });
    return true;
  }, [writeState]);

  const setAvailable = useCallback(
    async (available: boolean) => {
      setPending(true);
      setActionError(null);
      const result = await setDriverAvailability(available);
      setPending(false);
      if (!result.success || !result.data) {
        setActionError(result.error?.message || "Impossible de modifier votre disponibilité pour le moment.");
        return false;
      }
      writeState({ is_available: result.data.is_available, ...(available ? {} : { last_sent_at: null }) });
      return true;
    },
    [writeState],
  );

  const value = useMemo<DriverPresenceContextValue>(
    () => ({
      status,
      isAvailable: !!state?.is_available,
      noticeAcknowledged: !!state?.notice_ack_at,
      lastSentAt: publisher.lastSentAt,
      pending,
      actionError,
      acknowledgeNotice,
      setAvailable,
    }),
    [status, state?.is_available, state?.notice_ack_at, publisher.lastSentAt, pending, actionError, acknowledgeNotice, setAvailable],
  );

  return <DriverPresenceContext.Provider value={value}>{children}</DriverPresenceContext.Provider>;
}

export function useDriverPresence(): DriverPresenceContextValue {
  const context = useContext(DriverPresenceContext);
  if (!context) throw new Error("useDriverPresence must be used within a DriverPresenceProvider");
  return context;
}
