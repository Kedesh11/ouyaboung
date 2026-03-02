-- ============================================
-- Customer Behavior Intelligence System (CBIS)
-- Date: 2026-03-02
-- Purpose: Aggregate raw events into actionable intelligence (Scores, Segments)
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. Helper Function: Calculate Recency Score
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_recency_score(last_date timestamptz)
RETURNS float AS $$
BEGIN
  -- Score 0-100 based on how recently the user was active (max 30 days)
  RETURN GREATEST(0, LEAST(100, 100 - (EXTRACT(EPOCH FROM (now() - last_date)) / (30 * 24 * 3600) * 100)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 2. Materialized View: User Behavioral Summary
--    Aggregates metrics for faster segmentation.
--    Should be refreshed periodically (e.g., every 1h).
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_user_behavior_summary AS
SELECT
  user_id,
  count(id) filter (where event_type = 'session_start') as total_sessions,
  count(id) filter (where event_type = 'page_view') as total_page_views,
  max(created_at) as last_active_at,
  sum((metadata->>'duration_ms')::numeric) filter (where event_type = 'time_on_page') / 1000 as total_dwell_time_s,
  count(id) filter (where event_type = 'purchase') as total_purchases,
  count(id) filter (where event_type = 'add_to_cart') as total_add_to_carts,
  count(id) filter (where event_type = 'click' and (metadata->>'target')::text ilike '%sort-price%') as price_sort_clicks
FROM public.user_events
WHERE user_id IS NOT NULL
GROUP BY user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ubs_user_id ON public.mv_user_behavior_summary (user_id);

-- ---------------------------------------------------------------------------
-- 3. View: User Intelligence Scoring
--    Calculates Intent, Engagement, and Churn risk.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_user_intelligence_scoring AS
SELECT
  u.id as user_id,
  -- Intent Score: higher if adding to cart or viewing checkout
  LEAST(100, (
    (COALESCE(s.total_add_to_carts, 0) * 20) + 
    (COALESCE(s.total_sessions, 0) * 5)
  )) as intent_score,
  
  -- Engagement Score: based on depth and frequency
  LEAST(100, (
    (COALESCE(s.total_page_views, 0) * 2) + 
    (COALESCE(s.total_dwell_time_s, 0) / 60)
  )) as engagement_score,
  
  -- Price Sensitivity: how often they sort by price vs buy
  CASE 
    WHEN s.total_page_views = 0 THEN 0
    ELSE LEAST(100, (COALESCE(s.price_sort_clicks, 0) * 100.0 / s.total_page_views) * 5) 
  END as price_sensitivity_score,
  
  -- Churn Risk: 100 - Recency
  (100 - public.calculate_recency_score(COALESCE(s.last_active_at, '2000-01-01'))) as churn_risk_score
FROM auth.users u
LEFT JOIN public.mv_user_behavior_summary s ON u.id = s.user_id;

-- ---------------------------------------------------------------------------
-- 4. View: Automated User Segments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_user_segments AS
SELECT
  user_id,
  intent_score,
  engagement_score,
  price_sensitivity_score,
  churn_risk_score,
  CASE
    WHEN total_purchases >= 5 AND churn_risk_score < 20 THEN 'Champion'
    WHEN intent_score > 70 AND total_purchases = 0 THEN 'Hot Prospect'
    WHEN price_sensitivity_score > 50 THEN 'Price Hunter'
    WHEN engagement_score < 10 AND churn_risk_score > 80 THEN 'Hibernating'
    WHEN engagement_score > 50 AND total_purchases = 0 THEN 'Engaged browser'
    ELSE 'Regular'
  END as dynamic_segment
FROM public.v_user_intelligence_scoring scoring
JOIN public.mv_user_behavior_summary summary USING (user_id);

-- ---------------------------------------------------------------------------
-- 5. RLS for Intelligence Views
--    We expose these views to the authenticated user so they can personalize their own UI.
-- ---------------------------------------------------------------------------

-- Views don't have RLS themselves in the same way, but we can secure them
-- by ensuring the query filters by auth.uid().

-- ---------------------------------------------------------------------------
-- 6. Helper for UI: Get My Intelligence
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
    s.intent_score::float, 
    s.engagement_score::float, 
    s.price_sensitivity_score::float, 
    s.churn_risk_score::float, 
    seg.dynamic_segment
  FROM v_user_intelligence_scoring s
  JOIN v_user_segments seg USING (user_id)
  WHERE s.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_intelligence() TO authenticated;
