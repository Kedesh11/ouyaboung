# Ouyaboung Performance Optimization Report (2026-02-28)

## 1) Baseline (before changes)

### Build profile (Next.js)
- Shared first-load JS: `103 kB`
- Heaviest route chunks:
  - `/merchant/register`: `310 kB`
  - `/merchant/analytics`: `346 kB`
  - `/p/[slug]`: `281 kB`
  - `/m/[slug]`: `276 kB`
  - `/search`: `267 kB`

### Lighthouse baseline (from `lighthouse-results/*.json`)
- `/`: Performance `93`, LCP `~3.0s`, requests `44`, transfer `~464 KB`
- `/about`: Performance `67`, LCP `~4.0s`, TBT `~640ms`
- `/search`: Performance `48`, LCP `~6.7s`, requests `48`, transfer `~641 KB`
- `/p/[slug]`: Performance `48`, LCP `~5.8s`, requests `53`, transfer `~653 KB`
- `/m/[slug]`: Performance `51`, LCP `~5.6s`, requests `53`, transfer `~654 KB`

### Backend/query baseline
- `select('*')` / wildcard usage existed broadly across `src`, `app`, and `supabase/functions`.
- Several dashboard queries loaded full rows where only a small subset of fields was used.
- Offline cache TTL was `6h`, queue storage was localStorage-only.

## 2) Bottlenecks (impact classification)

### Critical (`🔴`)
- Wildcard selects (`select('*')`) on high-traffic paths (orders, inventory, merchants, notifications, transactions views).
- Unbounded/large result loads in transaction pages and admin aggregation.
- Offline queue persisted only in localStorage; no Background Sync trigger.
- QR flow had decoding/reliability issues (already fixed in current branch before this report iteration).

### Important (`🟡`)
- SEO infra partially present but incomplete (`robots.ts` missing, metadata not centralized enough for route-level hygiene).
- PWA navigation cache capped at `6h`.
- Heavy client-only public pages remain a CWV risk.

### Improvement (`🟢`)
- Additional React render-level memoization across some dashboard pages.
- Further code-splitting for motion/chart-heavy pages.
- RLS simplification through helper functions in complex policies.

## 3) Implemented optimizations

## 3.1 Supabase query optimization
- Removed wildcard select patterns from app/runtime code paths and callback functions.
- Introduced explicit column projections in:
  - `src/api/orders.api.ts`
  - `src/api/inventory.api.ts`
  - `src/api/merchants.api.ts`
  - `src/api/users.api.ts`
  - `src/services/admin.service.ts`
  - `src/services/notification.service.ts`
  - `src/lib/auth/mfa.ts`
  - `src/lib/auth/session.ts`
  - `src/api/pricing.api.ts`
  - `supabase/functions/payment-callback/index.ts`
  - `supabase/functions/airtel-callback/index.ts`
  - `supabase/functions/moov-callback/index.ts`

## 3.2 Pagination / payload controls
- Added explicit row windows on transaction feeds:
  - Admin transactions: top `500`
  - User transactions: top `500`
  - Merchant transactions: top `200`
- Replaced `select('*')` with curated transaction field lists in all three pages.

## 3.3 Offline-first upgrade
- Added IndexedDB key-value storage layer:
  - `src/lib/offline/indexeddb.ts`
- Upgraded cache layer:
  - TTL increased from `6h` to `24h`
  - async cache read/write with localStorage + IndexedDB fallback
  - file: `src/lib/offline/cache.ts`
- Upgraded queue layer:
  - queue persistence backed by IndexedDB + localStorage hydration
  - async queue API (`getOfflineQueue`, `saveOfflineQueue`, `enqueueOfflineQueueItem`)
  - file: `src/lib/offline/queue.ts`
- Added Background Sync registration:
  - `src/lib/offline/background-sync.ts`
  - `src/components/pwa/OfflineSyncManager.tsx`
  - `worker/index.js` (`sync` listener posting `OFFLINE_SYNC_TRIGGER`)

## 3.4 SEO technical hardening
- Strengthened root metadata:
  - `metadataBase`, OpenGraph/Twitter defaults, robots, canonical
  - file: `app/layout.tsx`
- Added robots route:
  - file: `app/robots.ts`
- Improved sitemap generation with env base URL and more public URLs:
  - file: `app/sitemap.ts`
- Added dynamic-segment metadata layouts for `/p/[slug]` and `/m/[slug]`:
  - `app/(public)/p/[slug]/layout.tsx`
  - `app/(public)/m/[slug]/layout.tsx`

## 3.5 PWA runtime caching
- Navigation cache increased to `24h`.
- Supabase network cache switched to `StaleWhileRevalidate`, capacity and retention increased.
- file: `next.config.mjs`

## 3.6 QR scan reliability hardening
- Fixed merchant scanner validation ceiling from `32` to `64` chars to support legacy normalized QR payloads.
- Camera now stops immediately on a valid QR candidate to avoid duplicate decode loops while validation is running.
- Scanner constraints tuned for mobile decode performance (`1280x720`, bounded frameRate) and single-code mode.
- QR rendering improved for camera readability:
  - bigger quiet zone (`marginSize=8`)
  - reduced center logo footprint
  - stronger contrast frame and white staging area
- Edge validation now queries normalized pickup codes (`pickup_code_normalized`) with fallback logic when migration is not yet applied.
- Payment callbacks now generate short scan-friendly pickup codes (`PK` + 12 uppercase hex chars) instead of dense `QR_uuid` strings.

## 4) SQL deliverables

- Index migration:
  - `supabase/migrations/20260228235900_performance_indexes.sql`
  - `supabase/migrations/20260228235959_qr_pickup_code_normalized.sql`
- Diagnostics pack:
  - `docs/sql/performance_diagnostics.sql`

## 5) Build validation (after changes)

- `npm run type-check`: ✅
- `npm run build`: ✅
- Route map unchanged functionally; SEO route `robots.txt` now emitted by App Router.

## 6) Clean architecture status

### What was concretely improved now
- Stronger separation between storage concerns and business calls in offline subsystem:
  - transport-independent cache/queue APIs
  - SW sync trigger decoupled via messaging
- Query payload contracts are now explicit and safer to evolve.

### Recommended target structure (next iteration)
```text
src/
  domain/
    orders/
    inventory/
    merchants/
  infrastructure/
    supabase/
    offline/
  application/
    services/
    use-cases/
  presentation/
    hooks/
    components/
```

## 7) Progressive migration plan

1. Phase A (done in this iteration)
- Remove wildcard selects on critical paths.
- Add DB indexes + diagnostics SQL.
- Upgrade offline persistence to IndexedDB + background sync.
- Harden metadata/sitemap/robots.

2. Phase B
- Move heavy dashboard aggregations to Edge Functions / SQL views with pagination and server-side filtering.
- Introduce shared query hooks with normalized caching (`react-query` + typed query keys).

3. Phase C
- Convert heavy public client pages (`/search`, `/p/[slug]`, `/m/[slug]`) to server-first shells + client islands.
- Add route-level streaming and partial hydration where useful.

4. Phase D
- Add automated Lighthouse CI + bundle budget gates in CI.
- Add query latency SLO dashboards (`pg_stat_statements` snapshots).

## 8) Performance validation checklist

- [ ] Run `docs/sql/performance_diagnostics.sql` in staging and capture slow-query baseline.
- [ ] Apply migration `20260228235900_performance_indexes.sql` in staging.
- [ ] Apply migration `20260228235959_qr_pickup_code_normalized.sql` before deploying `validate-qr`.
- [ ] Re-run Lighthouse on `/search`, `/p/[slug]`, `/m/[slug]`.
- [ ] Verify offline queue replay after reconnect (including SW background sync capable browsers).
- [ ] Validate merchant QR scanning with low-light and weak network scenarios.
- [ ] Verify no RLS regression on orders/transactions/notifications APIs.
