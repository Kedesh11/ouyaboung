-- ============================================
-- Behavioral Tracking – user_events table
-- Date: 2026-03-02
-- Architecture: Event-Driven, partition-ready, RLS enforced
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. ENUM-LIKE check constraint for event types
--    Use a CHECK constraint (not PG ENUM) so we can ADD values without ALTER TYPE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_events (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- User linkage (nullable → supports anonymous sessions)
  user_id      uuid        REFERENCES auth.users (id) ON DELETE SET NULL,

  -- Session & routing context
  session_id   text        NOT NULL,
  event_type   text        NOT NULL,
  route        text        NOT NULL,

  -- Optional flexible metadata (click coords, scroll %, product id, etc.)
  metadata     jsonb       NOT NULL DEFAULT '{}',

  -- Device & network context
  device_type  text        CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown')),
  user_agent   text,
  referrer     text,

  -- Immutable timestamp (set by DB to prevent client tampering)
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Soft constraint on event_type – extend freely in application layer
  CONSTRAINT chk_event_type CHECK (
    event_type IN (
      'page_view',
      'scroll_depth',
      'time_on_page',
      'visibility_change',
      'session_start',
      'session_end',
      'route_change',
      'click',
      'add_to_cart',
      'remove_from_cart',
      'purchase',
      'order_abandon',
      'product_view',
      'search',
      'custom'
    )
  )
);

-- ---------------------------------------------------------------------------
-- 2. PARTITIONING STRATEGY (future)
-- ---------------------------------------------------------------------------
-- When volume exceeds ~10M rows/month, migrate to declarative partitioning:
--
--   CREATE TABLE public.user_events (…) PARTITION BY RANGE (created_at);
--   CREATE TABLE public.user_events_2026_03
--     PARTITION OF public.user_events
--     FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
--
-- Use pg_partman or a cron job for automated monthly partition creation.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. INDEXES – tuned for analytics query patterns
-- ---------------------------------------------------------------------------

-- Funnel / cohort: user timeline
CREATE INDEX IF NOT EXISTS idx_ue_user_created_at
  ON public.user_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Session replay / session stitching
CREATE INDEX IF NOT EXISTS idx_ue_session_created_at
  ON public.user_events (session_id, created_at ASC);

-- Heatmap / route-level analytics
CREATE INDEX IF NOT EXISTS idx_ue_route_type_created_at
  ON public.user_events (route, event_type, created_at DESC);

-- Global event stream (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_ue_type_created_at
  ON public.user_events (event_type, created_at DESC);

-- Flexible metadata search (e.g., product_id, category)
CREATE INDEX IF NOT EXISTS idx_ue_metadata_gin
  ON public.user_events USING GIN (metadata);

-- High-cardinality range scans by date only (partitioning fallback)
CREATE INDEX IF NOT EXISTS idx_ue_created_at
  ON public.user_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Block ALL direct client access (anon + authenticated).
-- Only the service-role key (server-side Next.js API route) can insert/read.
CREATE POLICY "no_client_access_user_events"
  ON public.user_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 5. COMMENTS for future maintainers
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.user_events           IS 'Behavioral tracking events. Inserted in batch by the Next.js API route using the service-role key. No direct client access.';
COMMENT ON COLUMN public.user_events.session_id IS 'Browser-tab-scoped session UUID stored in sessionStorage. Resets on new tab/window.';
COMMENT ON COLUMN public.user_events.metadata   IS 'Flexible JSON payload: scroll %, click target, product_id, duration_ms, etc.';
COMMENT ON COLUMN public.user_events.device_type IS 'Bucketed from screen width on the client: mobile(<768), tablet(<1024), desktop(>=1024).';

-- ---------------------------------------------------------------------------
-- 6. Keep planner statistics fresh
-- ---------------------------------------------------------------------------
ANALYZE public.user_events;
