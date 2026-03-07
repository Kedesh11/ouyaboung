# Implementation Plan – Tracking & Intelligence (Phase Delivery)

## Phase 1 – Planning
### Architecture exploration snapshot
- Next.js 15 App Router with root providers in `app/layout.tsx`
- Supabase integration through API routes + edge functions + SQL migrations
- Existing auth/session state managed by `src/contexts/AuthContext.tsx`
- Existing offline persistence in `src/lib/offline/indexeddb.ts` (KV store)
- Tracking baseline already present in `src/lib/tracking/*` and `src/hooks/usePageTracking.ts`

### Delivery strategy
1. Audit existing tracking/intelligence stack (Next.js + Supabase + offline layer)
2. Identify gaps against requested phases
3. Execute missing work in incremental batches with type-check after integration

### User approval checkpoint
- Plan documented here for review before production rollout.
- Manual acceptance criteria listed in validation section.

## Phase 2 – Database
- Upgrade `user_events` constraints and event catalog
- Add `user_intelligence_scores` table (override/writeback)
- Add RLS (no direct client access)

## Phase 3/4 – Tracking Core + React
- Harden queue, session, tracker, auto-trackers
- Add cursor-based IndexedDB draining
- Ensure `TrackingProvider` and `usePageTracking` wire global auto-tracking

## Phase 5/6 – API + Offline Reliability
- Harden `/api/analytics/events` with Zod + IP sliding-window limit
- Keep structured response contract
- Offline sync via `navigator.onLine`, `online/offline` events, retry backoff

## Phase 8/9/10 – Intelligence Layer + Frontend Signals
- Add materialized views + views (`user_scoring`, `user_segments`, `product_performance`)
- Add product visibility, intent, and price-sensitivity event capture
- Enhance `useCustomerIntelligence` and provide personalization banner example

## Phase 11/12/13 – Documentation + ML + Integration APIs
- Add intelligence strategy and ML contracts in `/brain`
- Add analytics API documentation
- Add `/api/analytics/export` and `/api/analytics/intelligence`

## Validation
- TypeScript build (`npm run type-check`)
- Lint check
- Manual browser and Supabase verification checklist
