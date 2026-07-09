-- ============================================
-- Include admin-role users in get_admin_clients()
-- Date: 2026-07-09
--
-- The admin "Clients" page needs to list and manage admin accounts too
-- (bulk role change / bulk delete from the UI), but this RPC excluded
-- role='admin' entirely, making admins invisible in that list.
-- ============================================

BEGIN;

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
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_clients(int, int) TO authenticated;

COMMIT;
