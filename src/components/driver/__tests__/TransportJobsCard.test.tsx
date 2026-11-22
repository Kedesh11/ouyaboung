// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyTransportJobs: vi.fn(),
  respondTransportRequest: vi.fn(),
  updateTransportJobStatus: vi.fn(),
}));

vi.mock("@/api/transport.api", () => ({
  getMyTransportJobs: mocks.getMyTransportJobs,
  respondTransportRequest: mocks.respondTransportRequest,
  updateTransportJobStatus: mocks.updateTransportJobStatus,
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="pickup-map" />,
}));

import { TransportJobsCard } from "@/components/driver/TransportJobsCard";

const renderCard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TransportJobsCard />
    </QueryClientProvider>,
  );
};

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

const job = (over: Record<string, unknown> = {}) => ({
  id: "j1",
  status: "proposed",
  vehicle_type: null,
  pickup_latitude: 0.4,
  pickup_longitude: 9.45,
  pickup_address: "Route Alpha",
  dropoff_address: "Marché de Mont-Bouët",
  dropoff_latitude: null,
  dropoff_longitude: null,
  cargo_description: "40 régimes de bananes",
  distance_km: 1.5,
  route_distance_km: 12.4,
  fare_amount: 8650,
  platform_fee: 865,
  driver_net: 7785,
  payment_status: "unpaid",
  seconds_to_pay: null,
  paid_at: null,
  proposal_expires_at: "2026-11-22T12:03:00Z",
  seconds_left: 170,
  created_at: "2026-11-22T12:00:00Z",
  accepted_at: null,
  picked_up_at: null,
  client: null,
  ...over,
});

const acceptedJob = (over: Record<string, unknown> = {}) =>
  job({
    status: "accepted",
    payment_status: "paid",
    seconds_left: null,
    proposal_expires_at: null,
    client: { name: "Ferme Alpha", phone: "077 11 11 11", address: "Route Alpha" },
    ...over,
  });

describe("TransportJobsCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows nothing when the driver has no job", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([]));
    const { container } = renderCard();
    await waitFor(() => expect(mocks.getMyTransportJobs).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("shows a proposal with the pickup point, cargo, distance, countdown and a map", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([job()]));
    renderCard();
    expect(await screen.findByText("Nouvelle demande de transport")).toBeTruthy();
    expect(screen.getByText("40 régimes de bananes")).toBeTruthy();
    expect(screen.getByText(/Route Alpha/)).toBeTruthy();
    expect(screen.getByText(/à 1,5 km de vous/)).toBeTruthy();
    expect(screen.getByText("Marché de Mont-Bouët")).toBeTruthy();
    expect(screen.getByTestId("pickup-map")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toMatch(/2 min 5\d s|2 min 4\d s/);
  });

  it("shows the driver what they will earn: fare minus the platform commission", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([job()]));
    renderCard();
    const earnings = await screen.findByTestId("transport-earnings");
    expect(earnings.textContent).toContain("7 785 FCFA");
    expect(earnings.textContent).toContain("tarif 8 650 FCFA");
    expect(earnings.textContent).toContain("commission 865 FCFA");
    expect(earnings.textContent).toContain("trajet 12.4 km");
  });

  it("hides the client's phone and name until the job is accepted", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([job()]));
    renderCard();
    await screen.findByText("Nouvelle demande de transport");
    expect(screen.queryByTestId("transport-client")).toBeNull();
    expect(screen.queryByRole("link", { name: /Appeler/ })).toBeNull();
    expect(screen.getByText(/s'affichent dès que vous acceptez/)).toBeTruthy();
  });

  it("accepts a proposal and then reloads the real state", async () => {
    mocks.getMyTransportJobs.mockResolvedValueOnce(ok([job()])).mockResolvedValue(ok([acceptedJob()]));
    mocks.respondTransportRequest.mockResolvedValue(ok({ declined: false, job: acceptedJob() }));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Accepter" }));

    await waitFor(() => expect(mocks.respondTransportRequest).toHaveBeenCalledWith("j1", true));
    expect(await screen.findByText("Course acceptée")).toBeTruthy();
    expect(screen.getByTestId("transport-client").textContent).toContain("Ferme Alpha");
    const call = screen.getByRole("link", { name: "Appeler Ferme Alpha" }) as HTMLAnchorElement;
    expect(call.getAttribute("href")).toBe("tel:07711111 1".replace(" ", ""));
    const route = screen.getByRole("link", { name: /Itinéraire/ }) as HTMLAnchorElement;
    expect(route.href).toContain("destination=0.4,9.45");
  });

  it("declines a proposal", async () => {
    mocks.getMyTransportJobs.mockResolvedValueOnce(ok([job()])).mockResolvedValue(ok([]));
    mocks.respondTransportRequest.mockResolvedValue(ok({ declined: true, job: null }));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Refuser" }));
    await waitFor(() => expect(mocks.respondTransportRequest).toHaveBeenCalledWith("j1", false));
    await waitFor(() => expect(screen.queryByText("Nouvelle demande de transport")).toBeNull());
  });

  it("explains when the proposal is no longer available", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([job()]));
    mocks.respondTransportRequest.mockResolvedValue(fail("PROPOSAL_NOT_AVAILABLE"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Accepter" }));
    expect(await screen.findByText("Cette demande n'est plus disponible.")).toBeTruthy();
  });

  it("disables the answer buttons once the 180 s are over", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([job({ seconds_left: 0 })]));
    renderCard();
    expect(await screen.findByText("Délai dépassé")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Accepter" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Refuser" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the loading button locked until the farmer has paid, and says why", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([acceptedJob({ payment_status: "unpaid", seconds_to_pay: 600 })]));
    renderCard();
    const state = await screen.findByTestId("transport-payment-state");
    expect(state.textContent).toContain("En attente du paiement de l'agriculteur");
    expect(state.textContent).toMatch(/9 min 5\d s|10 min 00 s/);
    expect((screen.getByRole("button", { name: "Marchandise chargée" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("also keeps it locked while the payment is only pending", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([acceptedJob({ payment_status: "pending" })]));
    renderCard();
    expect((await screen.findByTestId("transport-payment-state")).textContent).toContain("en cours de validation");
    expect((screen.getByRole("button", { name: "Marchandise chargée" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("unlocks loading once the course is paid", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(ok([acceptedJob({ payment_status: "paid" })]));
    renderCard();
    expect((await screen.findByTestId("transport-payment-state")).textContent).toContain("Course payée");
    expect((screen.getByRole("button", { name: "Marchandise chargée" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("moves an accepted job to loaded, then delivered", async () => {
    mocks.getMyTransportJobs
      .mockResolvedValueOnce(ok([acceptedJob()]))
      .mockResolvedValueOnce(ok([acceptedJob({ status: "picked_up" })]))
      .mockResolvedValue(ok([]));
    mocks.updateTransportJobStatus.mockResolvedValue(ok(acceptedJob({ status: "picked_up" })));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Marchandise chargée" }));
    await waitFor(() => expect(mocks.updateTransportJobStatus).toHaveBeenCalledWith("j1", "picked_up"));

    fireEvent.click(await screen.findByRole("button", { name: "Livraison terminée" }));
    await waitFor(() => expect(mocks.updateTransportJobStatus).toHaveBeenLastCalledWith("j1", "delivered"));
  });

  it("reports a loading failure when nothing is known yet", async () => {
    mocks.getMyTransportJobs.mockResolvedValue(fail("NETWORK_ERROR"));
    renderCard();
    expect(await screen.findByText(/Connexion faible/, {}, { timeout: 4000 })).toBeTruthy();
  });
});
