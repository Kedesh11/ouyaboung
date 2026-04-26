import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  supabaseClient: {
    from: mockFrom,
  },
}));

import {
  archiveNotification,
  createNotification,
  deleteNotification,
  getPreferences,
  getUnreadCount,
  getUserNotifications,
  markAllAsRead,
  markAsRead,
  sendOrderNotification,
  sendQRCodeNotification,
  updatePreferences,
} from "@/services/notification.service";

const createQueryBuilder = (payload: Record<string, unknown>) => {
  const query: Record<string, any> = {
    ...payload,
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    insert: vi.fn(() => query),
    single: vi.fn(async () => payload),
    maybeSingle: vi.fn(async () => payload),
  };
  return query;
};

describe("notification.service integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches notifications with filters", async () => {
    const builder = createQueryBuilder({
      data: [{ id: "n1", user_id: "u1", title: "t", message: "m", is_read: false }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await getUserNotifications("u1", { unreadOnly: true, limit: 10 });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builder.eq).toHaveBeenCalledWith("is_read", false);
    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  it("handles notification fetch failures", async () => {
    const builder = createQueryBuilder({
      data: null,
      error: { message: "db down" },
    });
    mockFrom.mockReturnValue(builder);

    const result = await getUserNotifications("u1");

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
    expect(result.data).toEqual([]);
  });

  it("creates notification row", async () => {
    const builder = createQueryBuilder({
      data: { id: "n2", user_id: "u2", title: "ok", message: "ok", is_read: false },
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await createNotification({
      user_id: "u2",
      type: "system_update",
      category: "system",
      title: "ok",
      message: "ok",
    });

    expect(result.success).toBe(true);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u2",
        type: "system_update",
        is_read: false,
      })
    );
  });

  it("handles create and delete notification failures", async () => {
    const createFailBuilder = createQueryBuilder({
      data: null,
      error: { message: "insert fail" },
    });
    mockFrom.mockReturnValueOnce(createFailBuilder);

    const createResult = await createNotification({
      user_id: "u2",
      type: "system_update",
      category: "system",
      title: "ok",
      message: "ok",
    });
    expect(createResult.success).toBe(false);
    expect(createResult.error?.code).toBe("CREATE_ERROR");

    const deleteFailBuilder = createQueryBuilder({
      data: null,
      error: { message: "delete fail" },
    });
    mockFrom.mockReturnValueOnce(deleteFailBuilder);
    const deleteResult = await deleteNotification("n2", "u2");
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error?.code).toBe("DELETE_ERROR");
  });

  it("computes unread count", async () => {
    const builder = createQueryBuilder({
      count: 7,
      error: null,
      data: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await getUnreadCount("u3");

    expect(result.success).toBe(true);
    expect(result.data).toBe(7);
  });

  it("handles unread count failure", async () => {
    const builder = createQueryBuilder({
      count: null,
      error: { message: "db error" },
      data: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await getUnreadCount("u3");
    expect(result.success).toBe(false);
    expect(result.data).toBe(0);
  });

  it("marks single and all notifications as read", async () => {
    const builder = createQueryBuilder({
      error: null,
      data: null,
    });
    mockFrom.mockReturnValue(builder);

    const one = await markAsRead("notif-1", "u4");
    const all = await markAllAsRead("u4");

    expect(one.success).toBe(true);
    expect(all.success).toBe(true);
    expect(builder.update).toHaveBeenCalledWith({ is_read: true });
    expect(builder.eq).toHaveBeenCalledWith("id", "notif-1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u4");
    expect(builder.eq).toHaveBeenCalledWith("is_read", false);
  });

  it("handles markAsRead and markAllAsRead failures", async () => {
    const builder = createQueryBuilder({
      error: { message: "update failed" },
      data: null,
    });
    mockFrom.mockReturnValue(builder);

    const one = await markAsRead("notif-1", "u4");
    const all = await markAllAsRead("u4");

    expect(one.success).toBe(false);
    expect(one.error?.code).toBe("UPDATE_ERROR");
    expect(all.success).toBe(false);
    expect(all.error?.code).toBe("UPDATE_ERROR");
  });

  it("returns existing preferences when already configured", async () => {
    const existing = {
      user_id: "u10",
      push_enabled: false,
      email_enabled: true,
      sms_enabled: true,
      categories: { order: true, payment: true, promotion: false, system: true, merchant: true, impact: true },
      quiet_hours: { enabled: true, start: "23:00", end: "07:00" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const profileQuery = createQueryBuilder({
      data: { id: "p1", preferences: { notification_preferences: existing } },
      error: null,
    });
    mockFrom.mockReturnValue(profileQuery);

    const result = await getPreferences("u10");

    expect(result.success).toBe(true);
    expect(result.data?.push_enabled).toBe(false);
  });

  it("creates default preferences when missing", async () => {
    const profileQuery = createQueryBuilder({
      data: { id: "p2", preferences: {} },
      error: null,
    });
    mockFrom.mockImplementation(() => profileQuery);

    const result = await getPreferences("u11");

    expect(result.success).toBe(true);
    expect(result.data?.user_id).toBe("u11");
    expect(profileQuery.update).toHaveBeenCalled();
  });

  it("handles getPreferences failure", async () => {
    const profileQuery = createQueryBuilder({
      data: null,
      error: { message: "profile read failed" },
    });
    mockFrom.mockReturnValue(profileQuery);

    const result = await getPreferences("u-error");
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });

  it("updates preferences from current values", async () => {
    const current = {
      user_id: "u12",
      push_enabled: true,
      email_enabled: true,
      sms_enabled: false,
      categories: { order: true, payment: true, promotion: true, system: true, merchant: true, impact: true },
      quiet_hours: { enabled: false, start: "22:00", end: "08:00" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const getPrefBuilder = createQueryBuilder({
      data: { id: "p3", preferences: { notification_preferences: current } },
      error: null,
    });
    const profileReadBuilder = createQueryBuilder({
      data: { preferences: { other: true } },
      error: null,
    });
    const profileUpdateBuilder = createQueryBuilder({
      data: null,
      error: null,
    });

    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex += 1;
      if (callIndex === 1) return getPrefBuilder;
      if (callIndex === 2) return profileReadBuilder;
      return profileUpdateBuilder;
    });

    const result = await updatePreferences("u12", { push_enabled: false });

    expect(result.success).toBe(true);
    expect(result.data?.push_enabled).toBe(false);
    expect(profileUpdateBuilder.update).toHaveBeenCalled();
  });

  it("fails updatePreferences when current preferences cannot be loaded", async () => {
    const getPrefFailBuilder = createQueryBuilder({
      data: null,
      error: { message: "boom" },
    });
    mockFrom.mockReturnValue(getPrefFailBuilder);

    const result = await updatePreferences("u13", { push_enabled: false });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("UPDATE_ERROR");
  });

  it("sends mapped order and QR notifications", async () => {
    const builder = createQueryBuilder({
      data: { id: "n3" },
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    await sendOrderNotification("u5", "ready", {
      id: "order-7",
      itemName: "Panier Surprise",
      merchantName: "Le Marche",
    });
    await sendQRCodeNotification("u5", "tx-55");

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u5",
        type: "order_ready",
        title: "Commande prête",
      })
    );
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u5",
        type: "qr_generated",
        data: { transactionId: "tx-55" },
      })
    );
  });

  it("archiveNotification is currently a no-op success", async () => {
    const result = await archiveNotification("n1", "u5");
    expect(result.success).toBe(true);
  });
});
