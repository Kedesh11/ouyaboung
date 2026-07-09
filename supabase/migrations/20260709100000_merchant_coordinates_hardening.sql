-- ============================================
-- Merchant coordinates hardening
-- Date: 2026-07-09
--
-- Root cause: merchants.latitude/longitude had no DEFAULT and no CHECK
-- constraint, so several write paths (an old version of the "Mon commerce"
-- form that defaulted unset coordinates to 0, the auth trigger reading
-- raw_user_meta_data, the profile-linking trigger) could silently persist
-- (0,0) ("Null Island", nowhere near Gabon) or leave the columns NULL.
-- That bad data then made real products vanish from the public marketplace,
-- because the search page computed a bogus multi-thousand-km distance for
-- those merchants and filtered them out of the default nearby radius.
--
-- This migration keeps the same bounds as GABON_LOCATION_BOUNDS in
-- src/services/geolocation.service.ts (lat -4.2..2.6, lng 8.4..14.8) so
-- application and database agree on what a plausible merchant location is.
-- ============================================

BEGIN;

-- 1) Clean up existing bad data before adding the CHECK constraint below
--    (a constraint can't be added while violating rows exist). Any
--    out-of-Gabon pair is not a real shop location, so null it out rather
--    than guess a correction.
UPDATE public.merchants
SET latitude = NULL,
    longitude = NULL,
    updated_at = now()
WHERE (latitude IS NOT NULL OR longitude IS NOT NULL)
  AND (
    latitude IS NULL OR longitude IS NULL
    OR latitude < -4.2 OR latitude > 2.6
    OR longitude < 8.4 OR longitude > 14.8
  );

-- 2) Prevent any future write (app code, trigger, RPC, manual UPDATE) from
--    persisting a coordinate pair outside Gabon. Both columns must be set
--    together (no half pair) and, when set, must fall within Gabon bounds.
ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_coordinates_within_gabon_check;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_coordinates_within_gabon_check
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (
      latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN -4.2 AND 2.6
      AND longitude BETWEEN 8.4 AND 14.8
    )
  );

-- 3) Sanitize the auth-signup trigger: a bad/garbage value in
--    raw_user_meta_data must become NULL, not violate the new constraint
--    and fail the whole account creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
AS $$
DECLARE
  v_latitude double precision;
  v_longitude double precision;
BEGIN
  IF new.raw_user_meta_data->>'role' = 'merchant' THEN
    BEGIN
      v_latitude := NULLIF(new.raw_user_meta_data->>'latitude', '')::double precision;
    EXCEPTION WHEN OTHERS THEN
      v_latitude := NULL;
    END;

    BEGIN
      v_longitude := NULLIF(new.raw_user_meta_data->>'longitude', '')::double precision;
    EXCEPTION WHEN OTHERS THEN
      v_longitude := NULL;
    END;

    IF v_latitude IS NULL OR v_longitude IS NULL
       OR v_latitude < -4.2 OR v_latitude > 2.6
       OR v_longitude < 8.4 OR v_longitude > 14.8 THEN
      v_latitude := NULL;
      v_longitude := NULL;
    END IF;

    INSERT INTO public.merchants (
      user_id,
      email,
      business_name,
      business_type,
      description,
      phone,
      address,
      city,
      quartier,
      latitude,
      longitude,
      logo_url,
      is_verified,
      is_active,
      is_refused
    )
    VALUES (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'business_name', 'Nouveau Commerce'),
      coalesce(new.raw_user_meta_data->>'business_type', 'other'),
      coalesce(new.raw_user_meta_data->>'description', ''),
      coalesce(new.raw_user_meta_data->>'phone', ''),
      coalesce(new.raw_user_meta_data->>'address', 'À compléter'),
      coalesce(new.raw_user_meta_data->>'city', 'Libreville'),
      coalesce(new.raw_user_meta_data->>'quartier', 'À compléter'),
      v_latitude,
      v_longitude,
      new.raw_user_meta_data->>'logo_url',
      false, -- is_verified default
      false, -- is_active default (waiting for validation)
      false  -- is_refused default
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- 4) Sanitize the profile-linking trigger the same way.
CREATE OR REPLACE FUNCTION public.ensure_merchant_profile_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_meta jsonb := '{}'::jsonb;
  v_business_name text;
  v_business_type text;
  v_description text;
  v_phone text;
  v_address text;
  v_city text;
  v_quartier text;
  v_latitude double precision;
  v_longitude double precision;
  v_slug text;
  v_linked_id uuid;
BEGIN
  IF COALESCE(NEW.role, '') <> 'merchant' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(raw_user_meta_data, '{}'::jsonb)
  INTO v_meta
  FROM auth.users
  WHERE id = NEW.user_id;

  v_business_name := COALESCE(NULLIF(v_meta->>'business_name', ''), NULLIF(NEW.full_name, ''), SPLIT_PART(NEW.email, '@', 1), 'Mon Commerce');
  v_business_type := COALESCE(NULLIF(v_meta->>'business_type', ''), 'other');
  v_description := COALESCE(v_meta->>'description', '');
  v_phone := COALESCE(NULLIF(v_meta->>'phone', ''), 'À compléter');
  v_address := COALESCE(NULLIF(v_meta->>'address', ''), 'À compléter');
  v_city := COALESCE(NULLIF(v_meta->>'city', ''), 'Libreville');
  v_quartier := COALESCE(NULLIF(v_meta->>'quartier', ''), 'À compléter');

  v_business_type := CASE
    WHEN v_business_type IN ('restaurant','bakery','grocery','supermarket','hotel','caterer','other') THEN v_business_type
    ELSE 'other'
  END;

  v_city := CASE lower(v_city)
    WHEN 'libreville' THEN 'Libreville'
    WHEN 'port-gentil' THEN 'Port-Gentil'
    WHEN 'port gentil' THEN 'Port-Gentil'
    WHEN 'port_gentil' THEN 'Port-Gentil'
    WHEN 'franceville' THEN 'Franceville'
    WHEN 'oyem' THEN 'Oyem'
    WHEN 'moanda' THEN 'Moanda'
    ELSE v_city
  END;

  IF (v_meta ? 'latitude') THEN
    BEGIN
      v_latitude := NULLIF(v_meta->>'latitude', '')::double precision;
    EXCEPTION WHEN OTHERS THEN
      v_latitude := NULL;
    END;
  END IF;

  IF (v_meta ? 'longitude') THEN
    BEGIN
      v_longitude := NULLIF(v_meta->>'longitude', '')::double precision;
    EXCEPTION WHEN OTHERS THEN
      v_longitude := NULL;
    END;
  END IF;

  IF v_latitude IS NULL OR v_longitude IS NULL
     OR v_latitude < -4.2 OR v_latitude > 2.6
     OR v_longitude < 8.4 OR v_longitude > 14.8 THEN
    v_latitude := NULL;
    v_longitude := NULL;
  END IF;

  -- 1) Link pre-registration merchant application (email match)
  UPDATE public.merchants
  SET user_id = NEW.user_id,
      is_active = CASE WHEN is_verified THEN is_active ELSE false END,
      is_refused = COALESCE(is_refused, false),
      updated_at = now()
  WHERE email = NEW.email
    AND user_id IS NULL
  RETURNING id INTO v_linked_id;

  -- 2) If already exists for this user, keep it
  IF v_linked_id IS NULL THEN
    SELECT id
    INTO v_linked_id
    FROM public.merchants
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 3) Create merchant row if still missing
  IF v_linked_id IS NULL THEN
    v_slug := regexp_replace(lower(v_business_name), '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
    IF v_slug = '' THEN
      v_slug := 'commerce';
    END IF;

    INSERT INTO public.merchants (
      user_id,
      business_name,
      business_type,
      description,
      address,
      city,
      quartier,
      phone,
      email,
      latitude,
      longitude,
      rating,
      total_reviews,
      is_verified,
      is_active,
      is_refused,
      slug
    )
    VALUES (
      NEW.user_id,
      v_business_name,
      v_business_type,
      v_description,
      v_address,
      v_city,
      v_quartier,
      v_phone,
      NEW.email,
      v_latitude,
      v_longitude,
      0,
      0,
      false,
      false,
      false,
      CONCAT(v_slug, '-', FLOOR(RANDOM() * 100000)::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
