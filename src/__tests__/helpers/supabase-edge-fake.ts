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

