/**
 * Security-hardening regression suite (single file).
 *
 *  1. Payment guards (pure functions)
 *  2. Middleware role resolution (user_metadata must never grant access)
 *  3. resolveAdminAuth (API-side admin check)
 *  4. Static guard: no authorization decision reads user_metadata.role
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  canTransitionPaymentStatus,
  inFlightWindowStart,
  isReportedAmountValid,
} from "../../supabase/functions/_shared/payment-guards";

// ---------------------------------------------------------------------------
// Shared mutable mock state (vi.mock factories are hoisted)
// ---------------------------------------------------------------------------
type AnyRow = Record<string, any>;

const state = vi.hoisted(() => ({
  // Next.js side
  authUser: null as null | { id: string; app_metadata?: AnyRow; user_metadata?: AnyRow },
  profileRole: undefined as string | undefined | "THROW",
}));

vi.mock("@/lib/supabase/public-env", () => ({
  getSupabasePublicEnv: () => ({ url: "https://test.supabase.co", anonKey: "anon" }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

const profilesBuilder = () => {
  const b: AnyRow = {
    select: () => b,
    eq: () => b,
    single: async () => {
      if (state.profileRole === "THROW") throw new Error("db down");
      return { data: state.profileRole ? { role: state.profileRole } : null, error: null };
    },
    maybeSingle: async () => ({
      data: state.profileRole && state.profileRole !== "THROW" ? { role: state.profileRole } : null,
      error: null,
    }),
  };
  return b;
};

const nextSideClient = () => ({
  auth: {
    getUser: async () =>
      state.authUser
        ? { data: { user: state.authUser }, error: null }
        : { data: { user: null }, error: { message: "no session" } },
  },
  from: () => profilesBuilder(),
});

vi.mock("@supabase/ssr", () => ({ createServerClient: () => nextSideClient() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => nextSideClient() }));

// ---------------------------------------------------------------------------
// 1. Payment guards
// ---------------------------------------------------------------------------
describe("payment guards", () => {
  describe("canTransitionPaymentStatus", () => {
    it("allows any move out of a non-final state", () => {
      for (const next of ["pending", "confirmed", "failed", "expired"]) {
        expect(canTransitionPaymentStatus("pending", next)).toBe(true);
        expect(canTransitionPaymentStatus("initiated", next)).toBe(true);
        expect(canTransitionPaymentStatus(null, next)).toBe(true);
        expect(canTransitionPaymentStatus(undefined, next)).toBe(true);
      }
    });

    it("does not let a late failure, timeout or pending overwrite a confirmed payment", () => {
      expect(canTransitionPaymentStatus("confirmed", "failed")).toBe(false);
      expect(canTransitionPaymentStatus("confirmed", "expired")).toBe(false);
      expect(canTransitionPaymentStatus("confirmed", "pending")).toBe(false);
      expect(canTransitionPaymentStatus("confirmed", "cancelled")).toBe(false);
    });

    it("does not let a late confirmation resurrect a failed/expired/cancelled/refunded payment", () => {
      for (const from of ["failed", "expired", "cancelled", "refunded"]) {
        expect(canTransitionPaymentStatus(from, "confirmed")).toBe(false);
      }
    });

    it("allows refunding a confirmed payment and replays of the same final state", () => {
      expect(canTransitionPaymentStatus("confirmed", "refunded")).toBe(true);
      expect(canTransitionPaymentStatus("confirmed", "confirmed")).toBe(true);
      expect(canTransitionPaymentStatus("failed", "failed")).toBe(true);
    });

    it("does not allow leaving refunded", () => {
      expect(canTransitionPaymentStatus("refunded", "pending")).toBe(false);
      expect(canTransitionPaymentStatus("refunded", "failed")).toBe(false);
    });
  });

  describe("isReportedAmountValid", () => {
    it("accepts an exact match, ignoring float noise", () => {
      expect(isReportedAmountValid(5000, 5000)).toBe(true);
      expect(isReportedAmountValid(5000, 5000.4)).toBe(true);
    });

    it("rejects any different amount", () => {
      expect(isReportedAmountValid(5000, 500)).toBe(false);
      expect(isReportedAmountValid(5000, 5001)).toBe(false);
      expect(isReportedAmountValid(5000, 50000)).toBe(false);
    });

    it("accepts payloads that carry no usable amount", () => {
      expect(isReportedAmountValid(5000, undefined)).toBe(true);
      expect(isReportedAmountValid(5000, null)).toBe(true);
      expect(isReportedAmountValid(5000, 0)).toBe(true);
      expect(isReportedAmountValid(5000, NaN)).toBe(true);
      expect(isReportedAmountValid(5000, -10)).toBe(true);
    });
  });

  describe("inFlightWindowStart", () => {
    it("returns an ISO timestamp 5 minutes before now", () => {
      const now = Date.parse("2026-01-01T12:00:00.000Z");
      expect(inFlightWindowStart(now)).toBe("2026-01-01T11:55:00.000Z");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Middleware
// ---------------------------------------------------------------------------
describe("middleware role resolution", () => {
  const run = async (pathname: string) => {
    const { middleware } = await import("../../middleware");
    return middleware(new NextRequest(`http://localhost${pathname}`));
  };
  const redirectedTo = (res: Response) =>
    res.status >= 300 && res.status < 400 ? new URL(res.headers.get("location")!).pathname : null;

  beforeEach(() => {
    state.authUser = null;
    state.profileRole = undefined;
  });

  describe.each([
    ["/admin", "admin"],
    ["/merchant", "merchant"],
    ["/farmer", "farmer"],
    ["/driver", "driver"],
  ])("%s", (route, role) => {
    it("redirects anonymous visitors to /auth with the return path", async () => {
      const res = await run(route);
      expect(redirectedTo(res)).toBe("/auth");
      expect(new URL(res.headers.get("location")!).searchParams.get("redirect")).toBe(route);
    });

    it("blocks a user who forged user_metadata.role (privilege escalation)", async () => {
      state.authUser = { id: "u1", user_metadata: { role }, app_metadata: {} };
      state.profileRole = "user";
      expect(redirectedTo(await run(route))).toBe("/");
    });

    it("blocks a forged user_metadata.role even when the profile lookup fails", async () => {
      state.authUser = { id: "u1", user_metadata: { role } };
      state.profileRole = "THROW";
      expect(redirectedTo(await run(route))).toBe("/");
    });

    it("blocks a forged user_metadata.role when there is no profile row", async () => {
      state.authUser = { id: "u1", user_metadata: { role } };
      state.profileRole = undefined;
      expect(redirectedTo(await run(route))).toBe("/");
    });

    it("lets through a user whose profile role matches", async () => {
      state.authUser = { id: "u1", user_metadata: {}, app_metadata: {} };
      state.profileRole = role;
      expect(redirectedTo(await run(route))).toBeNull();
    });

    it("lets through a user whose app_metadata role matches", async () => {
      state.authUser = { id: "u1", app_metadata: { role } };
      state.profileRole = undefined;
      expect(redirectedTo(await run(route))).toBeNull();
    });

    it("re-checks the profile before granting another role's area", async () => {
      // A claim for one role never opens a different role's area: the profile decides.
      state.authUser = { id: "u1", app_metadata: { role } };
      state.profileRole = "user";
      const other = role === "admin" ? "/merchant" : "/admin";
      expect(redirectedTo(await run(other))).toBe("/");
    });
  });

  it("keeps consumer routes for role 'user' and rejects other roles", async () => {
    state.authUser = { id: "u1" };
    state.profileRole = "user";
    expect(redirectedTo(await run("/user"))).toBeNull();
    state.profileRole = "merchant";
    expect(redirectedTo(await run("/user"))).toBe("/");
  });

  it("does not gate the public registration pages", async () => {
    for (const p of ["/merchant/register", "/farmer/register", "/driver/register"]) {
      expect(redirectedTo(await run(p))).toBeNull();
    }
  });

  it("sends authenticated users away from /auth to their own dashboard", async () => {
    state.authUser = { id: "u1" };
    for (const role of ["admin", "merchant", "farmer", "driver", "user"]) {
      state.profileRole = role;
      expect(redirectedTo(await run("/auth"))).toBe(role === "user" ? "/user" : `/${role}`);
    }
  });

  it("ignores a forged user_metadata.role when redirecting away from /auth", async () => {
    state.authUser = { id: "u1", user_metadata: { role: "admin" } };
    state.profileRole = "user";
    expect(redirectedTo(await run("/auth"))).toBe("/user");
  });
});

// ---------------------------------------------------------------------------
// 3. resolveAdminAuth
// ---------------------------------------------------------------------------
describe("resolveAdminAuth", () => {
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const call = async (headers: Record<string, string> = {}) => {
    const { resolveAdminAuth } = await import("@/lib/admin/auth");
    return resolveAdminAuth(new NextRequest("http://localhost/api/admin/x", { headers }));
  };

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    state.authUser = null;
    state.profileRole = undefined;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it("returns 401 when there is no session (cookie flow)", async () => {
    expect(await call()).toMatchObject({ ok: false, status: 401 });
  });

  it("returns 401 for an invalid bearer token", async () => {
    expect(await call({ authorization: "Bearer bad" })).toMatchObject({ ok: false, status: 401 });
  });

  it("returns 500 when the service role key is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    state.authUser = { id: "u1" };
    expect(await call()).toMatchObject({ ok: false, status: 500 });
  });

  it("returns 403 for a forged user_metadata admin with no profile row", async () => {
    state.authUser = { id: "u1", user_metadata: { role: "admin" } };
    state.profileRole = undefined;
    expect(await call()).toMatchObject({ ok: false, status: 403 });
  });

  it("returns 403 for a forged user_metadata admin whose profile says user", async () => {
    state.authUser = { id: "u1", user_metadata: { role: "admin" } };
    state.profileRole = "user";
    expect(await call({ authorization: "Bearer t" })).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts a profile admin", async () => {
    state.authUser = { id: "admin-1" };
    state.profileRole = "admin";
    expect(await call()).toEqual({ ok: true, status: 200, userId: "admin-1" });
  });

  it("accepts an app_metadata admin when no profile row exists", async () => {
    state.authUser = { id: "admin-2", app_metadata: { role: "admin" } };
    state.profileRole = undefined;
    expect(await call()).toMatchObject({ ok: true, userId: "admin-2" });
  });

  it("lets the profile role win over app_metadata (demoted admin)", async () => {
    state.authUser = { id: "u1", app_metadata: { role: "admin" } };
    state.profileRole = "user";
    expect(await call()).toMatchObject({ ok: false, status: 403 });
  });
});

// ---------------------------------------------------------------------------
// 4. Static guard
// ---------------------------------------------------------------------------
describe("no authorization decision reads user_metadata.role", () => {
  const root = path.resolve(__dirname, "../..");
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (["node_modules", ".next", "coverage", "__tests__"].includes(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
    }
    return out;
  };

  it("finds no `user_metadata.role` read in app/, src/ or middleware.ts", () => {
    const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "src")), path.join(root, "middleware.ts")];
    const offenders = files.filter((f) => /user_metadata\??\.role\b/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
