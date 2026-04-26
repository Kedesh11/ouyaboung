import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockRefreshSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRefreshSession: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  supabaseClient: {
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
    },
  },
}));

vi.mock("@/lib/supabase/public-env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://demo.supabase.co",
    anonKey: "anon-key",
    isConfigured: true,
  }),
}));

import { callEdgeFunctionWithAuth } from "@/lib/auth/edge-function-client";

describe("edge-function-client integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns SESSION_EXPIRED when no valid session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });

    const result = await callEdgeFunctionWithAuth({
      functionName: "validate-qr",
      body: { pickup_code: "PK123456" },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error?.code).toBe("SESSION_EXPIRED");
  });

  it("calls edge function successfully with active token", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-1", expires_at: farFuture } },
      error: null,
    });

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: "ok" }),
    });

    const result = await callEdgeFunctionWithAuth({
      functionName: "validate-qr",
      body: { pickup_code: "PK123456" },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.supabase.co/functions/v1/validate-qr",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          apikey: "anon-key",
        }),
      })
    );
  });

  it("refreshes token and retries once on unauthorized", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-1", expires_at: now + 3600 } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "token-2", expires_at: now + 3600 } },
      error: null,
    });

    (fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: "UNAUTHORIZED", error: "Unauthorized" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: "retried" }),
      });

    const result = await callEdgeFunctionWithAuth({
      functionName: "validate-qr",
      body: { pickup_code: "PK123456" },
    });

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondCallHeaders = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].headers;
    expect(secondCallHeaders.Authorization).toBe("Bearer token-2");
  });
});
