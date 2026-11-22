/**
 * PVIT edge handlers: split-payment initiation, webhook, status sync and
 * payout-number verification, run against an in-memory fake of the Supabase
 * client and a routed fake of the PVIT HTTP API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FEE_RATES, makeFakeRpc, type FeeRates } from "./helpers/supabase-edge-fake";

type AnyRow = Record<string, any>;

const state = vi.hoisted(() => ({
  edgeCreateClient: null as null | ((url: string, key: string, opts?: AnyRow) => unknown),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: (url: string, key: string, opts?: AnyRow) => state.edgeCreateClient!(url, key, opts),
}));

// ---------------------------------------------------------------------------
// In-memory Supabase fake
// ---------------------------------------------------------------------------
class FakeDb {
  tables: Record<string, AnyRow[]> = {};
  unique: Record<string, string[][]> = {};
  failWrites = new Set<string>(); // tables whose writes fail
  seq = 0;

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
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: AnyRow = {};
  private conflict = "";
  private filters: Array<(r: AnyRow) => boolean> = [];
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private max = Infinity;
  private cols = "*";

  constructor(private db: FakeDb, private table: string) {}

  select(cols = "*") {
    this.cols = cols;
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(p: AnyRow) { this.op = "insert"; this.payload = p; return this; }
  update(p: AnyRow) { this.op = "update"; this.payload = p; return this; }
  upsert(p: AnyRow, o: { onConflict?: string } = {}) { this.op = "upsert"; this.payload = p; this.conflict = o.onConflict ?? ""; return this; }
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
    if (this.op !== "select" && this.db.failWrites.has(this.table)) {
      return { data: null, error: { code: "XX000", message: `write to ${this.table} failed` } };
    }
    if (this.op === "select") {
      return this.shape(all.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max));
    }
    if (this.op === "upsert") {
      const keys = this.conflict.split(",").filter(Boolean);
      const hit = all.find((r) => keys.every((k) => r[k] === this.payload[k]));
      if (hit) Object.assign(hit, this.payload);
      else this.db.add(this.table, this.payload);
      return { data: null, error: null };
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

// ---------------------------------------------------------------------------
const ENV: Record<string, string> = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_ANON_KEY: "anon",
  PVIT_BASE_URL: "https://pvit.test",
  PVIT_OPERATION_ACCOUNT_CODE: "ACC_OP",
  PVIT_SECRET_PASSWORD: "pw",
  PVIT_CODE_URL_SECRET: "SEC",
  PVIT_CODE_URL_PAYMENT: "PAY",
  PVIT_CODE_URL_STATUS: "STA",
  PVIT_CODE_URL_KYC: "KYC",
  PVIT_CALLBACK_URL_CODE: "CB1",
  PVIT_CALLBACK_IP_MODE: "off",
  PVIT_CALLBACK_ALLOWED_IPS: "176.31.65.18,176.31.65.20,176.31.65.21,13.59.249.167",
  // PLATFORM_COMMISSION_RATE is obsolete: rates are admin settings in the database.
};

const USERS: Record<string, { id: string }> = {
  "tok-alice": { id: "alice" },
  "tok-bob": { id: "bob" },
  "tok-shop": { id: "shop-owner" },
  "tok-admin": { id: "admin-1" },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("PVIT edge handlers", () => {
  let db: FakeDb;
  let fetchMock: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let feeRates: FeeRates;
  let route: { rest: () => Response; status: (transactionId: string) => Response; kyc: () => Response };

  let pvit: {
    initiatePvitPayment: (a: { req: Request }) => Promise<Response>;
    handlePvitCallback: (req: Request) => Promise<Response>;
    syncPvitTransactionStatus: (req: Request) => Promise<Response>;
    verifyPayoutAccount: (req: Request) => Promise<Response>;
  };

  const calls = (needle: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(needle));

  const seedOrder = (over: AnyRow = {}) =>
    db.add("orders", { id: "order-1", user_id: "alice", merchant_id: "m1", food_item_id: "f1", status: "pending", total_price: 5000, ...over });

  const seedPayout = (over: AnyRow = {}) =>
    db.add("merchant_payout_accounts", {
      id: "pa-1", merchant_id: "m1", provider: "pvit", operator: "airtel", normalized_msisdn: "074111111",
      verification_status: "verified", is_active: true, is_default: true, ...over,
    });

  const seedPayment = (over: AnyRow = {}) => {
    const wallet = db.rows("platform_payment_wallets")[0] ?? db.add("platform_payment_wallets", { provider: "pvit", is_active: true, wallet_id: "ACC_OP" });
    const legacy = db.add("transactions", { order_id: "order-1", status: "PENDING" });
    return db.add("payment_transactions", {
      order_id: "order-1", merchant_id: "m1", user_id: "alice", legacy_transaction_id: legacy.id,
      platform_wallet_id: wallet.id, provider: "pvit", operator: "airtel", internal_reference: "OYBREF1",
      provider_transaction_id: "PAY-1", status: "pending", amount: 5000,
      raw_request: { ouyaboung: { payoutAccountId: "pa-1", beneficiaryCode: "BENPA1", feeAmount: 500, merchantNetAmount: 4500 } },
      ...over,
    });
  };

  const authedReq = (path: string, body: AnyRow | undefined, token: string | null = "tok-alice") =>
    new Request(`https://x.test/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });

  const cbReq = (body: AnyRow, ip: string | null = "176.31.65.18") =>
    new Request("https://x.test/pvit-callback", {
      method: "POST",
      headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
      body: JSON.stringify(body),
    });

  const cbBody = (over: AnyRow = {}) => ({
    transactionId: "PAY-1", merchantReferenceId: "OYBREF1", status: "SUCCESS", amount: 5000, code: 200,
    transactionOperation: "PAYMENT", ...over,
  });

  const order = () => db.rows("orders")[0];
  const payment = () => db.rows("payment_transactions")[0];
  const legacy = () => db.rows("transactions")[0];

  beforeEach(async () => {
    db = new FakeDb();
    db.unique = { payment_settlements: [["payment_transaction_id", "recipient_type"]] };
    env = { ...ENV };
    feeRates = { ...DEFAULT_FEE_RATES };
    (globalThis as AnyRow).Deno = { env: { get: (k: string) => env[k] } };

    route = {
      rest: () => json({ status: "PENDING", status_code: "200", operator: "AIRTEL_MONEY", reference_id: "PAY-1", message: "ok" }),
      // Like the real API: a transaction is found by OUR merchant reference only.
      status: (id) =>
        id === "OYBREF1"
          ? json({ status: "SUCCESS", amount: 5000, merchant_reference_id: "OYBREF1" })
          : json({ status_code: 4006, error: "TRANSACTION_NOT_FOUND" }, 404),
      kyc: () => json({ data: { firstname: "John" } }),
    };
    fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/renew-secret")) return json({ secret: "sk_test", expires_in: 3600 });
      if (u.includes("/rest")) return route.rest();
      if (u.includes("/status")) return route.status(new URL(u).searchParams.get("transactionId") ?? "");
      if (u.includes("/kyc")) return route.kyc();
      return json({}, 404);
    });
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
      return { from: (t: string) => new Query(db, t), rpc: makeFakeRpc(() => feeRates) };
    };

    db.add("merchants", { id: "m1", user_id: "shop-owner" });
    db.add("profiles", { user_id: "admin-1", role: "admin" });

    const edgeModule = "../../supabase/functions/_shared/pvit";
    pvit = await import(/* @vite-ignore */ edgeModule);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------ initiate
  describe("initiatePvitPayment", () => {
    const init = (body: AnyRow = { orderId: "order-1", phone: "077123456" }, token: string | null = "tok-alice") =>
      pvit.initiatePvitPayment({ req: authedReq("initiate-payment", body, token) });

    beforeEach(() => {
      seedOrder();
      seedPayout();
    });

    it("rejects a request with no Authorization header or an invalid token", async () => {
      expect((await init(undefined, null)).status).toBe(401);
      expect((await init(undefined, "nope")).status).toBe(401);
    });

    it("rejects a missing orderId, an invalid number and an operator/prefix mismatch", async () => {
      expect((await init({ phone: "077123456" })).status).toBe(400);
      expect((await init({ orderId: "order-1", phone: "123" })).status).toBe(400);
      const mismatch = await init({ orderId: "order-1", phone: "077123456", operator: "moov" });
      expect(mismatch.status).toBe(400);
      expect((await mismatch.json()).error.code).toBe("INVALID_PHONE_OPERATOR");
    });

    it("answers 503 while the provider is not configured", async () => {
      delete env.PVIT_SECRET_PASSWORD;
      const res = await init();
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("PAYMENT_NOT_CONFIGURED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["PVIT_BASE_URL", undefined],
      ["PVIT_OPERATION_ACCOUNT_CODE", undefined],
    ])("answers 503 when %s is missing or invalid (%s): no hidden default", async (key, value) => {
      if (value === undefined) delete env[key];
      else env[key] = value;
      const res = await init();
      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("calls PVIT on the configured base URL", async () => {
      env.PVIT_BASE_URL = "https://pvit.example.org/";
      await init();
      expect(String(calls("/rest")[0][0])).toBe("https://pvit.example.org/v2/PAY/rest");
      expect(String(calls("/renew-secret")[0][0])).toBe("https://pvit.example.org/v2/SEC/renew-secret");
    });

    it("404s on an unknown order and 403s on someone else's order", async () => {
      expect((await init({ orderId: "nope", phone: "077123456" })).status).toBe(404);
      expect((await init(undefined, "tok-bob")).status).toBe(403);
    });

    it("refuses an order that is not awaiting payment", async () => {
      order().status = "confirmed";
      expect((await init()).status).toBe(409);
    });

    it("refuses when the shop has no verified payout account", async () => {
      db.tables.merchant_payout_accounts = [];
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("MERCHANT_PAYOUT_NOT_VERIFIED");
      expect(calls("/rest")).toHaveLength(0);
    });

    it("ignores unverified, inactive and legacy-provider payout accounts", async () => {
      db.tables.merchant_payout_accounts = [];
      seedPayout({ id: "a", verification_status: "pending" });
      seedPayout({ id: "b", is_active: false });
      seedPayout({ id: "c", provider: "singpay" });
      expect((await init()).status).toBe(409);
    });

    it("sends one split payment charging the server-side order total", async () => {
      const res = await init({ orderId: "order-1", phone: "077123456", amount: 1, total_price: 1 });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      const rest = calls("/rest");
      expect(rest).toHaveLength(1);
      expect(String(rest[0][0])).toBe("https://pvit.test/v2/PAY/rest");
      expect(rest[0][1].headers["X-Secret"]).toBe("sk_test");

      const sent = JSON.parse(String(rest[0][1].body));
      expect(sent).toMatchObject({
        // 5000 price + 500 commission + 138 PVIT + 55 Airtel, all paid by the customer.
        amount: 5693,
        service: "RESTFUL",
        transaction_type: "PAYMENT",
        operator_code: "AIRTEL_MONEY",
        customer_account_number: "077123456",
        merchant_operation_account_code: "ACC_OP",
        callback_url_code: "CB1",
        sharing_type: "FIXED",
        owner_charge: "MERCHANT",
      });
      expect(sent.reference).toMatch(/^[A-Z0-9]{1,20}$/);
      expect(sent.beneficiaries).toEqual([
        {
          destination: { kind: "MOBILE_MONEY", operator_code: "AIRTEL_MONEY", msisdn: "074111111", msisdn_type: "MERCHANT" },
          // The shop receives its price IN FULL: no commission is taken from it.
          value: 5000,
          beneficiary_code: expect.stringMatching(/^BEN[A-Z0-9]+$/),
        },
      ]);
    });

    it("creates the ledger rows as pending and never confirms from the initiation answer", async () => {
      route.rest = () => json({ status: "SUCCESS", status_code: "200", reference_id: "PAY-9" });
      await init();
      expect(payment()).toMatchObject({ provider: "pvit", status: "pending", amount: 5693, provider_transaction_id: "PAY-9", operator: "airtel" });
      expect(payment().raw_request.ouyaboung).toMatchObject({ payoutAccountId: "pa-1", feeAmount: 693, merchantNetAmount: 5000 });
      expect(payment().fee_breakdown).toMatchObject({ platform_fee: 500, pvit_fee: 138, operator_fee: 55, total_amount: 5693, recipient_amount: 5000 });
      expect(legacy()).toMatchObject({ status: "PENDING", provider: "pvit", payment_transaction_id: payment().id });
      expect(order().status).toBe("pending");
    });

    it("applies the admin's current rates (order commission 20 %): the customer pays more, the shop still gets its price", async () => {
      feeRates.order = 0.2;
      env.PVIT_OWNER_CHARGE = "CUSTOMER";
      await init();
      const sent = JSON.parse(String(calls("/rest")[0][1].body));
      // 5000 + 1000 + ceil(6000 x 2.5 %) 150 + ceil(6000 x 1 %) 60
      expect(sent.amount).toBe(6210);
      expect(sent.beneficiaries[0].value).toBe(5000);
      expect(sent.owner_charge).toBe("CUSTOMER");
    });

    it("charges the Moov rate to a Moov payer", async () => {
      feeRates.moov = 0.02;
      await init({ orderId: "order-1", phone: "062123456", operator: "moov" });
      const sent = JSON.parse(String(calls("/rest")[0][1].body));
      // 5000 + 500 + 138 + ceil(5500 x 2 %) 110
      expect(sent.amount).toBe(5748);
      expect(payment().fee_breakdown).toMatchObject({ operator: "moov", operator_fee: 110 });
    });

    it("stores the detail of the fees on the legacy transaction the customer sees", async () => {
      await init();
      expect(legacy()).toMatchObject({ amount: 5000, app_fees: 500, pvit_fees: 138, airtel_fees: 55, total_amount: 5693 });
    });

    it("answers the customer with the full breakdown", async () => {
      const body = await (await init()).json();
      expect(body.data.totalAmount).toBe(5693);
      expect(body.data.fees).toEqual({ airtel: 55, pvit: 138, app: 500, total: 693 });
      expect(body.data.breakdown).toMatchObject({ recipient_amount: 5000, fees_estimated: true });
    });

    it("never calls PVIT when the fee calculation is refused or unavailable", async () => {
      state.edgeCreateClient = ((previous) => (url: string, key: string, opts?: AnyRow) => {
        const client = previous(url, key, opts) as AnyRow;
        return key === "anon" ? client : { ...client, rpc: async () => ({ data: null, error: { message: "db down" } }) };
      })(state.edgeCreateClient!);
      expect((await init()).status).toBe(500);
      expect(calls("/rest")).toHaveLength(0);
      expect(db.rows("payment_transactions")).toHaveLength(0);
    });

    it("renews the secret once and reuses it from the shared cache", async () => {
      seedOrder({ id: "order-2" });
      await init();
      await init({ orderId: "order-2", phone: "077123456" });
      expect(calls("/renew-secret")).toHaveLength(1);
      expect(calls("/rest")).toHaveLength(2);
    });

    it("renews an expired cached secret", async () => {
      db.add("payment_provider_secrets", { provider: "pvit", account_code: "ACC_OP", secret: "old", expires_at: new Date(Date.now() + 10_000).toISOString() });
      await init();
      expect(calls("/renew-secret")).toHaveLength(1);
      expect(calls("/rest")[0][1].headers["X-Secret"]).toBe("sk_test");
    });

    it("retries once with a fresh secret when PVIT rejects the secret (3100)", async () => {
      let n = 0;
      route.rest = () => (n++ === 0 ? json({ status_code: 3100, error: "AUTHENTICATION_FAILED" }, 403) : json({ status: "PENDING", reference_id: "PAY-1" }));
      const res = await init();
      expect(res.status).toBe(200);
      expect(calls("/rest")).toHaveLength(2);
      expect(calls("/renew-secret")).toHaveLength(2);
    });

    it("refuses a second attempt while the first awaits confirmation", async () => {
      expect((await init()).status).toBe(200);
      const second = await init();
      expect(second.status).toBe(409);
      expect((await second.json()).error.code).toBe("PAYMENT_IN_PROGRESS");
      expect(calls("/rest")).toHaveLength(1);
    });

    it("allows a retry after a failure or once the previous attempt is stale", async () => {
      seedPayment({ status: "failed" });
      expect((await init()).status).toBe(200);
      db.tables.payment_transactions = [];
      seedPayment({ status: "pending", created_at: new Date(Date.now() - 6 * 60_000).toISOString() });
      expect((await init()).status).toBe(200);
    });

    it("rate-limits a user across orders", async () => {
      for (let i = 0; i < 5; i++) seedPayment({ id: `p${i}`, order_id: `other-${i}`, status: "failed", internal_reference: `R${i}` });
      const res = await init();
      expect(res.status).toBe(429);
      expect((await res.json()).error.code).toBe("TOO_MANY_ATTEMPTS");
      expect(calls("/rest")).toHaveLength(0);
    });

    it("takes the attempt limit and windows from the environment", async () => {
      env.PAYMENT_MAX_INITIATIONS_PER_WINDOW = "2";
      for (let i = 0; i < 2; i++) seedPayment({ id: `p${i}`, order_id: `other-${i}`, status: "failed", internal_reference: `R${i}` });
      expect((await init()).status).toBe(429);
    });

    it("ignores attempts older than the configured window", async () => {
      env.PAYMENT_INITIATION_WINDOW_MINUTES = "1";
      for (let i = 0; i < 5; i++) {
        seedPayment({ id: `p${i}`, order_id: `other-${i}`, status: "failed", internal_reference: `R${i}`, created_at: new Date(Date.now() - 2 * 60_000).toISOString() });
      }
      expect((await init()).status).toBe(200);
    });

    it("takes the in-flight window from the environment", async () => {
      env.PAYMENT_IN_FLIGHT_WINDOW_MINUTES = "1";
      seedPayment({ status: "pending", created_at: new Date(Date.now() - 2 * 60_000).toISOString() });
      expect((await init()).status).toBe(200);
    });

    describe("CORS", () => {
      const withOrigin = (origin: string) =>
        pvit.initiatePvitPayment({
          req: new Request("https://x.test/initiate-payment", {
            method: "POST",
            headers: { "content-type": "application/json", origin, Authorization: "Bearer tok-alice" },
            body: JSON.stringify({ orderId: "order-1", phone: "077123456" }),
          }),
        });

      it("reflects an origin listed in ALLOWED_ORIGINS", async () => {
        env.ALLOWED_ORIGINS = "https://app.example.com, https://admin.example.com";
        const res = await withOrigin("https://app.example.com");
        expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
        expect(res.headers.get("vary")).toBe("Origin");
      });

      it("sends no allow-origin header to an unlisted origin", async () => {
        env.ALLOWED_ORIGINS = "https://app.example.com";
        const res = await withOrigin("https://evil.example.com");
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
      });

      it("allows any origin only when ALLOWED_ORIGINS is unset", async () => {
        const res = await withOrigin("https://anything.test");
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
      });

      it("answers the preflight with the same rule", async () => {
        env.ALLOWED_ORIGINS = "https://app.example.com";
        const ok = await pvit.initiatePvitPayment({
          req: new Request("https://x.test/initiate-payment", { method: "OPTIONS", headers: { origin: "https://app.example.com" } }),
        });
        expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
        const denied = await pvit.initiatePvitPayment({
          req: new Request("https://x.test/initiate-payment", { method: "OPTIONS", headers: { origin: "https://evil.example.com" } }),
        });
        expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      });

      it("adds no CORS header to the server-to-server webhook", async () => {
        seedPayment();
        const res = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
      });
    });

    it("does not rate-limit on other users' attempts", async () => {
      for (let i = 0; i < 5; i++) seedPayment({ id: `p${i}`, user_id: "bob", order_id: `o${i}`, status: "failed", internal_reference: `R${i}` });
      expect((await init()).status).toBe(200);
    });

    it("marks the payment failed and reports the provider code when PVIT rejects it", async () => {
      route.rest = () => json({ status_code: 3018, error: "TRANSACTION_AMOUNT_TOO_LOW", message: "amount too low" }, 403);
      const res = await init();
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatchObject({ code: "PROVIDER_REJECTED", providerCode: 3018 });
      expect(payment().status).toBe("failed");
      expect(legacy().status).toBe("FAILED");
    });

    it("keeps the payment pending when PVIT cannot be reached (outcome unknown)", async () => {
      route.rest = () => { throw new Error("network down"); };
      const res = await init();
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(payment().status).toBe("pending");
    });

    it("answers 500 when the ledger cannot be written", async () => {
      db.failWrites.add("payment_transactions");
      expect((await init()).status).toBe(500);
      expect(calls("/rest")).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------ callback
  describe("handlePvitCallback", () => {
    beforeEach(() => {
      seedOrder();
      seedPayout();
      seedPayment();
    });

    describe("source and payload", () => {
      it("enforces the PVIT IP allowlist when asked to", async () => {
        env.PVIT_CALLBACK_IP_MODE = "enforce";
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "203.0.113.9"))).status).toBe(403);
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), null))).status).toBe(403);
        expect(order().status).toBe("pending");
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "176.31.65.20"))).status).toBe(200);
      });

      it("does not trust a PVIT address injected earlier in X-Forwarded-For", async () => {
        env.PVIT_CALLBACK_IP_MODE = "enforce";
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "176.31.65.18, 203.0.113.9"))).status).toBe(403);
      });

      it("fails closed when enforcing without any configured address", async () => {
        env.PVIT_CALLBACK_IP_MODE = "enforce";
        env.PVIT_CALLBACK_ALLOWED_IPS = "";
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "176.31.65.18"))).status).toBe(403);
        expect(order().status).toBe("pending");
      });

      it("takes the allowed addresses from PVIT_CALLBACK_ALLOWED_IPS only (nothing hard-coded)", async () => {
        env.PVIT_CALLBACK_IP_MODE = "enforce";
        env.PVIT_CALLBACK_ALLOWED_IPS = "203.0.113.9";
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "176.31.65.18"))).status).toBe(403);
      });

      it("only warns in report mode (default) and accepts a custom allowlist", async () => {
        env.PVIT_CALLBACK_IP_MODE = "report";
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "203.0.113.9"))).status).toBe(200);
        env.PVIT_CALLBACK_IP_MODE = "enforce";
        env.PVIT_CALLBACK_ALLOWED_IPS = "203.0.113.9";
        expect((await pvit.handlePvitCallback(cbReq(cbBody(), "203.0.113.9"))).status).toBe(200);
      });

      it("rejects non-POST, malformed payloads and unknown references", async () => {
        expect((await pvit.handlePvitCallback(new Request("https://x.test/cb", { method: "GET" }))).status).toBe(405);
        expect((await pvit.handlePvitCallback(cbReq({ foo: "bar" }))).status).toBe(400);
        expect((await pvit.handlePvitCallback(cbReq(cbBody({ merchantReferenceId: "NOPE" })))).status).toBe(404);
      });

      it("rejects a callback whose transaction id differs from the stored one", async () => {
        const res = await pvit.handlePvitCallback(cbReq(cbBody({ transactionId: "PAY-OTHER" })));
        expect(res.status).toBe(409);
        expect(payment().status).toBe("pending");
      });

      it("records the PVIT id when the initiation answer was lost", async () => {
        payment().provider_transaction_id = null;
        const res = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(res.status).toBe(200);
        expect(payment().provider_transaction_id).toBe("PAY-1");
        expect(payment().status).toBe("confirmed");
      });

      it("only acknowledges refund notifications", async () => {
        const res = await pvit.handlePvitCallback(cbReq(cbBody({ transactionOperation: "GIVE_CHANGE" })));
        expect(res.status).toBe(200);
        expect(calls("/status")).toHaveLength(0);
        expect(payment().status).toBe("pending");
      });
    });

    describe("confirmation", () => {
      it("confirms the payment, the legacy row and the order, then echoes the ack", async () => {
        const res = await pvit.handlePvitCallback(cbReq(cbBody({ code: 200 })));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ transactionId: "PAY-1", responseCode: 200 });
        expect(payment()).toMatchObject({ status: "confirmed", provider_status: "SUCCESS" });
        expect(payment().confirmed_at).toBeTruthy();
        expect(legacy()).toMatchObject({ status: "SUCCESS", settlement_status: "paid" });
        expect(order().status).toBe("confirmed");
      });

      it("echoes the code it received, whatever it is", async () => {
        const res = await pvit.handlePvitCallback(cbReq(cbBody({ code: 201 })));
        expect(await res.json()).toEqual({ transactionId: "PAY-1", responseCode: 201 });
      });

      it("verifies the status with PVIT's API using our secret and the operation account", async () => {
        await pvit.handlePvitCallback(cbReq(cbBody()));
        const status = calls("/status");
        expect(status).toHaveLength(1);
        const url = new URL(String(status[0][0]));
        expect(url.pathname).toBe("/STA/status");
        // PVIT's status API finds the transaction by OUR merchant reference.
        expect(Object.fromEntries(url.searchParams)).toEqual({
          transactionId: "OYBREF1", accountOperationCode: "ACC_OP", transactionOperation: "PAYMENT",
        });
        expect(status[0][1].headers["X-Secret"]).toBe("sk_test");
      });

      it("falls back to the PVIT id when the reference is not found", async () => {
        route.status = (id) =>
          id === "PAY-1"
            ? json({ status: "SUCCESS", amount: 5000, merchant_reference_id: "OYBREF1" })
            : json({ status_code: 4006, error: "TRANSACTION_NOT_FOUND" }, 404);
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(200);
        expect(payment().status).toBe("confirmed");
        expect(calls("/status")).toHaveLength(2);
      });

      it("does not confirm when PVIT finds the transaction under neither id", async () => {
        route.status = () => json({ status_code: 4006, error: "TRANSACTION_NOT_FOUND" }, 404);
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(502);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
      });

      it("verifies without a stored PVIT id (the initiation answer was lost)", async () => {
        payment().provider_transaction_id = null;
        await pvit.handlePvitCallback(cbReq(cbBody({ transactionId: "PAY-9" })));
        expect(payment().status).toBe("confirmed");
      });

      it("writes the split ledger: the shop gets its full price, the platform keeps the rest", async () => {
        // The payment was charged 5000: a 4300 price plus 700 of customer-side fees.
        payment().raw_request.ouyaboung = { payoutAccountId: "pa-1", beneficiaryCode: "BENPA1", feeAmount: 700, merchantNetAmount: 4300 };
        await pvit.handlePvitCallback(cbReq(cbBody()));
        const [merchant, platform] = db.rows("payment_settlements");
        expect(db.rows("payment_settlements")).toHaveLength(2);
        expect(merchant).toMatchObject({
          recipient_type: "merchant", gross_amount: 4300, fee_amount: 0, net_amount: 4300,
          status: "paid", merchant_payout_account_id: "pa-1", disbursement_id: "BENPA1",
        });
        expect(platform).toMatchObject({ recipient_type: "platform", net_amount: 700, status: "paid" });
        expect(merchant.net_amount + platform.net_amount).toBe(5000);
      });

      it("accepts a callback that carries no amount (PVIT's status API provides it)", async () => {
        const body = cbBody();
        delete (body as AnyRow).amount;
        expect((await pvit.handlePvitCallback(cbReq(body))).status).toBe(200);
        expect(payment().status).toBe("confirmed");
      });
    });

    describe("a webhook is a hint, not a proof", () => {
      it("does not confirm when PVIT's status API still says PENDING (forged SUCCESS)", async () => {
        route.status = () => json({ status: "PENDING", amount: 5000, merchant_reference_id: "OYBREF1" });
        const res = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(res.status).toBe(200);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });

      it("does not fail a pending payment on a forged FAILED callback", async () => {
        route.status = () => json({ status: "PENDING", amount: 5000, merchant_reference_id: "OYBREF1" });
        await pvit.handlePvitCallback(cbReq(cbBody({ status: "FAILED" })));
        expect(payment().status).toBe("pending");
      });

      it("applies what PVIT says even if the callback claims otherwise", async () => {
        route.status = () => json({ status: "SUCCESS", amount: 5000, merchant_reference_id: "OYBREF1" });
        await pvit.handlePvitCallback(cbReq(cbBody({ status: "FAILED" })));
        expect(payment().status).toBe("confirmed");
      });

      it("marks the payment failed when PVIT confirms the failure", async () => {
        route.status = () => json({ status: "FAILED", amount: 5000, merchant_reference_id: "OYBREF1" });
        await pvit.handlePvitCallback(cbReq(cbBody({ status: "FAILED" })));
        expect(payment().status).toBe("failed");
        expect(legacy().status).toBe("FAILED");
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });

      it("treats AMBIGUOUS as still pending", async () => {
        route.status = () => json({ status: "AMBIGUOUS", amount: 5000, merchant_reference_id: "OYBREF1" });
        await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(payment().status).toBe("pending");
      });

      it("answers 502 and changes nothing when the status API is unavailable", async () => {
        route.status = () => json({}, 500);
        const res = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(res.status).toBe(502);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
      });

      it("answers 502 when the status API cannot be reached at all", async () => {
        route.status = () => { throw new Error("timeout"); };
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(502);
        expect(order().status).toBe("pending");
      });

      it("rejects a status answer for another reference", async () => {
        route.status = () => json({ status: "SUCCESS", amount: 5000, merchant_reference_id: "SOMETHINGELSE" });
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(409);
        expect(payment().status).toBe("pending");
      });
    });

    describe("amount verification", () => {
      it("rejects a callback amount that differs and changes nothing", async () => {
        const res = await pvit.handlePvitCallback(cbReq(cbBody({ amount: 50 })));
        expect(res.status).toBe(409);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });

      it("rejects a status API amount that differs, or none", async () => {
        route.status = () => json({ status: "SUCCESS", amount: 50, merchant_reference_id: "OYBREF1" });
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(409);
        route.status = () => json({ status: "SUCCESS", merchant_reference_id: "OYBREF1" });
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(409);
        expect(payment().status).toBe("pending");
        expect(order().status).toBe("pending");
      });

      it("does not apply the amount check to failures", async () => {
        route.status = () => json({ status: "FAILED", amount: 1, merchant_reference_id: "OYBREF1" });
        expect((await pvit.handlePvitCallback(cbReq(cbBody({ status: "FAILED", amount: 1 })))).status).toBe(200);
        expect(payment().status).toBe("failed");
      });
    });

    describe("replays and out-of-order notifications", () => {
      it("is idempotent when the same confirmation is replayed", async () => {
        await pvit.handlePvitCallback(cbReq(cbBody()));
        const res = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(res.status).toBe(200);
        expect(db.rows("payment_settlements")).toHaveLength(2);
        expect(order().status).toBe("confirmed");
      });

      it("ignores a late failure after confirmation", async () => {
        await pvit.handlePvitCallback(cbReq(cbBody()));
        route.status = () => json({ status: "FAILED", amount: 5000, merchant_reference_id: "OYBREF1" });
        const res = await pvit.handlePvitCallback(cbReq(cbBody({ status: "FAILED" })));
        expect(res.status).toBe(200);
        expect(payment().status).toBe("confirmed");
        expect(order().status).toBe("confirmed");
      });

      it("does not resurrect a failed payment", async () => {
        payment().status = "failed";
        await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(payment().status).toBe("failed");
        expect(order().status).toBe("pending");
      });

      it("never rewrites an order that already left 'pending'", async () => {
        order().status = "ready";
        await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(order().status).toBe("ready");
      });

      it("handles two identical callbacks racing", async () => {
        const [a, b] = await Promise.all([
          pvit.handlePvitCallback(cbReq(cbBody())),
          pvit.handlePvitCallback(cbReq(cbBody())),
        ]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(db.rows("payment_settlements")).toHaveLength(2);
      });
    });

    describe("consistency", () => {
      it("flags a payment confirmed for a cancelled order for manual refund", async () => {
        order().status = "cancelled";
        await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(order().status).toBe("cancelled");
        expect(payment().status).toBe("confirmed");
        expect(db.rows("payment_settlements").every((s) => s.status === "manual_review")).toBe(true);
        expect(legacy().settlement_status).toBe("manual_review");
      });

      it("answers 500 when a write fails, then recovers on replay", async () => {
        db.failWrites.add("orders");
        const res = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(res.status).toBe(500);
        expect(order().status).toBe("pending");

        db.failWrites.clear();
        const replay = await pvit.handlePvitCallback(cbReq(cbBody()));
        expect(replay.status).toBe(200);
        expect(order().status).toBe("confirmed");
        expect(db.rows("payment_settlements")).toHaveLength(2);
      });

      it("answers 500 and writes no settlement when the payment update fails", async () => {
        db.failWrites.add("payment_transactions");
        expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(500);
        expect(order().status).toBe("pending");
        expect(db.rows("payment_settlements")).toHaveLength(0);
      });
    });
  });

  // ---------------------------------------------------------------------- sync
  describe("syncPvitTransactionStatus", () => {
    const sync = (body: AnyRow | undefined = { reference: "OYBREF1" }, token: string | null = "tok-alice") =>
      pvit.syncPvitTransactionStatus(authedReq("pvit-transaction-status", body, token));

    beforeEach(() => {
      seedOrder();
      seedPayout();
      seedPayment();
    });

    it("requires authentication and an identifier", async () => {
      expect((await sync(undefined, null)).status).toBe(401);
      expect((await sync({})).status).toBe(400);
    });

    it("404s for an unknown reference and forbids reading someone else's payment", async () => {
      expect((await sync({ reference: "NOPE" })).status).toBe(404);
      expect((await sync(undefined, "tok-bob")).status).toBe(403);
    });

    it("lets the customer, the shop owner and an admin read it", async () => {
      for (const token of ["tok-alice", "tok-shop", "tok-admin"]) {
        expect((await sync(undefined, token)).status).toBe(200);
      }
    });

    it("can locate the payment by provider transaction id", async () => {
      expect((await sync({ transactionId: "PAY-1" })).status).toBe(200);
    });

    it("confirms the payment and the order when PVIT reports success", async () => {
      const res = await sync();
      expect(res.status).toBe(200);
      expect((await res.json()).data.status).toBe("confirmed");
      expect(payment().status).toBe("confirmed");
      expect(order().status).toBe("confirmed");
      expect(db.rows("payment_settlements")).toHaveLength(2);
    });

    it("rejects an amount that differs from the order", async () => {
      route.status = () => json({ status: "SUCCESS", amount: 50, merchant_reference_id: "OYBREF1" });
      expect((await sync()).status).toBe(409);
      expect(payment().status).toBe("pending");
    });

    it("does not downgrade a confirmed payment", async () => {
      await sync();
      route.status = () => json({ status: "FAILED", amount: 5000, merchant_reference_id: "OYBREF1" });
      expect((await sync()).status).toBe(200);
      expect(payment().status).toBe("confirmed");
    });

    it("502s when PVIT is unavailable", async () => {
      route.status = () => json({}, 503);
      const res = await sync();
      expect(res.status).toBe(502);
      expect(payment().status).toBe("pending");
    });
  });

  // -------------------------------------------------------- payout verification
  describe("verifyPayoutAccount", () => {
    const verify = (body: AnyRow | undefined = { accountId: "pa-2" }, token: string | null = "tok-shop") =>
      pvit.verifyPayoutAccount(authedReq("verify-payout-account", body, token));

    beforeEach(() => {
      seedPayout({ id: "pa-2", verification_status: "pending", is_default: false });
    });

    const account = () => db.rows("merchant_payout_accounts").find((a) => a.id === "pa-2")!;

    it("requires authentication and an accountId", async () => {
      expect((await verify(undefined, null)).status).toBe(401);
      expect((await verify({})).status).toBe(400);
      expect((await verify({ accountId: "nope" })).status).toBe(404);
    });

    it("only lets the shop owner or an admin verify an account", async () => {
      expect((await verify(undefined, "tok-bob")).status).toBe(403);
      expect(account().verification_status).toBe("pending");
      expect((await verify(undefined, "tok-admin")).status).toBe(200);
    });

    it("verifies a number known to PVIT's KYC", async () => {
      const res = await verify();
      expect(res.status).toBe(200);
      expect(account()).toMatchObject({ verification_status: "verified", rejection_reason: null });
      expect(account().verified_at).toBeTruthy();

      const kyc = calls("/kyc");
      expect(kyc).toHaveLength(1);
      const url = new URL(String(kyc[0][0]));
      expect(url.pathname).toBe("/v2/KYC/kyc");
      expect(Object.fromEntries(url.searchParams)).toEqual({ customerAccountNumber: "074111111", operatorCode: "AIRTEL_MONEY" });
    });

    it("rejects a number unknown to the operator", async () => {
      route.kyc = () => json({ status_code: 4007, error: "UNKNOWN_CUSTOMER" }, 404);
      const res = await verify();
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("CUSTOMER_UNKNOWN");
      expect(account()).toMatchObject({ verification_status: "rejected" });
    });

    it("leaves the account pending when PVIT is unavailable", async () => {
      route.kyc = () => json({}, 500);
      expect((await verify()).status).toBe(502);
      expect(account().verification_status).toBe("pending");
    });

    it("leaves the account pending on a response without data", async () => {
      route.kyc = () => json({});
      expect((await verify()).status).toBe(502);
      expect(account().verification_status).toBe("pending");
    });

    it("rejects a number that does not match its operator", async () => {
      account().operator = "moov";
      expect((await verify()).status).toBe(400);
      expect(calls("/kyc")).toHaveLength(0);
    });

    it("is a no-op for an already verified account and refuses a disabled one", async () => {
      account().verification_status = "verified";
      expect((await verify()).status).toBe(200);
      expect(calls("/kyc")).toHaveLength(0);
      account().verification_status = "disabled";
      expect((await verify()).status).toBe(409);
    });

    it("answers 503 while the KYC API is not configured", async () => {
      delete env.PVIT_CODE_URL_KYC;
      expect((await verify()).status).toBe(503);
    });
  });
});
