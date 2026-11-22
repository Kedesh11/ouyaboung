/**
 * PVIT transport payment handlers: isolated initiation (farmer pays an accepted
 * course), webhook + status sync dispatched from the shared handlers, and the
 * KYC check of a driver's payout number. Run against an in-memory Supabase fake
 * and a routed fake of the PVIT HTTP API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, Query, type AnyRow } from "./helpers/supabase-edge-fake";

const state = vi.hoisted(() => ({
  edgeCreateClient: null as null | ((url: string, key: string, opts?: Record<string, any>) => unknown),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: (url: string, key: string, opts?: Record<string, any>) => state.edgeCreateClient!(url, key, opts),
}));

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
  // The order commission must NOT be what a transport is charged: the frozen fare decides.
  PLATFORM_COMMISSION_RATE: "0.5",
};

const USERS: Record<string, { id: string }> = {
  "tok-farmer": { id: "farmer-user" },
  "tok-other": { id: "other-user" },
  "tok-driver": { id: "driver-user" },
  "tok-admin": { id: "admin-1" },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("PVIT transport payment handlers", () => {
  let db: FakeDb;
  let fetchMock: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let route: { rest: () => Response; status: (id: string) => Response; kyc: () => Response };

  let pvit: {
    handlePvitCallback: (req: Request) => Promise<Response>;
    syncPvitTransactionStatus: (req: Request) => Promise<Response>;
    verifyPayoutAccount: (req: Request) => Promise<Response>;
  };
  let transport: { initiateTransportPayment: (a: { req: Request }) => Promise<Response> };

  const calls = (needle: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(needle));
  const restBody = () => JSON.parse(String(calls("/rest")[0][1].body));

  const seedRequest = (over: AnyRow = {}) =>
    db.add("transport_requests", {
      id: "req-1", farmer_id: "farmer-1", driver_id: "driver-1", status: "accepted", payment_status: "unpaid",
      payment_deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
      fare_amount: 10000, platform_fee: 1500, driver_net: 8500, ...over,
    });

  const seedPayout = (over: AnyRow = {}) =>
    db.add("driver_payout_accounts", {
      id: "dpa-1", driver_id: "driver-1", provider: "pvit", operator: "airtel", normalized_msisdn: "074111111",
      verification_status: "verified", is_active: true, is_default: true, ...over,
    });

  const seedPayment = (over: AnyRow = {}) => {
    const wallet = db.rows("platform_payment_wallets")[0] ?? db.add("platform_payment_wallets", { provider: "pvit", is_active: true, wallet_id: "ACC_OP" });
    return db.add("transport_payments", {
      transport_request_id: "req-1", user_id: "farmer-user", driver_id: "driver-1", driver_payout_account_id: "dpa-1",
      platform_wallet_id: wallet.id, provider: "pvit", operator: "airtel", internal_reference: "OYBTRANS1",
      provider_transaction_id: "PAY-1", status: "pending", amount: 10000, platform_fee: 1500, driver_net: 8500,
      settlement_status: "pending", ...over,
    });
  };

  const req = (body: AnyRow | undefined, token: string | null = "tok-farmer", path = "x") =>
    new Request(`https://x.test/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });

  const cbReq = (body: AnyRow) =>
    new Request("https://x.test/pvit-callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const cbBody = (over: AnyRow = {}) => ({
    transactionId: "PAY-1", merchantReferenceId: "OYBTRANS1", status: "SUCCESS", amount: 10000, code: 200,
    transactionOperation: "PAYMENT", ...over,
  });

  const request = () => db.rows("transport_requests")[0];
  const payment = () => db.rows("transport_payments")[0];

  beforeEach(async () => {
    db = new FakeDb();
    env = { ...ENV };
    (globalThis as AnyRow).Deno = { env: { get: (k: string) => env[k] } };

    route = {
      rest: () => json({ status: "PENDING", status_code: "200", operator: "AIRTEL_MONEY", reference_id: "PAY-1", message: "ok" }),
      status: (id) =>
        id === "OYBTRANS1"
          ? json({ status: "SUCCESS", amount: 10000, merchant_reference_id: "OYBTRANS1" })
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
      return { from: (t: string) => new Query(db, t) };
    };

    db.add("farmers", { id: "farmer-1", user_id: "farmer-user" });
    db.add("drivers", { id: "driver-1", user_id: "driver-user" });
    db.add("profiles", { user_id: "admin-1", role: "admin" });

    // Chemins en variables: TypeScript ne doit pas compiler le code Deno des Edge Functions.
    const pvitModule = "../../supabase/functions/_shared/pvit";
    const transportModule = "../../supabase/functions/_shared/pvit-transport";
    pvit = await import(/* @vite-ignore */ pvitModule);
    transport = await import(/* @vite-ignore */ transportModule);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------ initiate
  describe("initiateTransportPayment", () => {
    const init = (body: AnyRow = { requestId: "req-1", phone: "077123456" }, token: string | null = "tok-farmer") =>
      transport.initiateTransportPayment({ req: req(body, token) });

    beforeEach(() => {
      seedRequest();
      seedPayout();
    });

    it("rejects a missing or invalid token", async () => {
      expect((await init(undefined, null)).status).toBe(401);
      expect((await init(undefined, "nope")).status).toBe(401);
    });

    it("rejects a missing requestId, an invalid number and an operator/prefix mismatch", async () => {
      expect((await init({ phone: "077123456" })).status).toBe(400);
      expect((await init({ requestId: "req-1", phone: "123" })).status).toBe(400);
      const mismatch = await init({ requestId: "req-1", phone: "077123456", operator: "moov" });
      expect(mismatch.status).toBe(400);
      expect((await mismatch.json()).error.code).toBe("INVALID_PHONE_OPERATOR");
    });

    it("answers 503 while the provider is not configured, without calling it", async () => {
      delete env.PVIT_SECRET_PASSWORD;
      expect((await init()).status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("404s on an unknown course and 403s when the course belongs to another farmer", async () => {
      expect((await init({ requestId: "nope", phone: "077123456" })).status).toBe(404);
      const res = await init(undefined, "tok-other");
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("REQUEST_OWNERSHIP");
      expect(db.rows("transport_payments")).toHaveLength(0);
    });

    it("the driver cannot pay (or start a payment for) the farmer's course", async () => {
      expect((await init(undefined, "tok-driver")).status).toBe(403);
    });

    it.each([
      ["proposed", "unpaid"],
      ["cancelled", "unpaid"],
      ["picked_up", "paid"],
    ])("refuses a course that is %s / %s", async (status, paymentStatus) => {
      request().status = status;
      request().payment_status = paymentStatus;
      expect((await init()).status).toBe(409);
      expect(calls("/rest")).toHaveLength(0);
    });

    it("refuses a course that is already paid", async () => {
      request().payment_status = "paid";
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("ALREADY_PAID");
    });

    it("refuses once the payment window is over", async () => {
      request().payment_deadline = new Date(Date.now() - 1000).toISOString();
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("PAYMENT_WINDOW_EXPIRED");
      expect(calls("/rest")).toHaveLength(0);
    });

    it("refuses when the driver has no verified payout account", async () => {
      db.tables.driver_payout_accounts = [];
      seedPayout({ id: "a", verification_status: "pending" });
      seedPayout({ id: "b", is_active: false });
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("DRIVER_PAYOUT_NOT_VERIFIED");
      expect(calls("/rest")).toHaveLength(0);
    });

    it.each([
      ["no fare", { fare_amount: null }],
      ["a zero fare", { fare_amount: 0 }],
      ["a split that does not add up", { platform_fee: 2000 }],
    ])("refuses %s", async (_label, over) => {
      Object.assign(request(), over);
      expect((await init()).status).toBe(400);
      expect(calls("/rest")).toHaveLength(0);
    });

    it("charges the FROZEN fare and split, not the current commission rate", async () => {
      const res = await init();
      expect(res.status).toBe(200);
      const body = restBody();
      expect(body.amount).toBe(10000);
      // Env commission is 50 %, but the request froze 15 %: the driver gets 8 500.
      expect(body.beneficiaries[0].value).toBe(8500);
      expect(payment()).toMatchObject({ amount: 10000, platform_fee: 1500, driver_net: 8500, status: "pending", user_id: "farmer-user" });
    });

    it("sends the driver's number in the local format, a short alphanumeric reference and a safe free_info", async () => {
      await init();
      const body = restBody();
      expect(body.beneficiaries[0].destination).toMatchObject({ msisdn: "074111111", operator_code: "AIRTEL_MONEY" });
      expect(body.customer_account_number).toBe("077123456");
      expect(body.reference).toMatch(/^OYB[A-Z0-9]{1,17}$/);
      expect(body.free_info).toMatch(/^trans [A-Za-z0-9]{1,8}$/);
      expect(body.free_info.length).toBeLessThanOrEqual(15);
      expect(body.callback_url_code).toBe("CB1");
    });

    it("marks the course payment as pending and answers with the amounts", async () => {
      const res = await init();
      const json = await res.json();
      expect(json).toMatchObject({ success: true, data: { totalAmount: 10000, driverAmount: 8500, platformFee: 1500, status: "pending" } });
      expect(request().payment_status).toBe("pending");
    });

    it("never marks the course paid at initiation (only a webhook/status check can)", async () => {
      await init();
      expect(request().payment_status).not.toBe("paid");
      expect(payment().status).not.toBe("confirmed");
    });

    it("lets the farmer retry after PVIT rejected the payment, resetting the course to unpaid", async () => {
      route.rest = () => json({ status: "FAILED", status_code: 3032, message: "refus" }, 400);
      const res = await init();
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("PROVIDER_REJECTED");
      expect(payment().status).toBe("failed");
      expect(request().payment_status).toBe("unpaid");
    });

    it("keeps the payment pending when PVIT cannot be reached (it may still go through)", async () => {
      route.rest = () => {
        throw new Error("network down");
      };
      const res = await init();
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(payment().status).toBe("pending");
      expect(request().payment_status).toBe("pending");
    });

    it("refuses a second payment while one is in flight", async () => {
      seedPayment({ status: "pending", created_at: new Date().toISOString() });
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("PAYMENT_IN_PROGRESS");
      expect(calls("/rest")).toHaveLength(0);
    });

    it("answers 409 when the one-active-payment index wins a concurrent attempt", async () => {
      db.unique = { transport_payments: [["transport_request_id"]] };
      seedPayment({ status: "failed" });
      const res = await init();
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("PAYMENT_IN_PROGRESS");
      expect(calls("/rest")).toHaveLength(0);
    });

    it("rate-limits repeated attempts per user", async () => {
      env.PAYMENT_MAX_INITIATIONS_PER_WINDOW = "2";
      seedPayment({ internal_reference: "R1", status: "failed" });
      seedPayment({ internal_reference: "R2", status: "failed" });
      const res = await init();
      expect(res.status).toBe(429);
      expect(calls("/rest")).toHaveLength(0);
    });

    it("fails with 500 (state stays recoverable) when the ledger cannot be written", async () => {
      db.failWrites.add("transport_payments");
      expect((await init()).status).toBe(500);
      expect(calls("/rest")).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------- webhook
  describe("webhook dispatch (handlePvitCallback)", () => {
    beforeEach(() => {
      seedRequest({ payment_status: "pending" });
      seedPayout();
      seedPayment();
    });

    it("confirms the payment after PVIT's status API says so, and unlocks the course", async () => {
      const res = await pvit.handlePvitCallback(cbReq(cbBody()));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ transactionId: "PAY-1", responseCode: 200 });
      expect(payment()).toMatchObject({ status: "confirmed", settlement_status: "paid", provider_status: "SUCCESS" });
      expect(request().payment_status).toBe("paid");
      expect(request().paid_at).toBeTruthy();
      expect(calls("/status").length).toBeGreaterThan(0);
    });

    it("is idempotent: a replayed webhook changes nothing", async () => {
      await pvit.handlePvitCallback(cbReq(cbBody()));
      const paidAt = request().paid_at;
      const confirmedAt = payment().confirmed_at;
      const again = await pvit.handlePvitCallback(cbReq(cbBody()));
      expect(again.status).toBe(200);
      expect(request().paid_at).toBe(paidAt);
      expect(payment().confirmed_at).toBe(confirmedAt);
    });

    it("does not trust the webhook alone: a SUCCESS claim the status API denies pays nothing", async () => {
      route.status = () => json({ status: "FAILED", amount: 10000, merchant_reference_id: "OYBTRANS1" });
      const res = await pvit.handlePvitCallback(cbReq(cbBody({ status: "SUCCESS" })));
      expect(res.status).toBe(200);
      expect(request().payment_status).toBe("unpaid");
      expect(payment().status).toBe("failed");
    });

    it("a failed payment returns the course to unpaid so the farmer can retry", async () => {
      route.status = () => json({ status: "FAILED", amount: 10000, merchant_reference_id: "OYBTRANS1" });
      await pvit.handlePvitCallback(cbReq(cbBody({ status: "FAILED", code: 2000 })));
      expect(request().payment_status).toBe("unpaid");
      expect(payment().status).toBe("failed");
    });

    it("rejects a webhook whose reported amount differs from the fare", async () => {
      const res = await pvit.handlePvitCallback(cbReq(cbBody({ amount: 100 })));
      expect(res.status).toBe(409);
      expect(request().payment_status).toBe("pending");
      expect(payment().status).toBe("pending");
    });

    it("rejects a confirmation when the status API reports another amount", async () => {
      route.status = () => json({ status: "SUCCESS", amount: 100, merchant_reference_id: "OYBTRANS1" });
      const res = await pvit.handlePvitCallback(cbReq(cbBody()));
      expect(res.status).toBe(409);
      expect(request().payment_status).toBe("pending");
    });

    it("rejects a webhook carrying another PVIT transaction id", async () => {
      const res = await pvit.handlePvitCallback(cbReq(cbBody({ transactionId: "OTHER" })));
      expect(res.status).toBe(409);
      expect(request().payment_status).toBe("pending");
    });

    it("answers 502 when the status API is unreachable, so PVIT retries later", async () => {
      route.status = () => json({}, 500);
      expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(502);
      expect(request().payment_status).toBe("pending");
    });

    it("flags a payment confirmed for an already cancelled course for a manual refund", async () => {
      request().status = "cancelled";
      await pvit.handlePvitCallback(cbReq(cbBody()));
      expect(payment()).toMatchObject({ status: "confirmed", settlement_status: "manual_review" });
      expect(request().status).toBe("cancelled");
    });

    it("acknowledges a refund notification without touching anything", async () => {
      const res = await pvit.handlePvitCallback(cbReq(cbBody({ transactionOperation: "GIVE_CHANGE" })));
      expect(res.status).toBe(200);
      expect(payment().status).toBe("pending");
    });

    it("answers 404 for a reference that is neither an order nor a transport payment", async () => {
      const res = await pvit.handlePvitCallback(cbReq(cbBody({ merchantReferenceId: "UNKNOWN" })));
      expect(res.status).toBe(404);
    });

    it("answers 500 (replayable) when the confirmation cannot be written", async () => {
      db.failWrites.add("transport_requests");
      expect((await pvit.handlePvitCallback(cbReq(cbBody()))).status).toBe(500);
    });
  });

  // ----------------------------------------------------------------------- sync
  describe("status sync dispatch (syncPvitTransactionStatus)", () => {
    beforeEach(() => {
      seedRequest({ payment_status: "pending" });
      seedPayout();
      seedPayment();
    });
    const sync = (token: string | null, body: AnyRow = { reference: "OYBTRANS1" }) =>
      pvit.syncPvitTransactionStatus(req(body, token));

    it("lets the paying farmer, the driver and an admin resynchronise", async () => {
      expect((await sync("tok-farmer")).status).toBe(200);
      expect(request().payment_status).toBe("paid");
      request().payment_status = "pending";
      payment().status = "pending";
      expect((await sync("tok-driver")).status).toBe(200);
      request().payment_status = "pending";
      payment().status = "pending";
      expect((await sync("tok-admin")).status).toBe(200);
    });

    it("refuses an unrelated user", async () => {
      const res = await sync("tok-other");
      expect(res.status).toBe(403);
      expect(request().payment_status).toBe("pending");
    });

    it("finds the payment by PVIT transaction id too", async () => {
      expect((await sync("tok-farmer", { transactionId: "PAY-1" })).status).toBe(200);
    });

    it("404s on an unknown reference", async () => {
      expect((await sync("tok-farmer", { reference: "NOPE" })).status).toBe(404);
    });

    it("requires authentication", async () => {
      expect((await sync(null)).status).toBe(401);
    });
  });

  // ------------------------------------------------------------- driver payout KYC
  describe("verifyPayoutAccount for a driver number", () => {
    const verify = (token: string | null, accountId = "dpa-1") => pvit.verifyPayoutAccount(req({ accountId }, token));

    beforeEach(() => {
      seedPayout({ verification_status: "pending" });
    });

    it("lets the driver verify their own number", async () => {
      const res = await verify("tok-driver");
      expect(res.status).toBe(200);
      expect(db.rows("driver_payout_accounts")[0]).toMatchObject({ verification_status: "verified", rejection_reason: null });
    });

    it("lets an admin verify it", async () => {
      expect((await verify("tok-admin")).status).toBe(200);
    });

    it("refuses another user", async () => {
      expect((await verify("tok-other")).status).toBe(403);
      expect(db.rows("driver_payout_accounts")[0].verification_status).toBe("pending");
    });

    it("404s on an unknown account", async () => {
      expect((await verify("tok-driver", "nope")).status).toBe(404);
    });

    it("rejects a number unknown to the operator", async () => {
      route.kyc = () => json({ status_code: 3023, error: "CUSTOMER_UNKNOWN" }, 404);
      const res = await verify("tok-driver");
      expect(res.status).toBe(422);
      expect(db.rows("driver_payout_accounts")[0].verification_status).toBe("rejected");
    });

    it("stays pending when the KYC service is unavailable", async () => {
      route.kyc = () => json({}, 500);
      expect((await verify("tok-driver")).status).toBe(502);
      expect(db.rows("driver_payout_accounts")[0].verification_status).toBe("pending");
    });

    it("rejects a number whose prefix does not match the operator", async () => {
      db.rows("driver_payout_accounts")[0].operator = "moov";
      const res = await verify("tok-driver");
      expect(res.status).toBe(400);
      expect(calls("/kyc")).toHaveLength(0);
    });
  });
});
