import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  requireSupabaseClient: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  requireSupabaseClient: mocks.requireSupabaseClient,
}));

import { adminService } from "@/services/admin.service";

// Minimal chainable Supabase query builder mock: every method returns `this`
// except the terminal ones (`single`, `insert`) which resolve a result.
const createQueryBuilder = (result: { data: any; error: any }) => {
  const builder: any = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => result),
  };
  return builder;
};

describe("admin.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
  });

  describe("updateMerchantStatus", () => {
    it("throws when Supabase is not configured", async () => {
      mocks.isSupabaseConfigured.mockReturnValue(false);

      await expect(
        adminService.updateMerchantStatus({
          merchantId: "m1",
          action: "validate",
          adminId: "admin-1",
        })
      ).rejects.toThrow("Supabase not configured");
    });

    it("requires a refusal reason when refusing a merchant", async () => {
      await expect(
        adminService.updateMerchantStatus({
          merchantId: "m1",
          action: "refuse",
          adminId: "admin-1",
        })
      ).rejects.toThrow("Le motif du refus est obligatoire.");
    });

    it("rejects a refusal reason that is only whitespace", async () => {
      await expect(
        adminService.updateMerchantStatus({
          merchantId: "m1",
          action: "refuse",
          adminId: "admin-1",
          reason: "   ",
        })
      ).rejects.toThrow("Le motif du refus est obligatoire.");
    });

    it("validates a merchant and logs the activity", async () => {
      const merchantBuilder = createQueryBuilder({
        data: {
          id: "m1",
          user_id: "u1",
          business_name: "Chez Marie",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      });
      const insertMock = vi.fn(async () => ({ data: null, error: null }));
      const fromMock = vi.fn((table: string) =>
        table === "merchants" ? merchantBuilder : { insert: insertMock }
      );
      mocks.requireSupabaseClient.mockReturnValue({ from: fromMock });

      const result = await adminService.updateMerchantStatus({
        merchantId: "m1",
        action: "validate",
        adminId: "admin-1",
      });

      expect(result.businessName).toBe("Chez Marie");
      expect(merchantBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_verified: true, is_refused: false, is_active: true })
      );
      expect(merchantBuilder.eq).toHaveBeenCalledWith("id", "m1");
      // Activity log + merchant notification.
      expect(insertMock).toHaveBeenCalledTimes(2);
    });

    it("refuses a merchant with the provided reason", async () => {
      const merchantBuilder = createQueryBuilder({
        data: {
          id: "m1",
          user_id: "u1",
          business_name: "Chez Marie",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      });
      const insertMock = vi.fn(async () => ({ data: null, error: null }));
      mocks.requireSupabaseClient.mockReturnValue({
        from: vi.fn((table: string) => (table === "merchants" ? merchantBuilder : { insert: insertMock })),
      });

      await adminService.updateMerchantStatus({
        merchantId: "m1",
        action: "refuse",
        adminId: "admin-1",
        reason: "Documents manquants",
      });

      expect(merchantBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_verified: false,
          is_refused: true,
          is_active: false,
          refusal_reason: "Documents manquants",
        })
      );
    });

    it("propagates the database error instead of returning partial data", async () => {
      const merchantBuilder = createQueryBuilder({
        data: null,
        error: new Error("db unreachable"),
      });
      mocks.requireSupabaseClient.mockReturnValue({
        from: vi.fn(() => merchantBuilder),
      });

      await expect(
        adminService.updateMerchantStatus({
          merchantId: "m1",
          action: "validate",
          adminId: "admin-1",
        })
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("updateUserRole", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("posts the role change and returns the response payload", async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      })) as unknown as typeof fetch;

      const result = await adminService.updateUserRole("user@example.com", "admin");

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/users/role",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "user@example.com", role: "admin" }),
        })
      );
    });

    it("throws with the server error message when the request fails", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { message: "Not allowed" } }),
      })) as unknown as typeof fetch;

      await expect(adminService.updateUserRole("user@example.com", "admin")).rejects.toThrow(
        "Not allowed"
      );
    });
  });
});
