-- ============================================
-- Fix intelligence materialized view refresh
-- Date: 2026-07-08
--
-- refresh_intelligence_materialized_views() (20260307130000) only refreshed
-- 2 of the 3 intelligence MVs - mv_user_behavior_summary was never included.
-- Worse, nothing ever called this function (no pg_cron job, no application
-- code), so all three MVs have been frozen at their post-migration seed
-- state ever since. All three already have a unique index, so
-- REFRESH ... CONCURRENTLY (non-blocking for readers) is used instead of a
-- plain refresh.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_intelligence_materialized_views()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_user_behavior_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_user_intelligence_base;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_product_performance_base;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.refresh_intelligence_materialized_views() TO service_role;

-- Schedule a periodic refresh. pg_cron ships with the Supabase Postgres
-- image; on Supabase Cloud this extension may need to be enabled from the
-- dashboard (Database > Extensions) first depending on the project's plan,
-- in which case this statement is a no-op until that's done and the
-- migration should be re-applied.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'refresh-intelligence-mv',
  '*/15 * * * *',
  $$SELECT public.refresh_intelligence_materialized_views()$$
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-intelligence-mv'
);

COMMIT;
