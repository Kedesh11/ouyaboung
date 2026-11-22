// In-memory fake of the Supabase client used by the edge handler tests.
// Supports the subset of the query builder the PVIT handlers use.

export type AnyRow = Record<string, any>;

export class FakeDb {
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

export class Query {
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
// Fake of the compute_fee_breakdown RPC. It mirrors the SQL function (same rounding) and is
// pinned to the same worked examples as the SQL tests (see fee-breakdown.test.ts), so a drift
// between the two is caught.
// ---------------------------------------------------------------------------
export type FeeRates = { order: number; transport: number; pvit: number; airtel: number; moov: number };

export const DEFAULT_FEE_RATES: FeeRates = { order: 0.1, transport: 0.1, pvit: 0.025, airtel: 0.01, moov: 0.01 };

export const computeFeeBreakdownFake = (rates: FeeRates, flow: string, base: number, operator: string) => {
  if (flow !== "order" && flow !== "transport") return { success: false, code: "INVALID_FLOW" };
  if (operator !== "airtel" && operator !== "moov") return { success: false, code: "INVALID_OPERATOR" };
  if (!Number.isInteger(base) || base <= 0 || base > 100_000_000) return { success: false, code: "INVALID_AMOUNT" };
  const platformRate = flow === "order" ? rates.order : rates.transport;
  const operatorRate = operator === "airtel" ? rates.airtel : rates.moov;
  const platform = Math.round(base * platformRate);
  const subtotal = base + platform;
  // Integer arithmetic on ten-thousandths avoids floating-point drift in the ceilings.
  const ceilRate = (rate: number) => Math.ceil(Math.round(subtotal * Math.round(rate * 10_000)) / 10_000 - 1e-9);
  const pvit = ceilRate(rates.pvit);
  const op = ceilRate(operatorRate);
  return {
    success: true,
    flow,
    operator,
    base_amount: base,
    recipient_amount: base,
    platform_fee: platform,
    pvit_fee: pvit,
    operator_fee: op,
    total_amount: base + platform + pvit + op,
    rates: { platform: platformRate, pvit: rates.pvit, operator: operatorRate },
    fees_estimated: true,
    currency: "XAF",
  };
};

export const makeFakeRpc = (getRates: () => FeeRates) => async (name: string, args: Record<string, any>) => {
  if (name === "compute_fee_breakdown") {
    return { data: computeFeeBreakdownFake(getRates(), args.p_flow, args.p_base_amount, args.p_operator), error: null };
  }
  return { data: null, error: { message: `unknown rpc ${name}` } };
};
