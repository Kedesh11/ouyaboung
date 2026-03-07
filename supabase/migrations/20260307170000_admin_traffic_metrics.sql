-- ============================================
-- Admin Traffic Metrics Functions
-- Date: 2026-03-07
-- ============================================

-- Daily traffic aggregation for admin dashboards.
CREATE OR REPLACE FUNCTION public.get_admin_traffic_daily(p_window_days integer DEFAULT 30)
RETURNS TABLE (
  period_date date,
  visitors bigint,
  authenticated_visitors bigint,
  sessions bigint,
  page_views bigint,
  pwa_installs bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH params AS (
  SELECT GREATEST(1, LEAST(COALESCE(p_window_days, 30), 120))::int AS window_days
),
date_grid AS (
  SELECT generate_series(
    current_date - ((SELECT window_days FROM params) - 1),
    current_date,
    interval '1 day'
  )::date AS period_date
),
events AS (
  SELECT
    ue.created_at::date AS period_date,
    ue.event_type,
    ue.session_id,
    ue.user_id,
    ue.metadata
  FROM public.user_events ue
  WHERE ue.created_at >= (current_date - ((SELECT window_days FROM params) - 1))
    AND ue.created_at < (current_date + interval '1 day')
    AND ue.event_type IN ('page_view', 'session_start', 'custom')
),
daily_base AS (
  SELECT
    e.period_date,
    COUNT(*) FILTER (WHERE e.event_type = 'page_view') AS page_views,
    COUNT(DISTINCT e.session_id) FILTER (
      WHERE e.event_type IN ('page_view', 'session_start')
    ) AS sessions,
    COUNT(DISTINCT CASE
      WHEN e.event_type = 'page_view'
      THEN COALESCE(e.user_id::text, 'anon:' || e.session_id)
      ELSE NULL
    END) AS visitors,
    COUNT(DISTINCT CASE
      WHEN e.event_type = 'page_view' AND e.user_id IS NOT NULL
      THEN e.user_id
      ELSE NULL
    END) AS authenticated_visitors,
    COUNT(*) FILTER (
      WHERE e.event_type = 'custom'
        AND (
          (
            COALESCE(e.metadata->>'category', '') = 'pwa'
            AND COALESCE(e.metadata->>'action', '') = 'app_installed'
          )
          OR COALESCE(e.metadata->>'event_name', '') IN ('pwa_install', 'app_installed')
        )
    ) AS pwa_installs
  FROM events e
  GROUP BY e.period_date
)
SELECT
  g.period_date,
  COALESCE(d.visitors, 0)::bigint AS visitors,
  COALESCE(d.authenticated_visitors, 0)::bigint AS authenticated_visitors,
  COALESCE(d.sessions, 0)::bigint AS sessions,
  COALESCE(d.page_views, 0)::bigint AS page_views,
  COALESCE(d.pwa_installs, 0)::bigint AS pwa_installs
FROM date_grid g
LEFT JOIN daily_base d ON d.period_date = g.period_date
ORDER BY g.period_date;
$$;

-- Global summary metrics used by the admin dashboard.
CREATE OR REPLACE FUNCTION public.get_admin_traffic_summary()
RETURNS TABLE (
  total_pwa_installs bigint,
  pwa_installs_30d bigint,
  unique_visitors_30d bigint,
  recurring_visitors_7d bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH install_events AS (
  SELECT ue.created_at
  FROM public.user_events ue
  WHERE ue.event_type = 'custom'
    AND (
      (
        COALESCE(ue.metadata->>'category', '') = 'pwa'
        AND COALESCE(ue.metadata->>'action', '') = 'app_installed'
      )
      OR COALESCE(ue.metadata->>'event_name', '') IN ('pwa_install', 'app_installed')
    )
),
visitor_events_30d AS (
  SELECT DISTINCT COALESCE(ue.user_id::text, 'anon:' || ue.session_id) AS visitor_id
  FROM public.user_events ue
  WHERE ue.event_type = 'page_view'
    AND ue.created_at >= (current_date - interval '29 days')
    AND ue.created_at < (current_date + interval '1 day')
),
visitor_days_7d AS (
  SELECT
    COALESCE(ue.user_id::text, 'anon:' || ue.session_id) AS visitor_id,
    COUNT(DISTINCT ue.created_at::date) AS active_days
  FROM public.user_events ue
  WHERE ue.event_type = 'page_view'
    AND ue.created_at >= (current_date - interval '6 days')
    AND ue.created_at < (current_date + interval '1 day')
  GROUP BY COALESCE(ue.user_id::text, 'anon:' || ue.session_id)
)
SELECT
  (SELECT COUNT(*)::bigint FROM install_events) AS total_pwa_installs,
  (
    SELECT COUNT(*)::bigint
    FROM install_events i
    WHERE i.created_at >= (current_date - interval '29 days')
      AND i.created_at < (current_date + interval '1 day')
  ) AS pwa_installs_30d,
  (SELECT COUNT(*)::bigint FROM visitor_events_30d) AS unique_visitors_30d,
  (
    SELECT COUNT(*)::bigint
    FROM visitor_days_7d v
    WHERE v.active_days >= 2
  ) AS recurring_visitors_7d;
$$;

REVOKE ALL ON FUNCTION public.get_admin_traffic_daily(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_traffic_summary() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_traffic_daily(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_traffic_summary() TO service_role;

COMMENT ON FUNCTION public.get_admin_traffic_daily(integer) IS
  'Returns daily platform traffic metrics (visitors, sessions, page views, PWA installs) for a rolling window.';
COMMENT ON FUNCTION public.get_admin_traffic_summary() IS
  'Returns aggregated platform traffic metrics (PWA installs and recurring visitors) for admin dashboards.';
