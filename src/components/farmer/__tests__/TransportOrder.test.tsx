// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransportRequest: vi.fn(),
  cancelTransportRequest: vi.fn(),
}));

vi.mock("@/api/transport.api", () => ({
  createTransportRequest: mocks.createTransportRequest,
  cancelTransportRequest: mocks.cancelTransportRequest,
  getMyTransportRequest: vi.fn(),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="transport-map" />,
}));

import { TransportOrderDialog } from "@/components/farmer/TransportOrderDialog";
import { TransportRequestPanel } from "@/components/farmer/TransportRequestPanel";

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

const request = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  status: "proposed",
  dispatch_mode: "auto",
  vehicle_type: null,
  pickup_latitude: 0.4,
  pickup_longitude: 9.45,
  pickup_address: "Route Alpha",
  dropoff_address: "Port-Gentil",
  dropoff_latitude: null,
  dropoff_longitude: null,
  cargo_description: "Bananes",
  proposal_expires_at: "2026-11-22T12:03:00Z",
  seconds_left: 175,
  closed_reason: null,
  created_at: "2026-11-22T12:00:00Z",
  accepted_at: null,
  picked_up_at: null,
  delivered_at: null,
  driver: { driver_id: "d1", display_name: "Jean D.", vehicle_type: "camionnette", rating: 4.5, total_reviews: 12, phone: "060 00 00 01" },
  ...over,
});

describe("TransportRequestPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  const renderPanel = (req: unknown, onDismiss = vi.fn()) =>
    wrap(<TransportRequestPanel request={req as never} receivedAt={Date.now()} onDismiss={onDismiss} />);

  it("shows the waiting state with the 3 minute countdown and the proposed driver", () => {
    renderPanel(request());
    expect(screen.getByText("En attente du chauffeur")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toMatch(/2 min 5\d s|2 min 4\d s/);
    expect(screen.getByTestId("transport-driver").textContent).toContain("Jean D.");
    expect(screen.getByRole("link", { name: "Appeler Jean D." }).getAttribute("href")).toBe("tel:060000001");
    expect(screen.queryByTestId("transport-map")).toBeNull();
  });

  it("asks for confirmation before cancelling, then cancels", async () => {
    mocks.cancelTransportRequest.mockResolvedValue(ok(request({ status: "cancelled" })));
    renderPanel(request());
    fireEvent.click(screen.getByRole("button", { name: "Annuler la demande" }));
    expect(mocks.cancelTransportRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
    await waitFor(() => expect(mocks.cancelTransportRequest).toHaveBeenCalledWith("r1"));
  });

  it("can back out of cancelling", () => {
    renderPanel(request());
    fireEvent.click(screen.getByRole("button", { name: "Annuler la demande" }));
    fireEvent.click(screen.getByRole("button", { name: "Non, garder" }));
    expect(screen.getByRole("button", { name: "Annuler la demande" })).toBeTruthy();
    expect(mocks.cancelTransportRequest).not.toHaveBeenCalled();
  });

  it("shows the live map once the driver is on the way", () => {
    renderPanel(
      request({
        status: "accepted",
        seconds_left: null,
        driver: { driver_id: "d1", display_name: "Jean D.", vehicle_type: "camionnette", rating: 0, total_reviews: 0, phone: "060000001", latitude: 0.41, longitude: 9.46, age_seconds: 25 },
      }),
    );
    expect(screen.getByText("Chauffeur en route")).toBeTruthy();
    expect(screen.getByTestId("transport-map")).toBeTruthy();
    expect(screen.getByText(/position il y a 25 s/)).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("cannot cancel once the goods are loaded", () => {
    renderPanel(request({ status: "picked_up", seconds_left: null }));
    expect(screen.queryByRole("button", { name: "Annuler la demande" })).toBeNull();
  });

  it("explains an unanswered request and lets the farmer start over", () => {
    const onDismiss = vi.fn();
    renderPanel(request({ status: "no_driver", closed_reason: "proposal_expired", seconds_left: null, driver: null }), onDismiss);
    expect(screen.getByText("Aucun chauffeur disponible")).toBeTruthy();
    expect(screen.getByText(/n'a pas répondu dans les 3 minutes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle demande" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("TransportOrderDialog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  const renderDialog = (props: Partial<React.ComponentProps<typeof TransportOrderDialog>> = {}) => {
    const onOpenChange = vi.fn();
    wrap(
      <TransportOrderDialog
        open
        onOpenChange={onOpenChange}
        mode="auto"
        vehicleType={null}
        pickup={null}
        farmAddress="Route Alpha"
        {...props}
      />,
    );
    return onOpenChange;
  };

  const fill = () => {
    fireEvent.change(screen.getByLabelText("Marchandise à transporter"), { target: { value: "40 régimes" } });
    fireEvent.change(screen.getByLabelText("Adresse de livraison"), { target: { value: "Mont-Bouët" } });
  };

  it("announces the 3 minute delay and the nearest-driver principle", () => {
    renderDialog();
    expect(screen.getByText(/chauffeur libre le plus proche, puis au suivant/)).toBeTruthy();
    expect(screen.getByText(/3 minutes pour répondre/)).toBeTruthy();
  });

  it("cannot be submitted until cargo and delivery address are given", () => {
    renderDialog();
    const submit = screen.getByRole("button", { name: "Envoyer la demande" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fill();
    expect(submit.disabled).toBe(false);
  });

  it("sends an automatic request using the farm pickup (no coordinates)", async () => {
    mocks.createTransportRequest.mockResolvedValue(ok(request()));
    const onOpenChange = renderDialog({ vehicleType: "camionnette" });
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    await waitFor(() =>
      expect(mocks.createTransportRequest).toHaveBeenCalledWith({
        mode: "auto",
        driverId: null,
        dropoffAddress: "Mont-Bouët",
        cargoDescription: "40 régimes",
        vehicleType: "camionnette",
        pickup: null,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("sends a manual request for the chosen driver with the device position as pickup", async () => {
    mocks.createTransportRequest.mockResolvedValue(ok(request({ dispatch_mode: "manual" })));
    renderDialog({ mode: "manual", driver: { driver_id: "d1", display_name: "Jean D." }, pickup: { latitude: 0.41, longitude: 9.46 } });
    expect(screen.getByText("Commander Jean D.")).toBeTruthy();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    await waitFor(() =>
      expect(mocks.createTransportRequest).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "manual", driverId: "d1", pickup: { latitude: 0.41, longitude: 9.46, address: "Route Alpha" } }),
      ),
    );
  });

  it("keeps the dialog open and explains a server refusal", async () => {
    mocks.createTransportRequest.mockResolvedValue(fail("NO_DRIVER_AVAILABLE"));
    const onOpenChange = renderDialog();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(await screen.findByText(/Aucun chauffeur libre pour le moment/)).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("explains when the chosen driver was taken meanwhile", async () => {
    mocks.createTransportRequest.mockResolvedValue(fail("DRIVER_UNAVAILABLE"));
    renderDialog({ mode: "manual", driver: { driver_id: "d1", display_name: "Jean D." } });
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
    expect(await screen.findByText(/n'est plus disponible\. Choisissez-en un autre/)).toBeTruthy();
  });
});
