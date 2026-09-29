/**
 * Security-hardening regression suite (single file).
 *
 *  1. Payment guards (pure functions)
 *  2. Middleware role resolution (user_metadata must never grant access)
 *  3. resolveAdminAuth (API-side admin check)
 *  4. Static guard: no authorization decision reads user_metadata.role
 *  5. SingPay edge handlers: initiation, callback, status sync
 *     (run against an in-memory fake of the Supabase client)
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
  // Edge side: injected by the fake-DB section
  edgeCreateClient: null as null | ((url: string, key: string, opts?: AnyRow) => unknown),
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
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: (url: string, key: string, opts?: AnyRow) => state.edgeCreateClient!(url, key, opts),
}));

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

// ---------------------------------------------------------------------------
// 5. SingPay edge handlers
// ---------------------------------------------------------------------------
class FakeDb {
  tables: Record<string, AnyRow[]> = {};
  unique: Record<string, string[][]> = {};
  seq = 0;
  // Simulates a concurrent writer: the first SELECT on these tables is blind
  // to rows that already exist (read happened before the other insert).
  blindFirstSelect = new Set<string>();

  rows(table: string) {
    return (this.tables[table] ??= []);
  }
  add(table: string, row: AnyRow) {
    const full = { id: row.id ?? `${table}-${++this.seq}`, created_at: new Date().toISOString(), ...row };
    this.rows(table).push(full);
    return full;
  }
}

class Query {
  private op: "select" | "insert" | "update" = "select";
  private payload: AnyRow = {};
  private filters: Array<(r: AnyRow) => boolean> = [];
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private max = Infinity;
  private cols = "*";

  constructor(private db: FakeDb, private table: string) {}

  select(cols = "*") {
    this.cols = cols;
    if (this.op === "select") this.op = "select";
    else this.returning = true;
    return this;
  }
  insert(p: AnyRow) { this.op = "insert"; this.payload = p; return this; }
  update(p: AnyRow) { this.op = "update"; this.payload = p; return this; }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
  in(k: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
  gte(k: string, v: string) { this.filters.push((r) => String(r[k]) >= v); return this; }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }

  private shape(rows: AnyRow[]) {
    const withJoin = rows.map((r) =>
      this.cols.includes("platform_payment_wallets")
        ? { ...r, platform_payment_wallets: this.db.rows("platform_payment_wallets").find((w) => w.id === r.platform_wallet_id) ?? null }
        : { ...r },
    );
    if (this.mode === "many") return { data: withJoin, error: null };
    if (withJoin.length === 0) {
      return this.mode === "single"
        ? { data: null, error: { code: "PGRST116", message: "no rows" } }
        : { data: null, error: null };
    }
    return { data: withJoin[0], error: null };
  }

  private exec() {
    const all = this.db.rows(this.table);
    if (this.op === "select") {
      if (this.db.blindFirstSelect.delete(this.table)) return this.shape([]);
      return this.shape(all.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max));
    }
    if (this.op === "insert") {
      for (const cols of this.db.unique[this.table] ?? []) {
        if (all.some((r) => cols.every((c) => r[c] === this.payload[c]))) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
      }
      const row = this.db.add(this.table, this.payload);
      return this.shape([row]);
    }
    const hit = all.filter((r) => this.filters.every((f) => f(r)));
    hit.forEach((r) => Object.assign(r, this.payload));
    return this.returning ? this.shape(hit) : { data: null, error: null };
  }

  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve().then(() => this.exec()).then(resolve, reject);
  }
}

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
  SINGPAY_CALLBACK_SECRET: "s3cret",
  SINGPAY_CLIENT_ID: "cid",
  SINGPAY_CLIENT_SECRET: "csecret",
  SINGPAY_PLATFORM_WALLET_ID: "wallet-1",
  SINGPAY_BASE_URL: "https://gateway.test/v1",
};

const USERS: Record<string, { id: string }> = { "tok-alice": { id: "alice" }, "tok-bob": { id: "bob" } };

describe("SingPay edge handlers", () => {
  let db: FakeDb;
  let fetchMock: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  // The edge module is Deno-typed and excluded from tsc (see tsconfig.json), so it
  // is loaded through a variable specifier and typed by hand.
  let singpay: {
    initiateSingPayPayment: (a: { req: Request; operator: "airtel" | "moov" }) => Promise<Response>;
    handleSingPayCallback: (req: Request) => Promise<Response>;
    syncSingPayTransactionStatus: (req: Request) => Promise<Response>;
  };

  const providerCalls = (needle: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes(needle));

  const seedOrder = (over: AnyRow = {}) =>
    db.add("orders", {
      id: "order-1",
      user_id: "alice",
      merchant_id: "m1",
      food_item_id: "f1",
      status: "pending",
      total_price: 5000,
      ...over,
    });

  const seedPayout = () =>
    db.add("merchant_payout_accounts", {
      merchant_id: "m1",
      provider: "singpay",
      operator: "airtel",
      verification_status: "verified",
      is_active: true,
      is_default: true,
      disbursement_id: "disb-1",
    });

  const seedPayment = (over: AnyRow = {}) => {
    const wallet = db.rows("platform_payment_wallets")[0] ?? db.add("platform_payment_wallets", { provider: "singpay", is_active: true, wallet_id: "wallet-1", client_id: "cid" });
    const legacy = db.add("transactions", { order_id: "order-1", status: "PENDING" });
    return db.add("payment_transactions", {
      order_id: "order-1",
      merchant_id: "m1",
      user_id: "alice",
      legacy_transaction_id: legacy.id,
      platform_wallet_id: wallet.id,
      provider: "singpay",
      internal_reference: "OYB-REF-1",
      status: "pending",
      amount: 5000,
      ...over,
    });
  };

  const callbackReq = (body: AnyRow, secret: string | null = "s3cret") =>
    new Request("https://x.test/payment-callback", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-singpay-secret": secret } : {}) },
      body: JSON.stringify(body),
    });

  const successBody = (over: AnyRow = {}) => ({
    reference: "OYB-REF-1",
    id: "prov-1",
    status: "Terminate",
    result: "Success",
    amount: 5000,
    ...over,
  });

  const payReq = (body: AnyRow, token: string | null = "tok-alice") =>
    new Request("https://x.test/initiate-airtel", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  const okProvider = () =>
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ id: "prov-1", status: "Start", success: true }), { status: 200 }),
    );

  beforeEach(async () => {
    db = new FakeDb();
    db.unique = {
      payment_settlements: [["payment_transaction_id", "recipient_type"]],
    };
    env = { ...ENV };
    (globalThis as AnyRow).Deno = { env: { get: (k: string) => env[k] } };
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    state.edgeCreateClient = (_url, key, opts) => {
      if (key === "anon") {
        const token = String(opts?.global?.headers?.Authorization ?? "").replace(/^Bearer /, "");
        return {
          auth: {
            getUser: async () =>
              USERS[token]
                ? { data: { user: USERS[token] }, error: null }
                : { data: { user: null }, error: { message: "bad token" } },
          },
        };
      }
      return { from: (t: string) => new Query(db, t) };
    };
    const edgeModule = "../../supabase/functions/_shared/singpay";
    singpay = await import(/* @vite-ignore */ edgeModule);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------ initiate
  describe("initiateSingPayPayment", () => {
    const init = (body: AnyRow = { orderId: "order-1", phone: "077123456" }, token: string | null = "tok-alice") =>
      singpay.initiateSingPayPayment({ req: payReq(body, token), operator: "airtel" });

    beforeEach(() => {
      seedOrder();
      seedPayout();
      okProvider();
    });

    it("rejects a request with no Authorization header", async () => {
      expect((await init(undefined, null)).status).toBe(401);
    });

    it("rejects an invalid token", async () => {
      expect((await init(undefined, "nope")).status).toBe(401);
    });

    it("rejects a missing orderId", async () => {
      const res = await init({ phone: "077123456" });
      expect(res.status).toBe(400);
    });

    it("rejects a phone number that does not match the operator prefix", async () => {
      const res = await init({ orderId: "order-1", phone: "066123456" });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PHONE_OPERATOR");
    });

    it("404s on an unknown order", async () => {
      expect((await init({ orderId: "ghost", phone: "077123456" })).status).toBe(404);
    });

    it("refuses to pay someone else's order", async () => {
      const res = await init(undefined, "tok-bob");
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses an order that is not awaiting payment", async () => {
      db.rows("orders")[0].status = "confirmed";
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("INVALID_ORDER_STATUS");
    });

    it("refuses when the merchant has no verified payout account", async () => {
      db.tables.merchant_payout_accounts = [];
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("MERCHANT_PAYOUT_NOT_VERIFIED");
    });

    it("creates the ledger rows and calls the provider once on the happy path", async () => {
      const res = await init();
      expect(res.status).toBe(200);
      expect(providerCalls("/74/paiement")).toHaveLength(1);
      expect(db.rows("transactions")).toHaveLength(1);
      expect(db.rows("payment_transactions")).toHaveLength(1);
      expect(db.rows("payment_transactions")[0]).toMatchObject({ amount: 5000, user_id: "alice", status: "pending" });
    });

    it("charges the server-side order total, not a client-supplied amount", async () => {
      await init({ orderId: "order-1", phone: "077123456", amount: 1 });
      expect(db.rows("payment_transactions")[0].amount).toBe(5000);
      const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(sent.amount).toBe(5000);
    });

    it("refuses a second attempt while the first is still awaiting confirmation", async () => {
      expect((await init()).status).toBe(200);
      const second = await init();
      expect(second.status).toBe(409);
      expect((await second.json()).error.code).toBe("PAYMENT_IN_PROGRESS");
      expect(providerCalls("/74/paiement")).toHaveLength(1);
      expect(db.rows("payment_transactions")).toHaveLength(1);
    });

    it("blocks a double click fired concurrently", async () => {
      const [a, b] = await Promise.all([init(), init()]);
      const statuses = [a.status, b.status].sort();
      // Both requests read before either wrote in this fake, so at most one
      // may be rejected here; the sequential test above is the strict contract.
      expect(statuses[0]).toBe(200);
      expect(providerCalls("/74/paiement").length).toBeLessThanOrEqual(2);
    });

    it("allows a new attempt once the previous one is older than the window", async () => {
      expect((await init()).status).toBe(200);
      db.rows("payment_transactions")[0].created_at = new Date(Date.now() - 10 * 60_000).toISOString();
      expect((await init()).status).toBe(200);
      expect(db.rows("payment_transactions")).toHaveLength(2);
    });

    it("allows a retry after the previous attempt failed", async () => {
      expect((await init()).status).toBe(200);
      db.rows("payment_transactions")[0].status = "failed";
      expect((await init()).status).toBe(200);
    });

    it("only considers in-flight attempts of the same order", async () => {
      db.add("payment_transactions", { order_id: "other-order", status: "pending" });
      expect((await init()).status).toBe(200);
    });

    it("marks the attempt failed when the provider rejects it", async () => {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status: 400 }));
      const res = await init();
      expect(res.status).toBe(400);
      expect(db.rows("payment_transactions")[0].status).toBe("failed");
    });
  });

  // ------------------------------------------------------------------ callback
  describe("handleSingPayCallback", () => {
    beforeEach(() => {
      seedOrder();
      seedPayout();
      seedPayment();
    });

    const order = () => db.rows("orders")[0];
    const payment = () => db.rows("payment_transactions")[0];
    const legacy = () => db.rows("transactions")[0];

    describe("authentication & lookup", () => {
      it("rejects a callback without the shared secret", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq(successBody(), null));
        expect(res.status).toBe(401);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
      });

      it("rejects a callback with the wrong secret", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq(successBody(), "wrong"));
        expect(res.status).toBe(401);
        expect(order().status).toBe("pending");
      });

      it("accepts the secret via Authorization: Bearer", async () => {
        const req = new Request("https://x.test/cb", {
          method: "POST",
          headers: { authorization: "Bearer s3cret", "content-type": "application/json" },
          body: JSON.stringify(successBody()),
        });
        expect((await singpay.handleSingPayCallback(req)).status).toBe(200);
      });

      it("fails closed when no secret is configured on a real project", async () => {
        delete env.SINGPAY_CALLBACK_SECRET;
        const res = await singpay.handleSingPayCallback(callbackReq(successBody(), null));
        expect(res.status).toBe(401);
      });

      it("ignores ALLOW_INSECURE_WEBHOOKS against a non-local project", async () => {
        delete env.SINGPAY_CALLBACK_SECRET;
        env.ALLOW_INSECURE_WEBHOOKS = "true";
        const res = await singpay.handleSingPayCallback(callbackReq(successBody(), null));
        expect(res.status).toBe(401);
      });

      it("400s when neither a reference nor a transaction id is present", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq({ status: "Terminate", result: "Success" }));
        expect(res.status).toBe(400);
      });

      it("404s for an unknown reference", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq(successBody({ reference: "NOPE" })));
        expect(res.status).toBe(404);
      });

      it("can locate the payment by provider transaction id", async () => {
        payment().provider_transaction_id = "prov-9";
        const res = await singpay.handleSingPayCallback(
          callbackReq({ id: "prov-9", status: "Terminate", result: "Success", amount: 5000 }),
        );
        expect(res.status).toBe(200);
        expect(payment().status).toBe("confirmed");
      });
    });

    describe("confirmation", () => {
      it("confirms the payment, the legacy transaction and the order", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(res.status).toBe(200);
        expect(payment()).toMatchObject({ status: "confirmed", provider_transaction_id: "prov-1" });
        expect(payment().confirmed_at).toBeTruthy();
        expect(legacy()).toMatchObject({ status: "SUCCESS" });
        expect(order().status).toBe("confirmed");
      });

      it("creates a 'ready' settlement with a 10% commission", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        const settlements = db.rows("payment_settlements");
        expect(settlements).toHaveLength(1);
        expect(settlements[0]).toMatchObject({
          status: "ready",
          gross_amount: 5000,
          fee_amount: 500,
          net_amount: 4500,
          disbursement_id: "disb-1",
        });
      });

      it("routes the settlement to manual review when the merchant has no payout account", async () => {
        db.tables.merchant_payout_accounts = [];
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(db.rows("payment_settlements")[0].status).toBe("manual_review");
      });

      it("does not send any transfer while transfers are disabled", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(providerCalls("/transfer")).toHaveLength(0);
      });

      it("accepts a callback that carries no amount", async () => {
        const body = successBody();
        delete (body as AnyRow).amount;
        expect((await singpay.handleSingPayCallback(callbackReq(body))).status).toBe(200);
        expect(payment().status).toBe("confirmed");
      });

      it("keeps a pending callback pending and does not touch the order", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq({ reference: "OYB-REF-1", status: "Start" }));
        expect(res.status).toBe(200);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });

      it("marks a failed payment as failed and leaves the order pending", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody({ result: "BalanceError" })));
        expect(payment().status).toBe("failed");
        expect(legacy().status).toBe("FAILED");
        expect(order().status).toBe("pending");
      });
    });

    describe("amount verification", () => {
      it("rejects a confirmation whose amount differs and changes nothing", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq(successBody({ amount: 50 })));
        expect(res.status).toBe(409);
        expect(payment().status).toBe("pending");
        expect(legacy().status).toBe("PENDING");
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });

      it("does not apply the amount check to non-confirming callbacks", async () => {
        const res = await singpay.handleSingPayCallback(callbackReq(successBody({ result: "Error", amount: 1 })));
        expect(res.status).toBe(200);
        expect(payment().status).toBe("failed");
      });
    });

    describe("out-of-order and replayed callbacks", () => {
      it("ignores a late failure after confirmation", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        const res = await singpay.handleSingPayCallback(callbackReq(successBody({ result: "Error" })));
        expect(res.status).toBe(200);
        expect(payment().status).toBe("confirmed");
        expect(legacy().status).toBe("SUCCESS");
        expect(order().status).toBe("confirmed");
      });

      it("ignores a late timeout after confirmation", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        await singpay.handleSingPayCallback(callbackReq(successBody({ result: "TimeOutError" })));
        expect(payment().status).toBe("confirmed");
      });

      it("ignores a late 'pending' update after confirmation", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        await singpay.handleSingPayCallback(callbackReq({ reference: "OYB-REF-1", status: "Start" }));
        expect(payment().status).toBe("confirmed");
      });

      it("does not resurrect a failed payment", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody({ result: "Error" })));
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(payment().status).toBe("failed");
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });

      it("is idempotent when the same confirmation is replayed", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        const confirmedAt = order().confirmed_at;
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(db.rows("payment_settlements")).toHaveLength(1);
        expect(order().confirmed_at).toBe(confirmedAt);
      });

      it("accepts a refund after confirmation", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        await singpay.handleSingPayCallback(callbackReq({ reference: "OYB-REF-1", status: "Refund" }));
        expect(payment().status).toBe("refunded");
        expect(legacy().status).toBe("REFUNDED");
      });

      it("never rewrites an order that already left 'pending'", async () => {
        order().status = "cancelled";
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(order().status).toBe("cancelled");
      });
    });

    describe("settlement transfer", () => {
      beforeEach(() => {
        env.SINGPAY_TRANSFERS_ENABLED = "true";
        fetchMock.mockImplementation(
          async () => new Response(JSON.stringify({ success: true, reference: "TR-1" }), { status: 200 }),
        );
      });

      it("sends exactly one transfer of the net amount and marks the settlement paid", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        const transfers = providerCalls("/transfer");
        expect(transfers).toHaveLength(1);
        expect(JSON.parse(String(transfers[0][1].body))).toMatchObject({
          amount: 4500,
          disbursement: "disb-1",
          reference: "OYB-REF-1",
        });
        expect(db.rows("payment_settlements")[0]).toMatchObject({ status: "paid", provider_transfer_reference: "TR-1" });
        expect(legacy().settlement_status).toBe("paid");
      });

      it("does not transfer again when the confirmation is replayed", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(providerCalls("/transfer")).toHaveLength(1);
      });

      it("sends one transfer when two identical callbacks race", async () => {
        const [a, b] = await Promise.all([
          singpay.handleSingPayCallback(callbackReq(successBody())),
          singpay.handleSingPayCallback(callbackReq(successBody())),
        ]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(providerCalls("/transfer")).toHaveLength(1);
        expect(db.rows("payment_settlements")).toHaveLength(1);
      });

      it("recovers from a lost race on the settlement insert (unique violation)", async () => {
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        // Another writer's row exists but this reader's first SELECT missed it.
        db.blindFirstSelect.add("payment_settlements");
        payment().status = "pending";
        const res = await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(res.status).toBe(200);
        expect(db.rows("payment_settlements")).toHaveLength(1);
      });

      it("marks the settlement failed when the transfer is rejected, without retrying", async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status: 400 }));
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(db.rows("payment_settlements")[0].status).toBe("failed");
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(providerCalls("/transfer")).toHaveLength(1);
      });

      it("does not transfer for a settlement that needs manual review", async () => {
        db.tables.merchant_payout_accounts = [];
        await singpay.handleSingPayCallback(callbackReq(successBody()));
        expect(providerCalls("/transfer")).toHaveLength(0);
        expect(db.rows("payment_settlements")[0].status).toBe("manual_review");
      });
    });
  });

  // ---------------------------------------------------------------------- sync
  describe("syncSingPayTransactionStatus", () => {
    const sync = (body: AnyRow = { reference: "OYB-REF-1" }, token: string | null = "tok-alice") =>
      singpay.syncSingPayTransactionStatus(
        new Request("https://x.test/sync", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body),
        }),
      );

    const provider = (over: AnyRow = {}) =>
      fetchMock.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ id: "prov-1", reference: "OYB-REF-1", status: "Terminate", result: "Success", amount: 5000, ...over }),
            { status: 200 },
          ),
      );

    beforeEach(() => {
      seedOrder();
      seedPayout();
      seedPayment();
      provider();
    });

    it("requires authentication", async () => {
      expect((await sync(undefined, null)).status).toBe(401);
      expect((await sync(undefined, "nope")).status).toBe(401);
    });

    it("requires a reference or a transaction id", async () => {
      expect((await sync({})).status).toBe(400);
    });

    it("404s for an unknown reference", async () => {
      expect((await sync({ reference: "NOPE" })).status).toBe(404);
    });

    it("forbids reading someone else's payment", async () => {
      const res = await sync(undefined, "tok-bob");
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("confirms the payment and the order when the provider reports success", async () => {
      const res = await sync();
      expect(res.status).toBe(200);
      expect(db.rows("payment_transactions")[0].status).toBe("confirmed");
      expect(db.rows("orders")[0].status).toBe("confirmed");
      expect(db.rows("payment_settlements")).toHaveLength(1);
    });

    it("rejects a provider amount that differs from the order", async () => {
      provider({ amount: 10 });
      const res = await sync();
      expect(res.status).toBe(409);
      expect(db.rows("payment_transactions")[0].status).toBe("pending");
      expect(db.rows("orders")[0].status).toBe("pending");
    });

    it("does not downgrade a confirmed payment when the provider later reports a failure", async () => {
      await sync();
      provider({ result: "Error" });
      const res = await sync();
      expect(res.status).toBe(200);
      expect(db.rows("payment_transactions")[0].status).toBe("confirmed");
      expect(db.rows("transactions")[0].status).toBe("SUCCESS");
    });

    it("502s when the provider lookup fails", async () => {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status: 500 }));
      expect((await sync()).status).toBe(502);
    });
  });
});
