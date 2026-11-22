// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyDriverPresence: vi.fn(),
  acknowledgeLocationNotice: vi.fn(),
  setDriverAvailability: vi.fn(),
  publisherStatus: "sharing" as string,
  publisherEnabledArgs: [] as boolean[],
}));

vi.mock("@/api/driver-presence.api", () => ({
  getMyDriverPresence: mocks.getMyDriverPresence,
  acknowledgeLocationNotice: mocks.acknowledgeLocationNotice,
  setDriverAvailability: mocks.setDriverAvailability,
}));
vi.mock("@/hooks/useDriverPresencePublisher", () => ({
  useDriverPresencePublisher: (enabled: boolean) => {
    mocks.publisherEnabledArgs.push(enabled);
    return { status: enabled ? mocks.publisherStatus : "off", lastSentAt: enabled ? Date.now() : null };
  },
}));

import { DriverAvailabilityCard } from "@/components/driver/DriverAvailabilityCard";
import { DriverPresenceProvider } from "@/contexts/DriverPresenceContext";

const renderCard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DriverPresenceProvider>
        <DriverAvailabilityCard />
      </DriverPresenceProvider>
    </QueryClientProvider>,
  );
};

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });
const state = (over: Record<string, unknown> = {}) => ok({ notice_ack_at: "2026-11-22T10:00:00Z", is_available: true, last_sent_at: null, ...over });

const lastEnabled = () => mocks.publisherEnabledArgs[mocks.publisherEnabledArgs.length - 1];

describe("DriverAvailabilityCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publisherStatus = "sharing";
    mocks.publisherEnabledArgs = [];
  });
  afterEach(cleanup);

  describe("states", () => {
    it("tells an unapproved driver to wait for validation, with no controls", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(fail("DRIVER_NOT_APPROVED"));
      renderCard();
      expect(await screen.findByText(/après validation de votre profil/)).toBeTruthy();
      expect(screen.queryByRole("switch")).toBeNull();
      expect(lastEnabled()).toBe(false);
    });

    it("shares by default, even before the notice is acknowledged, and never blocks the switch", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state({ notice_ack_at: null }));
      renderCard();
      expect(await screen.findByRole("button", { name: "J'ai compris" })).toBeTruthy();
      expect((screen.getByRole("switch") as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(lastEnabled()).toBe(true);
    });

    it("shows the sharing state with the switch on, and publishes", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state());
      renderCard();
      expect(await screen.findByText(/visible des agriculteurs vérifiés/)).toBeTruthy();
      expect((screen.getByRole("switch") as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
      expect(lastEnabled()).toBe(true);
    });

    it("shows an unavailable driver as off and publishes nothing", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state({ is_available: false }));
      renderCard();
      expect(await screen.findByText(/votre position n'est pas partagée/)).toBeTruthy();
      expect((screen.getByRole("switch") as HTMLButtonElement).getAttribute("aria-checked")).toBe("false");
      expect(mocks.publisherEnabledArgs.every((enabled) => enabled === false)).toBe(true);
    });

    it("explains how to fix a refused location permission", async () => {
      mocks.publisherStatus = "denied";
      mocks.getMyDriverPresence.mockResolvedValue(state());
      renderCard();
      expect(await screen.findByText("Localisation refusée")).toBeTruthy();
      expect(screen.getByText(/Autorisez la localisation pour ce site/)).toBeTruthy();
    });

    it("reports a weak connection without alarming the driver", async () => {
      mocks.publisherStatus = "error";
      mocks.getMyDriverPresence.mockResolvedValue(state());
      renderCard();
      expect((await screen.findAllByText(/Connexion faible/)).length).toBeGreaterThan(0);
    });

    it("reports when the state cannot be loaded", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(fail("NETWORK_ERROR"));
      renderCard();
      // The provider retries once (1 s) before giving up, so wait longer than the default.
      expect((await screen.findAllByText(/Impossible de charger votre état de partage/, {}, { timeout: 4000 })).length).toBeGreaterThan(0);
    });
  });

  describe("information notice", () => {
    it("states exactly what is shared", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state({ notice_ack_at: null }));
      renderCard();
      await screen.findByRole("button", { name: "J'ai compris" });
      const text = document.body.textContent ?? "";
      expect(text).toContain("jamais votre plaque");
      expect(text).toContain("application est ouverte");
      expect(text).toContain("dernière position est alors effacée");
      expect(text).toContain("Aucun historique");
    });

    it("records the acknowledgement and hides the notice, sharing continues", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state({ notice_ack_at: null }));
      mocks.acknowledgeLocationNotice.mockResolvedValue(ok({ notice_ack_at: "2026-11-22T11:00:00Z" }));
      renderCard();
      fireEvent.click(await screen.findByRole("button", { name: "J'ai compris" }));

      await waitFor(() => expect(mocks.acknowledgeLocationNotice).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole("button", { name: "J'ai compris" })).toBeNull());
      expect(lastEnabled()).toBe(true);
    });

    it("keeps the notice and shows the error when recording fails", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state({ notice_ack_at: null }));
      mocks.acknowledgeLocationNotice.mockResolvedValue(fail("NETWORK_ERROR", "Reseau indisponible"));
      renderCard();
      fireEvent.click(await screen.findByRole("button", { name: "J'ai compris" }));

      expect(await screen.findByText("Reseau indisponible")).toBeTruthy();
      expect(screen.getByRole("button", { name: "J'ai compris" })).toBeTruthy();
    });

    it("lets an informed driver reopen the details", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state());
      renderCard();
      fireEvent.click(await screen.findByRole("button", { name: "Ce qui est partagé" }));
      expect(await screen.findByRole("dialog")).toBeTruthy();
    });
  });

  describe("availability switch", () => {
    beforeEach(() => mocks.getMyDriverPresence.mockResolvedValue(state()));

    it("turns sharing off and stops publishing", async () => {
      mocks.setDriverAvailability.mockResolvedValue(ok({ is_available: false }));
      renderCard();
      fireEvent.click(await screen.findByRole("switch"));

      await waitFor(() => expect(mocks.setDriverAvailability).toHaveBeenCalledWith(false));
      await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
      expect(await screen.findByText(/votre position n'est pas partagée/)).toBeTruthy();
      expect(lastEnabled()).toBe(false);
    });

    it("turns sharing back on", async () => {
      mocks.getMyDriverPresence.mockResolvedValue(state({ is_available: false }));
      mocks.setDriverAvailability.mockResolvedValue(ok({ is_available: true }));
      renderCard();
      fireEvent.click(await screen.findByRole("switch"));

      await waitFor(() => expect(mocks.setDriverAvailability).toHaveBeenCalledWith(true));
      await waitFor(() => expect(lastEnabled()).toBe(true));
    });

    it("keeps the previous state and shows an error when the change fails", async () => {
      mocks.setDriverAvailability.mockResolvedValue(fail("NETWORK_ERROR", "Reseau indisponible"));
      renderCard();
      fireEvent.click(await screen.findByRole("switch"));

      expect(await screen.findByText("Reseau indisponible")).toBeTruthy();
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
      expect(lastEnabled()).toBe(true);
    });
  });
});
