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

  describe("RPC-backed dashboard aggregation", () => {
    // These used to fetch whole tables and reduce in JS; now they call a
    // SECURITY DEFINER SQL function that aggregates server-side. Verify the
    // right RPC/args are used and the row shape is mapped correctly.

    it("getKPIs maps the aggregated row and computes average order value", async () => {
      const singleMock = vi.fn(async () => ({
        data: {
          total_merchants: 5,
          active_merchants: 3,
          pending_merchants: 2,
          refused_merchants: 0,
          total_clients: 10,
          active_products: 13,
          total_sales: 4,
          total_revenue: 8000,
        },
        error: null,
      }));
      const rpcMock = vi.fn(() => ({ single: singleMock }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: rpcMock });

      const result = await adminService.getKPIs();

      expect(rpcMock).toHaveBeenCalledWith("get_admin_dashboard_kpis");
      expect(result).toMatchObject({
        totalMerchants: 5,
        activeMerchants: 3,
        totalSales: 4,
        totalRevenue: 8000,
        averageOrderValue: 2000,
      });
    });

    it("getKPIs returns safe zeroed defaults when the RPC errors", async () => {
      const singleMock = vi.fn(async () => ({ data: null, error: new Error("forbidden") }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: vi.fn(() => ({ single: singleMock })) });

      const result = await adminService.getKPIs();

      expect(result.totalRevenue).toBe(0);
      expect(result.averageOrderValue).toBe(0);
    });

    it("getGeoDistribution maps city/merchant_count rows", async () => {
      const rpcMock = vi.fn(async () => ({
        data: [
          { city: "Libreville", merchant_count: 4 },
          { city: "Port-Gentil", merchant_count: 1 },
        ],
        error: null,
      }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: rpcMock });

      const result = await adminService.getGeoDistribution();

      expect(rpcMock).toHaveBeenCalledWith("get_admin_geo_distribution");
      expect(result).toEqual([
        { city: "Libreville", merchantCount: 4, salesCount: 0 },
        { city: "Port-Gentil", merchantCount: 1, salesCount: 0 },
      ]);
    });

    it("getSalesStats buckets rows by French day label in Mon-Sun order", async () => {
      // 2026-07-08 is a Wednesday.
      const rpcMock = vi.fn(async () => ({
        data: [{ day_date: "2026-07-08", orders_count: 3, revenue: 4500 }],
        error: null,
      }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: rpcMock });

      const result = await adminService.getSalesStats();

      expect(rpcMock).toHaveBeenCalledWith("get_admin_sales_stats", { p_days: 7 });
      expect(result.map((s) => s.period)).toEqual(["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]);
      const wednesday = result.find((s) => s.period === "Mer");
      expect(wednesday).toMatchObject({ sales: 3, orders: 3, revenue: 4500 });
    });

    it("getTopMerchants maps aggregated rows in the RPC's order", async () => {
      const rpcMock = vi.fn(async () => ({
        data: [
          { id: "m1", business_name: "Chez Marie", rating: 4.5, orders_count: 2, revenue: 5000, products_count: 3 },
        ],
        error: null,
      }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: rpcMock });

      const result = await adminService.getTopMerchants(5);

      expect(rpcMock).toHaveBeenCalledWith("get_admin_top_merchants", { p_limit: 5 });
      expect(result).toEqual([
        { id: "m1", name: "Chez Marie", sales: 2, revenue: 5000, productsCount: 3 },
      ]);
    });

    it("getClients maps rows and derives active/inactive status from orders_count", async () => {
      const rpcMock = vi.fn(async () => ({
        data: [
          {
            profile_id: "p1",
            user_id: "u1",
            email: "client@example.com",
            phone: null,
            full_name: null,
            city: null,
            quartier: null,
            role: "user",
            created_at: "2026-01-01T00:00:00.000Z",
            orders_count: 2,
            total_spent: 3500,
          },
        ],
        error: null,
      }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: rpcMock });

      const result = await adminService.getClients();

      expect(rpcMock).toHaveBeenCalledWith("get_admin_clients", { p_limit: 500, p_offset: 0 });
      expect(result[0]).toMatchObject({
        id: "u1",
        profileId: "p1",
        fullName: "client", // derived from email local-part when full_name is null
        ordersCount: 2,
        totalSpent: 3500,
        status: "active",
      });
    });

    it("getClients paginates via p_limit/p_offset", async () => {
      const rpcMock = vi.fn(async () => ({ data: [], error: null }));
      mocks.requireSupabaseClient.mockReturnValue({ rpc: rpcMock });

      await adminService.getClients(3, 50);

      expect(rpcMock).toHaveBeenCalledWith("get_admin_clients", { p_limit: 50, p_offset: 100 });
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
