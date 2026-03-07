-- ============================================
-- Tracking + Intelligence Upgrade
-- Date: 2026-03-07
-- ============================================

-- ---------------------------------------------------------------------------
-- 1) user_events hardening (new event types)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_events
  DROP CONSTRAINT IF EXISTS chk_event_type;

ALTER TABLE public.user_events
  ADD CONSTRAINT chk_event_type CHECK (
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
      'product_dwell',
      'intent_signal',
      'price_hesitation',
      'search',
      'custom'
    )
  );

COMMENT ON CONSTRAINT chk_event_type ON public.user_events IS
  'Allowed behavioral event catalog. Keep in sync with src/lib/tracking/types.ts';

-- ---------------------------------------------------------------------------
-- 2) Persistent intelligence overrides (manual or ML-written scores)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_intelligence_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  intent_score numeric(5,2) CHECK (intent_score >= 0 AND intent_score <= 100),
  engagement_score numeric(5,2) CHECK (engagement_score >= 0 AND engagement_score <= 100),
  price_sensitivity_score numeric(5,2) CHECK (price_sensitivity_score >= 0 AND price_sensitivity_score <= 100),
  churn_risk_score numeric(5,2) CHECK (churn_risk_score >= 0 AND churn_risk_score <= 100),

  dynamic_segment text,
  source text NOT NULL DEFAULT 'api',

  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_intelligence_scores_updated_at
  ON public.user_intelligence_scores (updated_at DESC);

ALTER TABLE public.user_intelligence_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_client_access_user_intelligence_scores" ON public.user_intelligence_scores;
CREATE POLICY "no_client_access_user_intelligence_scores"
  ON public.user_intelligence_scores
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.user_intelligence_scores IS
  'Persistent intelligence score overrides written by admin/API/ML pipeline.';

-- ---------------------------------------------------------------------------
-- 3) Materialized rollups
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_user_intelligence_base AS
SELECT
  ue.user_id,
  COUNT(*) FILTER (WHERE ue.event_type = 'session_start') AS total_sessions,
  COUNT(*) FILTER (WHERE ue.event_type = 'page_view') AS total_page_views,
  COUNT(*) FILTER (WHERE ue.event_type = 'product_view') AS total_product_views,
  COUNT(*) FILTER (WHERE ue.event_type = 'add_to_cart') AS total_add_to_carts,
  COUNT(*) FILTER (WHERE ue.event_type = 'purchase') AS total_purchases,
  COUNT(*) FILTER (
    WHERE ue.event_type = 'intent_signal'
      AND COALESCE(ue.metadata->>'signal_type', '') IN ('checkout_interest', 'checkout_form_focus', 'shipping_info_view')
  ) AS total_checkout_intents,
  COUNT(*) FILTER (WHERE ue.event_type = 'price_hesitation') AS total_price_hesitations,
  COUNT(*) FILTER (WHERE ue.event_type = 'search') AS total_search_events,
  SUM(
    CASE
      WHEN ue.event_type = 'product_dwell'
        AND COALESCE(ue.metadata->>'duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN (ue.metadata->>'duration_ms')::numeric
      ELSE 0
    END
  ) AS total_product_dwell_ms,
  SUM(
    CASE
      WHEN ue.event_type = 'time_on_page'
        AND COALESCE(ue.metadata->>'duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN (ue.metadata->>'duration_ms')::numeric
      ELSE 0
    END
  ) AS total_time_on_page_ms,
  MAX(ue.created_at) AS last_active_at,
  MIN(ue.created_at) AS first_seen_at
FROM public.user_events ue
WHERE ue.user_id IS NOT NULL
GROUP BY ue.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_intelligence_base_user_id
  ON public.mv_user_intelligence_base (user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_product_performance_base AS
SELECT
  COALESCE(ue.metadata->>'product_id', '') AS product_id,
  COUNT(*) FILTER (WHERE ue.event_type = 'product_view') AS total_views,
  COUNT(*) FILTER (WHERE ue.event_type = 'add_to_cart') AS total_add_to_carts,
  COUNT(*) FILTER (WHERE ue.event_type = 'purchase') AS total_purchases,
  SUM(
    CASE
      WHEN ue.event_type = 'product_dwell'
        AND COALESCE(ue.metadata->>'duration_ms', '') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN (ue.metadata->>'duration_ms')::numeric
      ELSE 0
    END
  ) AS total_dwell_ms,
  MAX(ue.created_at) AS last_event_at
FROM public.user_events ue
WHERE ue.metadata ? 'product_id'
  AND COALESCE(ue.metadata->>'product_id', '') <> ''
GROUP BY COALESCE(ue.metadata->>'product_id', '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_product_performance_base_product_id
  ON public.mv_product_performance_base (product_id);

-- ---------------------------------------------------------------------------
-- 4) Intelligence views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.user_scoring AS
SELECT
  u.id AS user_id,
  COALESCE(base.total_sessions, 0) AS total_sessions,
  COALESCE(base.total_page_views, 0) AS total_page_views,
  COALESCE(base.total_product_views, 0) AS total_product_views,
  COALESCE(base.total_add_to_carts, 0) AS total_add_to_carts,
  COALESCE(base.total_purchases, 0) AS total_purchases,
  COALESCE(base.total_checkout_intents, 0) AS total_checkout_intents,
  COALESCE(base.total_price_hesitations, 0) AS total_price_hesitations,
  COALESCE(base.total_search_events, 0) AS total_search_events,
  COALESCE(base.total_product_dwell_ms, 0) AS total_product_dwell_ms,
  COALESCE(base.total_time_on_page_ms, 0) AS total_time_on_page_ms,
  base.first_seen_at,
  base.last_active_at,

  LEAST(
    100,
    (
      COALESCE(base.total_add_to_carts, 0) * 12 +
      COALESCE(base.total_checkout_intents, 0) * 14 +
      COALESCE(base.total_product_views, 0) * 1.2
    )
  )::numeric(5,2) AS intent_score,

  LEAST(
    100,
    (
      COALESCE(base.total_page_views, 0) * 1.1 +
      COALESCE(base.total_sessions, 0) * 4 +
      (COALESCE(base.total_time_on_page_ms, 0) / 60000.0)
    )
  )::numeric(5,2) AS engagement_score,

  LEAST(
    100,
    CASE
      WHEN COALESCE(base.total_page_views, 0) = 0 THEN 0
      ELSE (
        (COALESCE(base.total_price_hesitations, 0) * 100.0) /
        GREATEST(1, base.total_page_views)
      ) * 3
    END
  )::numeric(5,2) AS price_sensitivity_score,

  LEAST(
    100,
    CASE
      WHEN base.last_active_at IS NULL THEN 100
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - base.last_active_at)) / 86400.0 * 3)
    END
  )::numeric(5,2) AS churn_risk_score
FROM auth.users u
LEFT JOIN public.mv_user_intelligence_base base ON base.user_id = u.id;

CREATE OR REPLACE VIEW public.user_segments AS
SELECT
  s.*,
  CASE
    WHEN s.total_purchases >= 8 AND s.churn_risk_score < 20 THEN 'Whales'
    WHEN s.price_sensitivity_score >= 60 THEN 'Price-Sensitive'
    WHEN s.churn_risk_score >= 75 AND s.total_sessions >= 3 THEN 'At-Risk'
    WHEN s.intent_score >= 65 AND s.total_purchases = 0 THEN 'Hot Prospect'
    WHEN s.engagement_score >= 50 AND s.total_purchases = 0 THEN 'Engaged Browser'
    WHEN s.total_sessions <= 1 AND s.total_page_views <= 2 THEN 'New Visitor'
    ELSE 'Regular'
  END AS dynamic_segment
FROM public.user_scoring s;

CREATE OR REPLACE VIEW public.product_performance AS
SELECT
  p.product_id,
  p.total_views,
  p.total_add_to_carts,
  p.total_purchases,
  p.total_dwell_ms,
  p.last_event_at,
  (p.total_purchases::numeric / NULLIF(p.total_views, 0))::numeric(10,4) AS conversion_rate,
  (p.total_dwell_ms / NULLIF(p.total_views, 0))::numeric(12,2) AS avg_view_time_ms,
  (
    (p.total_purchases::numeric / NULLIF(p.total_views, 0)) /
    NULLIF((p.total_dwell_ms / NULLIF(p.total_views, 0)) / 1000.0, 0)
  )::numeric(12,6) AS conversion_rate_per_view_time
FROM public.mv_product_performance_base p;

COMMENT ON VIEW public.user_scoring IS
  'User scoring view (Intent, Engagement, Price Sensitivity, Churn Risk) derived from behavioral events.';
COMMENT ON VIEW public.user_segments IS
  'Behavioral/RFM user segmentation view (Whales, Price-Sensitive, At-Risk, etc.).';
COMMENT ON VIEW public.product_performance IS
  'Product conversion and engagement performance view derived from product visibility and conversion events.';

-- ---------------------------------------------------------------------------
-- 5) Helper functions for app + ops
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_intelligence()
RETURNS TABLE (
  intent_score float,
  engagement_score float,
  price_sensitivity_score float,
  churn_risk_score float,
  dynamic_segment text
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(override.intent_score, seg.intent_score)::float,
    COALESCE(override.engagement_score, seg.engagement_score)::float,
    COALESCE(override.price_sensitivity_score, seg.price_sensitivity_score)::float,
    COALESCE(override.churn_risk_score, seg.churn_risk_score)::float,
    COALESCE(override.dynamic_segment, seg.dynamic_segment)
  FROM public.user_segments seg
  LEFT JOIN public.user_intelligence_scores override ON override.user_id = seg.user_id
  WHERE seg.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_my_intelligence() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_intelligence_materialized_views()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_user_intelligence_base;
  REFRESH MATERIALIZED VIEW public.mv_product_performance_base;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.refresh_intelligence_materialized_views() TO service_role;

-- Prime materialized views after migration
REFRESH MATERIALIZED VIEW public.mv_user_intelligence_base;
REFRESH MATERIALIZED VIEW public.mv_product_performance_base;
