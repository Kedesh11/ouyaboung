import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  requireSupabaseClient: vi.fn(),
  getSession: vi.fn(),
  flowEnabled: { value: true },
}));

vi.mock("@/api/supabaseClient", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  requireSupabaseClient: mocks.requireSupabaseClient,
}));
vi.mock("@/lib/supabase/public-env", () => ({ getSupabasePublicEnv: () => ({ url: "https://test.supabase.co" }) }));
vi.mock("@/services/payment.service", () => ({
  get PAYMENT_FLOW_ENABLED() {
    return mocks.flowEnabled.value;
  },
}));

import { payTransport } from "@/services/transport-payment.service";

describe("payTransport", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flowEnabled.value = true;
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    mocks.requireSupabaseClient.mockReturnValue({ auth: { getSession: mocks.getSession } });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("calls the isolated function with only the course id, the normalized number and the operator", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { reference: "OYB1", totalAmount: 10000 } }) });
    const res = await payTransport({ requestId: "req-1", phone: "77 12 34 56", operator: "airtel" });
    expect(res).toMatchObject({ success: true, data: { reference: "OYB1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://test.supabase.co/functions/v1/initiate-transport-payment");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(["operator", "phone", "requestId"]);
    expect(body).toMatchObject({ requestId: "req-1", operator: "airtel" });
    expect(body.phone).toMatch(/^0?77123456$/);
  });

  it("does nothing while the payment flow is disabled", async () => {
    mocks.flowEnabled.value = false;
    expect(await payTransport({ requestId: "r", phone: "077123456", operator: "airtel" })).toMatchObject({ success: false, error: { code: "PAYMENT_DISABLED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an invalid number or an operator/prefix mismatch before any call", async () => {
    expect(await payTransport({ requestId: "r", phone: "123", operator: "airtel" })).toMatchObject({ error: { code: "INVALID_PHONE" } });
    expect(await payTransport({ requestId: "r", phone: "077123456", operator: "moov" })).toMatchObject({ error: { code: "INVALID_PHONE" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await payTransport({ requestId: "r", phone: "077123456", operator: "airtel" })).toMatchObject({ error: { code: "NO_SESSION" } });
  });

  it("surfaces the server's code and message", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ success: false, error: { code: "ALREADY_PAID", message: "Deja payee" } }) });
    expect(await payTransport({ requestId: "r", phone: "077123456", operator: "airtel" })).toMatchObject({
      success: false,
      error: { code: "ALREADY_PAID", message: "Deja payee" },
    });
  });

  it("turns a network failure into a normal error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await payTransport({ requestId: "r", phone: "077123456", operator: "airtel" })).toMatchObject({ error: { code: "NETWORK_ERROR" } });
  });
});
