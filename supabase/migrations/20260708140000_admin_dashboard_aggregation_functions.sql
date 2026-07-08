-- ============================================
-- Admin dashboard: push aggregation down to SQL
-- Date: 2026-07-08
--
-- src/services/admin.service.ts (getKPIs, getGeoDistribution, getSalesStats,
-- getTopMerchants, getClients) fetched broad/unfiltered row sets over
-- PostgREST and aggregated them in JS. Worse: those calls run through the
-- browser (anon-key) Supabase client, which is bound by RLS - and `orders`
-- has no admin-read policy, so every one of those order-derived numbers
-- (revenue, sales count, average order value, per-client spend, the sales
-- chart, top-merchant revenue) was silently zero for every admin. These
-- SECURITY DEFINER functions fix both: the aggregation happens once in
-- Postgres, and each function explicitly checks is_admin() itself rather
-- than depending on a missing RLS policy.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
RETURNS TABLE (
  total_merchants bigint,
  active_merchants bigint,
  pending_merchants bigint,
  refused_merchants bigint,
  total_clients bigint,
  active_products bigint,
  total_sales bigint,
  total_revenue bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.merchants),
    (SELECT count(*) FROM public.merchants WHERE is_verified AND is_active),
    (SELECT count(*) FROM public.merchants WHERE NOT is_verified AND NOT COALESCE(is_refused, false)),
    (SELECT count(*) FROM public.merchants WHERE is_refused),
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.food_items WHERE is_available),
    (SELECT count(*) FROM public.orders),
    (SELECT COALESCE(sum(total_price), 0) FROM public.orders);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_geo_distribution()
RETURNS TABLE (city text, merchant_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.city, count(*)::bigint AS merchant_count
  FROM public.merchants m
  WHERE m.is_active = true
  GROUP BY m.city
  ORDER BY merchant_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_geo_distribution() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_sales_stats(p_days int DEFAULT 7)
RETURNS TABLE (day_date date, orders_count bigint, revenue bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('day', o.created_at)::date AS day_date,
    count(*)::bigint AS orders_count,
    COALESCE(sum(o.total_price), 0)::bigint AS revenue
  FROM public.orders o
  WHERE o.created_at >= (now() - (p_days || ' days')::interval)
  GROUP BY 1
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_sales_stats(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_top_merchants(p_limit int DEFAULT 5)
RETURNS TABLE (
  id uuid,
  business_name text,
  rating numeric,
  orders_count bigint,
  revenue bigint,
  products_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH top_merchants AS (
    SELECT m.id, m.business_name, m.rating
    FROM public.merchants m
    WHERE m.is_verified = true AND m.is_active = true
    ORDER BY m.rating DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT
    tm.id,
    tm.business_name,
    tm.rating,
    COALESCE(o.orders_count, 0),
    COALESCE(o.revenue, 0),
    COALESCE(f.products_count, 0)
  FROM top_merchants tm
  LEFT JOIN LATERAL (
    SELECT count(*) AS orders_count, sum(total_price) AS revenue
    FROM public.orders
    WHERE merchant_id = tm.id
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS products_count
    FROM public.food_items
    WHERE merchant_id = tm.id
  ) f ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_top_merchants(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_clients(p_limit int DEFAULT 100, p_offset int DEFAULT 0)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  email text,
  phone text,
  full_name text,
  city text,
  quartier text,
  role text,
  created_at timestamptz,
  orders_count bigint,
  total_spent bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.email,
    p.phone,
    p.full_name,
    p.city,
    p.quartier,
    p.role,
    p.created_at,
    COALESCE(o.orders_count, 0),
    COALESCE(o.total_spent, 0)
  FROM public.profiles p
  LEFT JOIN (
    SELECT o2.user_id, count(*) AS orders_count, sum(o2.total_price) AS total_spent
    FROM public.orders o2
    GROUP BY o2.user_id
  ) o ON o.user_id = p.user_id
  WHERE p.role IN ('user', 'merchant')
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_clients(int, int) TO authenticated;

COMMIT;
