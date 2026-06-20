import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getOrderById: vi.fn(),
  getOrdersByUser: vi.fn(),
  getOrdersByMerchant: vi.fn(),
  updateOrderStatus: vi.fn(),
  cancelOrder: vi.fn(),
  confirmOrder: vi.fn(),
  markOrderReady: vi.fn(),
  completeOrder: vi.fn(),
  addOrderReview: vi.fn(),
  getActiveOrdersApi: vi.fn(),
  cancelOrderViaRPC: vi.fn(),
  enqueueOfflineQueueItem: vi.fn(),
  isBrowserOffline: vi.fn(),
  isLikelyOfflineError: vi.fn(),
}));

vi.mock("@/api", () => ({
  createOrder: mocks.createOrder,
  getOrderById: mocks.getOrderById,
  getOrdersByUser: mocks.getOrdersByUser,
  getOrdersByMerchant: mocks.getOrdersByMerchant,
  updateOrderStatus: mocks.updateOrderStatus,
  cancelOrder: mocks.cancelOrder,
  confirmOrder: mocks.confirmOrder,
  markOrderReady: mocks.markOrderReady,
  completeOrder: mocks.completeOrder,
  addOrderReview: mocks.addOrderReview,
  getActiveOrders: mocks.getActiveOrdersApi,
}));

vi.mock("@/api/orders-rpc.api", () => ({
  cancelOrderViaRPC: mocks.cancelOrderViaRPC,
}));

vi.mock("@/lib/offline/queue", () => ({
  enqueueOfflineQueueItem: mocks.enqueueOfflineQueueItem,
}));

vi.mock("@/lib/offline/cache", () => ({
  isBrowserOffline: mocks.isBrowserOffline,
  isLikelyOfflineError: mocks.isLikelyOfflineError,
}));

import {
  addReview,
  calculateTotalSavings,
  canCancel,
  canReview,
  cancel,
  cancelOrderViaRPC,
  complete,
  confirm,
  createReservation,
  formatOrderForDisplay,
  getActive,
  getActiveOrders,
  getMerchantOrders,
  getOrder,
  getStatusColor,
  getStatusText,
  getUserOrders,
  markReady,
} from "@/services/order.service";

describe("order.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isBrowserOffline.mockReturnValue(false);
    mocks.isLikelyOfflineError.mockReturnValue(false);
    mocks.enqueueOfflineQueueItem.mockResolvedValue({ id: "offline-1" });
  });

  it("queues reservation when browser is offline", async () => {
    mocks.isBrowserOffline.mockReturnValue(true);

    const result = await createReservation("user-1", "item-1", 2);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("OFFLINE_QUEUED");
    expect(mocks.enqueueOfflineQueueItem).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("queues reservation when api returns likely offline error", async () => {
    mocks.createOrder.mockResolvedValue({
      success: false,
      data: null,
      error: { code: "NETWORK", message: "network down" },
    });
    mocks.isLikelyOfflineError.mockReturnValue(true);

    const result = await createReservation("user-1", "item-1", 2);

    expect(result.error?.code).toBe("OFFLINE_QUEUED");
    expect(mocks.enqueueOfflineQueueItem).toHaveBeenCalledTimes(1);
  });

  it("maps unexpected createReservation errors", async () => {
    mocks.createOrder.mockRejectedValue(new Error("boom"));
    mocks.isLikelyOfflineError.mockReturnValue(false);

    const result = await createReservation("user-1", "item-1", 1);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RESERVATION_ERROR");
    expect(result.error?.message).toContain("boom");
  });

  it("returns createOrder result when successful", async () => {
    mocks.createOrder.mockResolvedValue({
      success: true,
      data: { id: "order-1" },
      error: null,
    });

    const result = await createReservation("user-1", "item-1", 2);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("order-1");
  });

  it("re-exports cancelOrderViaRPC through the service layer", async () => {
    mocks.cancelOrderViaRPC.mockResolvedValue({
      success: true,
      data: { id: "order-1", status: "cancelled" },
      error: null,
    });

    const result = await cancelOrderViaRPC("order-1", "changed mind");

    expect(result.success).toBe(true);
    expect(mocks.cancelOrderViaRPC).toHaveBeenCalledWith("order-1", "changed mind");
  });

  it("filters active orders only", async () => {
    mocks.getOrdersByUser.mockResolvedValue({
      success: true,
      error: null,
      data: {
        data: [
          { id: "o1", status: "pending" },
          { id: "o2", status: "confirmed" },
          { id: "o3", status: "ready" },
          { id: "o4", status: "cancelled" },
        ],
      },
    });

    const result = await getActiveOrders({ userId: "user-1" });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
    expect(result.data?.map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
  });

  it("passes through api wrappers", async () => {
    mocks.getOrderById.mockResolvedValue({ success: true, data: { id: "o10" }, error: null });
    mocks.getOrdersByUser.mockResolvedValue({ success: true, data: { data: [] }, error: null });
    mocks.getOrdersByMerchant.mockResolvedValue({ success: true, data: { data: [] }, error: null });
    mocks.cancelOrder.mockResolvedValue({ success: true, data: { id: "o10" }, error: null });
    mocks.confirmOrder.mockResolvedValue({ success: true, data: { id: "o10" }, error: null });
    mocks.markOrderReady.mockResolvedValue({ success: true, data: { id: "o10" }, error: null });
    mocks.completeOrder.mockResolvedValue({ success: true, data: { id: "o10" }, error: null });
    mocks.addOrderReview.mockResolvedValue({ success: true, data: { id: "o10" }, error: null });
    mocks.getActiveOrdersApi.mockResolvedValue({ success: true, data: [], error: null });

    await getOrder("o10");
    await getUserOrders("u1", { page: 2, perPage: 10, status: "ready" as any });
    await getMerchantOrders("m1", { page: 3, perPage: 5, status: "pending" as any });
    await cancel("o10", "reason");
    await confirm("o10");
    await markReady("o10");
    await complete("o10", "PK123456");
    await addReview("o10", 5, "ok");
    await getActive({ userId: "u1" });

    expect(mocks.getOrdersByUser).toHaveBeenCalledWith("u1", "ready", 10, 10);
    expect(mocks.getOrdersByMerchant).toHaveBeenCalledWith("m1", "pending", 5, 10);
    expect(mocks.cancelOrder).toHaveBeenCalledWith("o10", "reason");
    expect(mocks.confirmOrder).toHaveBeenCalledWith("o10");
    expect(mocks.markOrderReady).toHaveBeenCalledWith("o10");
    expect(mocks.completeOrder).toHaveBeenCalledWith("o10", "PK123456");
    expect(mocks.addOrderReview).toHaveBeenCalledWith("o10", 5, "ok");
    expect(mocks.getActiveOrdersApi).toHaveBeenCalledWith("u1", undefined);
  });

  it("maps status labels and styles", () => {
    expect(getStatusText("pending")).toBe("En attente de paiement");
    expect(getStatusText("completed")).toBe("Terminée");
    expect(getStatusColor("ready")).toContain("text-success");
    expect(getStatusColor("cancelled")).toContain("text-destructive");
  });

  it("computes cancel/review rules and display model", () => {
    const order = {
      id: "order-2",
      status: "completed",
      rating: null,
      merchant: { business_name: "Chez Marie" },
      food_item: { name: "Panier Mixte" },
      quantity: 1,
      total_price: 2500,
      savings: 1200,
      pickup_code: "PK123456",
      created_at: "2026-03-01T10:00:00.000Z",
    } as any;

    expect(canCancel({ status: "pending" } as any)).toBe(true);
    expect(canCancel({ status: "ready" } as any)).toBe(false);
    expect(canReview(order)).toBe(true);
    expect(canReview({ ...order, rating: 4 })).toBe(false);
    expect(calculateTotalSavings([order, { ...order, savings: 300 }])).toBe(1500);

    const view = formatOrderForDisplay(order);
    expect(view.merchantName).toBe("Chez Marie");
    expect(view.itemName).toBe("Panier Mixte");
    expect(view.status).toBe("Terminée");
  });
});
