import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  requireSupabaseClient: vi.fn(),
  getSupabasePublicEnv: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  requireSupabaseClient: mocks.requireSupabaseClient,
}));

vi.mock("@/lib/supabase/public-env", () => ({
  getSupabasePublicEnv: mocks.getSupabasePublicEnv,
}));

import {
  getAdminPaymentTransactions,
  getMerchantPaymentTransactions,
  getUserPaymentTransactions,
  syncSingPayTransactionStatus,
} from "@/services/payment-transactions.service";

// supabase-js query builders are thenable: chained methods return the same
// builder and awaiting it at any point resolves via its own `.then`.
const createThenableBuilder = (result: { data: any; error: any }) => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return builder;
};

describe("payment-transactions.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
  });

  describe("getUserPaymentTransactions", () => {
    it("fails when the user is not authenticated", async () => {
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      });

      const result = await getUserPaymentTransactions();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("UNAUTHORIZED");
    });

    it("returns only the authenticated customer's transactions", async () => {
      const rows = [{ transaction_id: "t1" }];
      const builder = createThenableBuilder({ data: rows, error: null });
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
        from: vi.fn(() => builder),
      });

      const result = await getUserPaymentTransactions(10);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(rows);
      expect(builder.eq).toHaveBeenCalledWith("customer_id", "user-1");
      expect(builder.range).toHaveBeenCalledWith(0, 9);
    });

    it("surfaces a database error", async () => {
      const builder = createThenableBuilder({ data: null, error: { code: "500", message: "down" } });
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
        from: vi.fn(() => builder),
      });

      const result = await getUserPaymentTransactions();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("500");
    });
  });

  describe("getMerchantPaymentTransactions", () => {
    it("fails when the authenticated user has no merchant profile", async () => {
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      });

      const result = await getMerchantPaymentTransactions();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("MERCHANT_NOT_FOUND");
    });

    it("scopes results to the merchant's own transactions", async () => {
      const rows = [{ transaction_id: "t1" }];
      const transactionsBuilder = createThenableBuilder({ data: rows, error: null });
      const merchantBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: { id: "merchant-1" }, error: null })),
      };
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
        from: vi.fn((table: string) => (table === "merchants" ? merchantBuilder : transactionsBuilder)),
      });

      const result = await getMerchantPaymentTransactions();

      expect(result.success).toBe(true);
      expect(transactionsBuilder.eq).toHaveBeenCalledWith("merchant_id", "merchant-1");
    });
  });

  describe("getAdminPaymentTransactions", () => {
    it("fails fast when Supabase is not configured", async () => {
      mocks.isSupabaseConfigured.mockReturnValue(false);

      const result = await getAdminPaymentTransactions();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_CONFIGURED");
      expect(mocks.requireSupabaseClient).not.toHaveBeenCalled();
    });

    it("returns all transactions unscoped", async () => {
      const rows = [{ transaction_id: "t1" }, { transaction_id: "t2" }];
      const builder = createThenableBuilder({ data: rows, error: null });
      mocks.requireSupabaseClient.mockReturnValue({ from: vi.fn(() => builder) });

      const result = await getAdminPaymentTransactions();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe("syncSingPayTransactionStatus", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("fails fast when Supabase is not configured", async () => {
      mocks.isSupabaseConfigured.mockReturnValue(false);

      const result = await syncSingPayTransactionStatus({ reference: "ref-1" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_CONFIGURED");
    });

    it("fails when the Edge Function URL cannot be resolved", async () => {
      mocks.getSupabasePublicEnv.mockReturnValue({ url: "", anonKey: "" });

      const result = await syncSingPayTransactionStatus({ reference: "ref-1" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_CONFIGURED");
    });

    it("requires an active session", async () => {
      mocks.getSupabasePublicEnv.mockReturnValue({ url: "https://proj.supabase.co", anonKey: "anon" });
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
      });

      const result = await syncSingPayTransactionStatus({ reference: "ref-1" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("UNAUTHORIZED");
    });

    it("calls the sync Edge Function with the session token", async () => {
      mocks.getSupabasePublicEnv.mockReturnValue({ url: "https://proj.supabase.co", anonKey: "anon" });
      mocks.requireSupabaseClient.mockReturnValue({
        auth: {
          getSession: vi.fn(async () => ({ data: { session: { access_token: "token-123" } } })),
        },
      });
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: { status: "confirmed" } }),
      })) as unknown as typeof fetch;

      const result = await syncSingPayTransactionStatus({ reference: "ref-1" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: "confirmed" });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://proj.supabase.co/functions/v1/singpay-transaction-sync",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
        })
      );
    });

    it("surfaces a provider failure returned by the Edge Function", async () => {
      mocks.getSupabasePublicEnv.mockReturnValue({ url: "https://proj.supabase.co", anonKey: "anon" });
      mocks.requireSupabaseClient.mockReturnValue({
        auth: {
          getSession: vi.fn(async () => ({ data: { session: { access_token: "token-123" } } })),
        },
      });
      global.fetch = vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { code: "SINGPAY_DOWN", message: "Provider unreachable" } }),
      })) as unknown as typeof fetch;

      const result = await syncSingPayTransactionStatus({ reference: "ref-1" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SINGPAY_DOWN");
    });
  });
});
