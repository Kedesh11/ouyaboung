// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAvailableDrivers: vi.fn(),
  getMyFarmerProfile: vi.fn(),
  getCachedUserLocation: vi.fn(),
  mapProps: null as null | Record<string, any>,
}));

vi.mock("@/api/driver-presence.api", () => ({ getAvailableDrivers: mocks.getAvailableDrivers }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "farmer-user" } }) }));
vi.mock("@/services", () => ({
  getMyFarmerProfile: mocks.getMyFarmerProfile,
  getCachedUserLocation: mocks.getCachedUserLocation,
  isValidCoordinate: (lat?: number | null, lng?: number | null) => typeof lat === "number" && typeof lng === "number",
  isWithinGabonBounds: (lat?: number | null, lng?: number | null) =>
    typeof lat === "number" && typeof lng === "number" && lat > -4.2 && lat < 2.6 && lng > 8.4 && lng < 14.8,
}));

// The real map (WebGL) cannot run in jsdom: a stub exposes what the page passes to it.
vi.mock("next/dynamic", () => ({
  default: () =>
    function StubMap(props: Record<string, any>) {
      mocks.mapProps = props;
      return (
        <div data-testid="map" data-center={`${props.center.latitude},${props.center.longitude}`} data-selected={props.selectedDriverId ?? ""}>
          {props.drivers.map((d: any) => (
            <button key={d.driver_id} onClick={() => props.onSelect(d.driver_id)}>{`marker:${d.display_name}`}</button>
          ))}
          <button onClick={() => props.onSelect(null)}>map-background</button>
        </div>
      );
    },
}));

import FarmerTransportPage from "../../../../app/(dashboard)/farmer/transport/page";

const driver = (id: string, over: Record<string, unknown> = {}) => ({
  driver_id: id,
  display_name: `Chauffeur ${id.toUpperCase()}.`,
  phone: "077 12 34 56",
  vehicle_type: "camionnette",
  rating: 4.5,
  total_reviews: 12,
  latitude: 0.42,
  longitude: 9.47,
  heading: null,
  speed: null,
  updated_at: new Date().toISOString(),
  age_seconds: 4,
  distance_km: 1.2,
  ...over,
});

const ok = (drivers: unknown[]) => ({ success: true, data: drivers, error: null });
const fail = (code: string) => ({ success: false, data: null, error: { code, message: code } });

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <FarmerTransportPage />
    </QueryClientProvider>,
  );
};

describe("FarmerTransportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mapProps = null;
    mocks.getMyFarmerProfile.mockResolvedValue({ success: true, data: { latitude: -1.6333, longitude: 13.5833 } });
    mocks.getCachedUserLocation.mockReturnValue(null);
    mocks.getAvailableDrivers.mockResolvedValue(ok([driver("a"), driver("b", { vehicle_type: "moto", distance_km: 3.4, total_reviews: 0, rating: 0 })]));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("search center", () => {
    it("centers on the farm when its coordinates are known", async () => {
      renderPage();
      await screen.findByTestId("map");
      expect(screen.getByTestId("map").getAttribute("data-center")).toBe("-1.6333,13.5833");
      expect(await screen.findByText(/près de votre exploitation/)).toBeTruthy();
      expect(mocks.getAvailableDrivers).toHaveBeenCalledWith(expect.objectContaining({ latitude: -1.6333, longitude: 13.5833 }));
    });

    it("falls back to the last known position when the farm has no usable coordinates", async () => {
      mocks.getMyFarmerProfile.mockResolvedValue({ success: true, data: { latitude: 0, longitude: 0 } }); // placeholder (0,0)
      mocks.getCachedUserLocation.mockReturnValue({ latitude: 0.39, longitude: 9.45 });
      renderPage();
      await waitFor(() => expect(screen.getByTestId("map").getAttribute("data-center")).toBe("0.39,9.45"));
      expect(await screen.findByText(/près de votre position/)).toBeTruthy();
    });

    it("falls back to Libreville and says so when nothing is known", async () => {
      mocks.getMyFarmerProfile.mockResolvedValue({ success: false, data: null });
      renderPage();
      await waitFor(() => expect(screen.getByTestId("map").getAttribute("data-center")).toBe("0.4162,9.4673"));
      expect(await screen.findByText(/Libreville \(position de votre exploitation non renseignée\)/)).toBeTruthy();
    });
  });

  describe("drivers list", () => {
    it("lists the free drivers with vehicle, distance, position age and rating", async () => {
      renderPage();
      const cardA = await screen.findByTestId("driver-card-a");
      expect(within(cardA).getByText("Chauffeur A.")).toBeTruthy();
      expect(within(cardA).getByText(/Camionnette/)).toBeTruthy();
      expect(within(cardA).getByText("1,2 km")).toBeTruthy();
      expect(within(cardA).getByText(/4\.5 \(12 avis\)/)).toBeTruthy();
      expect(within(cardA).getByText(/position à l'instant/)).toBeTruthy();

      const cardB = screen.getByTestId("driver-card-b");
      expect(within(cardB).getByText(/Moto/)).toBeTruthy();
      expect(within(cardB).getByText("Nouveau chauffeur")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toContain("2 chauffeurs libres dans 25 km");
    });

    it("offers a call link with the driver's phone, outside the selectable card", async () => {
      mocks.getAvailableDrivers.mockResolvedValue(ok([driver("a"), driver("b", { phone: null })]));
      renderPage();
      const link = (await screen.findByRole("link", { name: /Appeler Chauffeur A\./ })) as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe("tel:07712 3456".replace(" ", ""));
      expect(link.closest("button")).toBeNull();
      expect(screen.queryByRole("link", { name: /Appeler Chauffeur B\./ })).toBeNull();
    });

    it("uses the singular for a single driver", async () => {
      mocks.getAvailableDrivers.mockResolvedValue(ok([driver("a")]));
      renderPage();
      await screen.findByTestId("driver-card-a");
      expect(screen.getByRole("status").textContent).toContain("1 chauffeur libre dans 25 km");
    });

    it("explains an empty result and suggests a wider radius", async () => {
      mocks.getAvailableDrivers.mockResolvedValue(ok([]));
      renderPage();
      expect(await screen.findByText(/Aucun chauffeur libre dans ce rayon/)).toBeTruthy();
      expect(screen.getByText(/élargir le rayon/)).toBeTruthy();
    });

    it("passes the same drivers to the map", async () => {
      renderPage();
      await screen.findByTestId("driver-card-a");
      expect(mocks.mapProps?.drivers.map((d: any) => d.driver_id)).toEqual(["a", "b"]);
    });

    it("hides a driver whose position got too old between two server answers", async () => {
      // First answer only: later polls stay pending, so only the page's own clock can age the positions
      // (a real server would not return a driver whose position is older than 2 minutes anyway).
      mocks.getAvailableDrivers
        .mockResolvedValueOnce(ok([driver("a", { age_seconds: 118 }), driver("b", { age_seconds: 3 })]))
        .mockReturnValue(new Promise(() => undefined));
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderPage();
      await screen.findByTestId("driver-card-a");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000); // one clock tick: 118 s + 6 s >= 120 s
      });
      await waitFor(() => expect(screen.queryByTestId("driver-card-a")).toBeNull());
      expect(screen.getByTestId("driver-card-b")).toBeTruthy();
    });
  });

  describe("filters", () => {
    it("filters by vehicle type and goes back to all", async () => {
      renderPage();
      await screen.findByTestId("driver-card-a");

      fireEvent.click(screen.getByRole("button", { name: "Moto" }));
      await waitFor(() => expect(mocks.getAvailableDrivers).toHaveBeenLastCalledWith(expect.objectContaining({ vehicleType: "moto" })));

      fireEvent.click(screen.getByRole("button", { name: "Tous" }));
      await waitFor(() => expect(mocks.getAvailableDrivers).toHaveBeenLastCalledWith(expect.objectContaining({ vehicleType: null })));
    });

    it("offers the usual freight vehicles but not 'Autre'", async () => {
      renderPage();
      await screen.findByTestId("driver-card-a");
      const group = screen.getByRole("group", { name: "Type de véhicule" });
      expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tous", "Camionnette", "Voiture", "Tricycle", "Moto"]);
    });

    it("refreshes on demand", async () => {
      renderPage();
      await screen.findByTestId("driver-card-a");
      const before = mocks.getAvailableDrivers.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
      await waitFor(() => expect(mocks.getAvailableDrivers.mock.calls.length).toBeGreaterThan(before));
    });
  });

  describe("selection is shared between the list and the map", () => {
    it("selects from the list, shows it on the map, and unselects on a second click", async () => {
      renderPage();
      const card = await screen.findByTestId("driver-card-b");
      fireEvent.click(card);
      expect(card.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("map").getAttribute("data-selected")).toBe("b");

      fireEvent.click(card);
      expect(card.getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByTestId("map").getAttribute("data-selected")).toBe("");
    });

    it("selects from a map marker and clears on a map click", async () => {
      renderPage();
      await screen.findByTestId("driver-card-a");
      fireEvent.click(screen.getByText("marker:Chauffeur A."));
      expect(screen.getByTestId("driver-card-a").getAttribute("aria-pressed")).toBe("true");

      fireEvent.click(screen.getByText("map-background"));
      expect(screen.getByTestId("driver-card-a").getAttribute("aria-pressed")).toBe("false");
    });

    it("drops the selection when that driver is no longer free", async () => {
      renderPage();
      fireEvent.click(await screen.findByTestId("driver-card-a"));
      expect(screen.getByTestId("map").getAttribute("data-selected")).toBe("a");

      mocks.getAvailableDrivers.mockResolvedValue(ok([driver("b")]));
      fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
      await waitFor(() => expect(screen.queryByTestId("driver-card-a")).toBeNull());
      expect(screen.getByTestId("map").getAttribute("data-selected")).toBe("");
    });
  });

  describe("errors and weak connection", () => {
    it("shows an access-reserved message (and no map) for a user who is not an approved farmer", async () => {
      mocks.getAvailableDrivers.mockResolvedValue(fail("FORBIDDEN"));
      renderPage();
      expect(await screen.findByText("Accès réservé")).toBeTruthy();
      expect(screen.queryByTestId("map")).toBeNull();
    });

    it("explains that drivers cannot be loaded when nothing was ever loaded", async () => {
      mocks.getAvailableDrivers.mockResolvedValue(fail("NETWORK_ERROR"));
      renderPage();
      // The hook retries once after 1 s before giving up, so wait longer than the default.
      expect(await screen.findByText("Chauffeurs indisponibles", {}, { timeout: 4000 })).toBeTruthy();
      expect(screen.getByText(/la recherche reprend automatiquement/)).toBeTruthy();
      expect(screen.queryByText(/Aucun chauffeur libre/)).toBeNull(); // not a misleading "no drivers"
    });

    it("keeps the last known drivers and warns when a later refresh fails", async () => {
      renderPage();
      await screen.findByTestId("driver-card-a");

      mocks.getAvailableDrivers.mockResolvedValue(fail("NETWORK_ERROR"));
      fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));

      expect(await screen.findByText(/Connexion faible : dernière liste connue affichée/, {}, { timeout: 4000 })).toBeTruthy();
      expect(screen.getByTestId("driver-card-a")).toBeTruthy();
    });

    it("shows a progress message while the first search is running", async () => {
      mocks.getAvailableDrivers.mockReturnValue(new Promise(() => undefined));
      renderPage();
      expect(await screen.findByText("Recherche des chauffeurs…")).toBeTruthy();
    });
  });
});
