import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  supabaseClient: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/lib/supabase/public-env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://demo.supabase.co",
    anonKey: "anon",
    isConfigured: true,
  }),
}));

import {
  initiateAirtelPayment,
  initiateMoovPayment,
} from "@/services/payment.service";

describe("payment.service integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fails when phone is invalid", async () => {
    const result = await initiateAirtelPayment({
      orderId: "order-1",
      baseAmount: 1000,
      phone: "055000000",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_PHONE");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails when user session is missing", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await initiateAirtelPayment({
      orderId: "order-2",
      baseAmount: 1000,
      phone: "074123456",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NO_SESSION");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("initiates airtel payment successfully", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          transactionId: "tx-1",
          qGabonReference: "ref-1",
          totalAmount: 1090,
          fees: { airtel: 30, pvit: 30, app: 30, total: 90 },
          status: "PENDING",
          message: "Paiement initié avec succès",
          transaction: { id: "tx-1" },
        },
      }),
    });

    const result = await initiateAirtelPayment({
      orderId: "order-3",
      baseAmount: 1000,
      phone: "074123456",
    });

    expect(result.success).toBe(true);
    expect(result.data?.transactionId).toBe("tx-1");
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.supabase.co/functions/v1/initiate-airtel",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      })
    );
  });

  it("returns PAYMENT_FAILED when edge returns success false", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        error: { message: "declined" },
      }),
    });

    const result = await initiateAirtelPayment({
      orderId: "order-3b",
      baseAmount: 1000,
      phone: "074123456",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PAYMENT_FAILED");
  });

  it("returns edge error when function response is not ok", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: { message: "Erreur provider", code: "PROVIDER_ERROR" },
      }),
    });

    const result = await initiateAirtelPayment({
      orderId: "order-4",
      baseAmount: 1000,
      phone: "074123456",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PROVIDER_ERROR");
  });

  it("handles unexpected fetch exception", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network crash"));

    const result = await initiateAirtelPayment({
      orderId: "order-4b",
      baseAmount: 1000,
      phone: "074123456",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("UNEXPECTED_ERROR");
    expect(result.error?.message).toContain("network crash");
  });

  it("initiates moov payment successfully", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          transactionId: "tx-moov",
          qGabonReference: "ref-moov",
          totalAmount: 1090,
          fees: { airtel: 30, pvit: 30, app: 30, total: 90 },
          status: "PENDING",
          message: "Paiement Moov initié",
          transaction: { id: "tx-moov" },
        },
      }),
    });

    const result = await initiateMoovPayment({
      orderId: "order-5",
      baseAmount: 1000,
      phone: "066123456",
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.supabase.co/functions/v1/initiate-moov",
      expect.any(Object)
    );
  });

  it("fails moov on invalid phone", async () => {
    const result = await initiateMoovPayment({
      orderId: "order-6",
      baseAmount: 1000,
      phone: "074123456",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_PHONE");
  });

  it("handles moov edge failure response", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: { message: "Moov provider down", code: "MOOV_PROVIDER_ERROR" },
      }),
    });

    const result = await initiateMoovPayment({
      orderId: "order-7",
      baseAmount: 1000,
      phone: "066123456",
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("MOOV_PROVIDER_ERROR");
  });
});
