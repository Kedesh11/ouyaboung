-- ============================================
-- Merchant geospatial search support
-- Date: 2026-06-20
-- Purpose:
--   Move merchant radius lookups toward PostGIS-backed distance checks.
--   This keeps latitude/longitude as the writable source of truth while
--   exposing an indexed generated geography column for nearby searches.
-- ============================================

BEGIN;

SET LOCAL search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      WHEN latitude < -90 OR latitude > 90 THEN NULL
      WHEN longitude < -180 OR longitude > 180 THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS merchants_location_gist_idx
  ON public.merchants
  USING gist (location);

CREATE OR REPLACE FUNCTION public.nearby_available_merchants(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision DEFAULT 10
)
RETURNS TABLE (
  merchant_id uuid,
  distance_km double precision,
  available_items_count bigint,
  total_quantity bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH origin AS (
    SELECT ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography AS geog
  )
  SELECT
    m.id AS merchant_id,
    ST_Distance(m.location, origin.geog) / 1000 AS distance_km,
    COUNT(fi.id) AS available_items_count,
    COALESCE(SUM(fi.quantity_available), 0)::bigint AS total_quantity
  FROM public.merchants m
  JOIN public.food_items fi ON fi.merchant_id = m.id
  CROSS JOIN origin
  WHERE p_radius_km > 0
    AND p_latitude BETWEEN -90 AND 90
    AND p_longitude BETWEEN -180 AND 180
    AND m.location IS NOT NULL
    AND m.is_active IS TRUE
    AND m.is_verified IS TRUE
    AND COALESCE(m.is_refused, false) IS FALSE
    AND fi.is_available IS TRUE
    AND fi.quantity_available > 0
    AND ST_DWithin(m.location, origin.geog, p_radius_km * 1000)
  GROUP BY m.id, m.location, origin.geog
  ORDER BY distance_km ASC;
$$;

REVOKE ALL ON FUNCTION public.nearby_available_merchants(double precision, double precision, double precision)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearby_available_merchants(double precision, double precision, double precision)
  TO anon, authenticated;

COMMENT ON FUNCTION public.nearby_available_merchants(double precision, double precision, double precision) IS
  'Returns active verified merchants with available products within a radius, ordered by PostGIS distance.';

COMMIT;
