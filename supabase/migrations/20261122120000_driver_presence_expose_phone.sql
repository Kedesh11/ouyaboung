-- Phase 1 (suite): l'agriculteur verifie voit le telephone du chauffeur libre pour
-- pouvoir l'appeler. Restent masques: nom complet, email, plaque. L'acces reste
-- limite aux agriculteurs approuves et aux admins (controle dans la fonction).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_available_drivers(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision DEFAULT 50,
  p_vehicle_type text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_radius double precision := LEAST(GREATEST(COALESCE(p_radius_km, 50), 1), 200);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_is_farmer boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  -- Reserve aux agriculteurs approuves (et aux administrateurs).
  SELECT EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.user_id = auth.uid()
      AND f.is_verified IS TRUE
      AND f.is_active IS TRUE
      AND COALESCE(f.is_refused, false) = false
  ) INTO v_is_farmer;

  IF NOT v_is_farmer AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'message', 'Reserve aux agriculteurs approuves.');
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION');
  END IF;

  IF p_vehicle_type IS NOT NULL
     AND p_vehicle_type NOT IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VEHICLE_TYPE');
  END IF;

  WITH candidates AS (
    SELECT
      d.id AS driver_id,
      -- Prenom + initiale du nom: jamais le nom complet, ni email/plaque. Le telephone est expose aux agriculteurs verifies (et admins) pour pouvoir appeler le chauffeur.
      CASE
        WHEN position(' ' IN btrim(d.full_name)) > 0
          THEN split_part(btrim(d.full_name), ' ', 1) || ' '
               || upper(left((regexp_split_to_array(btrim(d.full_name), '\s+'))[array_length(regexp_split_to_array(btrim(d.full_name), '\s+'), 1)], 1)) || '.'
        ELSE btrim(d.full_name)
      END AS display_name,
      d.phone,
      d.vehicle_type,
      d.rating,
      d.total_reviews,
      dp.latitude,
      dp.longitude,
      dp.heading,
      dp.speed,
      dp.updated_at,
      2 * 6371 * asin(sqrt(
        power(sin(radians(dp.latitude - p_latitude) / 2), 2)
        + cos(radians(p_latitude)) * cos(radians(dp.latitude))
          * power(sin(radians(dp.longitude - p_longitude) / 2), 2)
      )) AS distance_km
    FROM public.driver_presence dp
    JOIN public.drivers d ON d.id = dp.driver_id
    WHERE dp.is_available IS TRUE
      AND dp.latitude IS NOT NULL
      AND dp.longitude IS NOT NULL
      AND dp.updated_at > now() - public.driver_presence_max_age()
      AND d.is_verified IS TRUE
      AND d.is_active IS TRUE
      AND COALESCE(d.is_refused, false) = false
      AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
      -- Libre: aucune livraison en cours.
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries dl
        WHERE dl.driver_id = d.id
          AND dl.status IN ('accepted', 'picked_up', 'in_transit')
      )
  ), ranked AS (
    SELECT * FROM candidates
    WHERE distance_km <= v_radius
    ORDER BY distance_km ASC
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'driver_id', r.driver_id,
    'display_name', r.display_name,
    'phone', r.phone,
    'vehicle_type', r.vehicle_type,
    'rating', r.rating,
    'total_reviews', r.total_reviews,
    'latitude', r.latitude,
    'longitude', r.longitude,
    'heading', r.heading,
    'speed', r.speed,
    'updated_at', r.updated_at,
    'age_seconds', floor(extract(epoch FROM (now() - r.updated_at))),
    'distance_km', round(r.distance_km::numeric, 2)
  ) ORDER BY r.distance_km ASC), '[]'::jsonb)
  INTO v_result
  FROM ranked r;

  RETURN jsonb_build_object('success', true, 'drivers', v_result, 'server_time', now());
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_drivers(double precision, double precision, double precision, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_drivers(double precision, double precision, double precision, text, integer) TO authenticated;

COMMIT;
