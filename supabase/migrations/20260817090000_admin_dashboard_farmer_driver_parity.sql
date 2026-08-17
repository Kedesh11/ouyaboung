-- ============================================
-- Admin dashboard parity: farmers & drivers get the
-- same KPI / geo-distribution data as merchants.
-- ============================================

DROP FUNCTION IF EXISTS public.get_admin_dashboard_kpis();

CREATE FUNCTION public.get_admin_dashboard_kpis()
RETURNS TABLE (
  total_merchants bigint,
  active_merchants bigint,
  pending_merchants bigint,
  refused_merchants bigint,
  total_farmers bigint,
  active_farmers bigint,
  pending_farmers bigint,
  refused_farmers bigint,
  total_drivers bigint,
  active_drivers bigint,
  pending_drivers bigint,
  refused_drivers bigint,
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
    (SELECT count(*) FROM public.farmers),
    (SELECT count(*) FROM public.farmers WHERE is_verified AND is_active),
    (SELECT count(*) FROM public.farmers WHERE NOT is_verified AND NOT COALESCE(is_refused, false)),
    (SELECT count(*) FROM public.farmers WHERE is_refused),
    (SELECT count(*) FROM public.drivers),
    (SELECT count(*) FROM public.drivers WHERE is_verified AND is_active),
    (SELECT count(*) FROM public.drivers WHERE NOT is_verified AND NOT COALESCE(is_refused, false)),
    (SELECT count(*) FROM public.drivers WHERE is_refused),
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.food_items WHERE is_available),
    (SELECT count(*) FROM public.orders),
    (SELECT COALESCE(sum(total_price), 0) FROM public.orders);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() TO authenticated;

DROP FUNCTION IF EXISTS public.get_admin_geo_distribution();

CREATE FUNCTION public.get_admin_geo_distribution()
RETURNS TABLE (city text, merchant_count bigint, farmer_count bigint, driver_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(m.city, f.city, d.city) AS city,
    COALESCE(m.cnt, 0) AS merchant_count,
    COALESCE(f.cnt, 0) AS farmer_count,
    COALESCE(d.cnt, 0) AS driver_count
  FROM
    (SELECT city, count(*) AS cnt FROM public.merchants WHERE is_active = true GROUP BY city) m
    FULL OUTER JOIN (SELECT city, count(*) AS cnt FROM public.farmers WHERE is_active = true GROUP BY city) f
      ON f.city = m.city
    FULL OUTER JOIN (SELECT city, count(*) AS cnt FROM public.drivers WHERE is_active = true GROUP BY city) d
      ON d.city = COALESCE(m.city, f.city)
  ORDER BY merchant_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_geo_distribution() TO authenticated;
