import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseClient: vi.fn(),
  getSupabasePublicEnv: vi.fn(),
}));

vi.mock("@/lib/supabase/public-env", () => ({
  getSupabasePublicEnv: mocks.getSupabasePublicEnv,
}));

vi.mock("@/api/supabaseClient", () => ({
  requireSupabaseClient: mocks.requireSupabaseClient,
}));

import {
  createMerchantPayoutAccount,
  getMerchantPayoutAccounts,
  verifyMerchantPayoutAccount,
} from "@/services/payout.service";

const AIRTEL_NUMBER = "074123456"; // prefix 74
const MOOV_NUMBER = "066123456"; // prefix 66

describe("payout.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createMerchantPayoutAccount", () => {
    it("rejects an Airtel number with a Moov prefix", async () => {
      const result = await createMerchantPayoutAccount({
        merchantId: "m1",
        operator: "airtel",
        label: "Compte principal",
        msisdn: MOOV_NUMBER,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_PHONE");
      expect(mocks.requireSupabaseClient).not.toHaveBeenCalled();
    });

    it("rejects a Moov number with an Airtel prefix", async () => {
      const result = await createMerchantPayoutAccount({
        merchantId: "m1",
        operator: "moov",
        label: "Compte principal",
        msisdn: AIRTEL_NUMBER,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_PHONE");
    });

    it("creates a verified-pending payout account with a normalized number", async () => {
      const insertedRow = {
        id: "payout-1",
        merchant_id: "m1",
        provider: "pvit",
        operator: "airtel",
        label: "Compte principal",
        msisdn: AIRTEL_NUMBER,
        normalized_msisdn: AIRTEL_NUMBER,
        disbursement_id: null,
        verification_status: "pending",
        rejection_reason: null,
        is_default: false,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      const builder: any = {
        insert: vi.fn(() => builder),
        select: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: insertedRow, error: null })),
      };
      mocks.requireSupabaseClient.mockReturnValue({ from: vi.fn(() => builder) });

      const result = await createMerchantPayoutAccount({
        merchantId: "m1",
        operator: "airtel",
        label: "Compte principal",
        msisdn: AIRTEL_NUMBER,
      });

      expect(result.success).toBe(true);
      expect(result.data?.verification_status).toBe("pending");
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant_id: "m1",
          provider: "pvit",
          operator: "airtel",
          verification_status: "pending",
          is_active: true,
        })
      );
    });

    it("falls back to a default label when none is provided", async () => {
      const builder: any = {
        insert: vi.fn(() => builder),
        select: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: {}, error: null })),
      };
      mocks.requireSupabaseClient.mockReturnValue({ from: vi.fn(() => builder) });

      await createMerchantPayoutAccount({
        merchantId: "m1",
        operator: "moov",
        label: "   ",
        msisdn: MOOV_NUMBER,
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Libertis/Moov Money" })
      );
    });

    it("surfaces a database error instead of throwing", async () => {
      const builder: any = {
        insert: vi.fn(() => builder),
        select: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: null, error: { code: "23505", message: "duplicate" } })),
      };
      mocks.requireSupabaseClient.mockReturnValue({ from: vi.fn(() => builder) });

      const result = await createMerchantPayoutAccount({
        merchantId: "m1",
        operator: "airtel",
        label: "Compte",
        msisdn: AIRTEL_NUMBER,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("23505");
    });
  });

  describe("getMerchantPayoutAccounts", () => {
    // The real supabase-js query builder is "thenable": every chained method
    // (.select/.eq/.order) returns the same builder, and awaiting it at any
    // point resolves via its own `.then`. Mirror that so a chain ending in
    // two `.order()` calls (no explicit terminal method) still resolves.
    const createThenableBuilder = (result: { data: any; error: any }) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        then: (resolve: (value: unknown) => unknown) => resolve(result),
      };
      return builder;
    };

    it("returns the merchant's PVIT payout accounts", async () => {
      const rows = [{ id: "payout-1" }];
      const builder = createThenableBuilder({ data: rows, error: null });
      mocks.requireSupabaseClient.mockReturnValue({ from: vi.fn(() => builder) });

      const result = await getMerchantPayoutAccounts("m1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(rows);
      expect(builder.eq).toHaveBeenCalledWith("merchant_id", "m1");
    });

    it("returns an error when the query fails", async () => {
      const builder = createThenableBuilder({ data: null, error: { code: "500", message: "down" } });
      mocks.requireSupabaseClient.mockReturnValue({ from: vi.fn(() => builder) });

      const result = await getMerchantPayoutAccounts("m1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("500");
    });
  });

  describe("verifyMerchantPayoutAccount", () => {
    const originalFetch = global.fetch;
    const withSession = (session: unknown) =>
      mocks.requireSupabaseClient.mockReturnValue({
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session } }) },
      });

    beforeEach(() => {
      mocks.getSupabasePublicEnv.mockReturnValue({ url: "https://proj.supabase.co", anonKey: "anon" });
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("fails fast when the Supabase URL is missing", async () => {
      mocks.getSupabasePublicEnv.mockReturnValue({ url: "", anonKey: "" });
      const result = await verifyMerchantPayoutAccount("pa-1");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_CONFIGURED");
    });

    it("requires a session", async () => {
      withSession(null);
      const result = await verifyMerchantPayoutAccount("pa-1");
      expect(result.error?.code).toBe("UNAUTHORIZED");
    });

    it("calls the verify-payout-account function with the user's token", async () => {
      withSession({ access_token: "tok" });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { status: "verified" } }),
      }) as unknown as typeof fetch;

      const result = await verifyMerchantPayoutAccount("pa-1");

      expect(result).toMatchObject({ success: true, data: { status: "verified" } });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://proj.supabase.co/functions/v1/verify-payout-account",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
          body: JSON.stringify({ accountId: "pa-1" }),
        })
      );
    });

    it("surfaces the function's error code and message", async () => {
      withSession({ access_token: "tok" });
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, error: { code: "CUSTOMER_UNKNOWN", message: "Numero inconnu" } }),
      }) as unknown as typeof fetch;

      const result = await verifyMerchantPayoutAccount("pa-1");
      expect(result.success).toBe(false);
      expect(result.error).toMatchObject({ code: "CUSTOMER_UNKNOWN", message: "Numero inconnu" });
    });

    it("handles a network failure", async () => {
      withSession({ access_token: "tok" });
      global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
      const result = await verifyMerchantPayoutAccount("pa-1");
      expect(result.error?.code).toBe("NETWORK_ERROR");
    });
  });
});
