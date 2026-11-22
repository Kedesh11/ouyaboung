-- Phase 3a: tarif fixe calcule des transports, modifiable par les admins.
--
-- Le prix n'est plus dans le code: il vient de deux tables que seuls les admins peuvent
-- modifier (via RPC), consultables depuis le tableau de bord admin:
--   * transport_tariffs: par type de vehicule, frais de base + prix au km + minimum;
--   * transport_settings: commission de la plateforme et coefficient de detour routier.
-- Valeurs initiales PROVISOIRES, a ajuster par l'admin.
--
-- Calcul (fige a la creation de la demande, donc un changement de tarif ne modifie jamais
-- une course deja commandee):
--   distance = distance a vol d'oiseau pickup -> livraison x coefficient de detour
--   tarif    = max(minimum, base + distance x prix_km), arrondi aux 50 XAF superieurs
--   commission = tarif x taux; net chauffeur = tarif - commission
--
-- Le vehicule determine le prix: en mode manuel, c'est celui du chauffeur choisi; en mode
-- automatique, l'agriculteur le choisit et seuls les chauffeurs de ce type sont sollicites.
-- Les coordonnees de livraison deviennent obligatoires (necessaires au calcul).
--
-- Hors perimetre (Phase 3b): le paiement PVIT de ce tarif.

BEGIN;

------------------------------------------------
-- 1) Tarifs et reglages (admin uniquement)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_tariffs (
  vehicle_type text PRIMARY KEY
    CHECK (vehicle_type IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other')),
  base_fee integer NOT NULL CHECK (base_fee >= 0),
  price_per_km integer NOT NULL CHECK (price_per_km >= 0),
  min_fare integer NOT NULL CHECK (min_fare >= 0),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transport_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  commission_rate numeric(4, 3) NOT NULL DEFAULT 0.100 CHECK (commission_rate >= 0 AND commission_rate <= 0.5),
  road_distance_factor numeric(3, 2) NOT NULL DEFAULT 1.30 CHECK (road_distance_factor >= 1 AND road_distance_factor <= 3),
  max_distance_km integer NOT NULL DEFAULT 500 CHECK (max_distance_km BETWEEN 1 AND 2000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.transport_tariffs (vehicle_type, base_fee, price_per_km, min_fare) VALUES
  ('moto',        1000,  300, 1500),
  ('tricycle',    1500,  400, 2000),
  ('voiture',     2500,  600, 3000),
  ('camionnette', 3000,  800, 4000),
  ('other',       3000,  800, 4000)
ON CONFLICT (vehicle_type) DO NOTHING;

INSERT INTO public.transport_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.transport_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transport_tariffs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.transport_settings FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 2) Tarif fige sur la demande
------------------------------------------------
ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS distance_km numeric(7, 2),
  ADD COLUMN IF NOT EXISTS fare_amount integer CHECK (fare_amount IS NULL OR fare_amount >= 0),
  ADD COLUMN IF NOT EXISTS platform_fee integer CHECK (platform_fee IS NULL OR platform_fee >= 0),
  ADD COLUMN IF NOT EXISTS driver_net integer CHECK (driver_net IS NULL OR driver_net >= 0),
  ADD COLUMN IF NOT EXISTS commission_rate numeric(4, 3);

------------------------------------------------
-- 3) Calcul du tarif (interne)
------------------------------------------------
CREATE OR REPLACE FUNCTION public._transport_compute_fare(
  p_vehicle_type text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tariff public.transport_tariffs;
  v_settings public.transport_settings;
  v_straight double precision;
  v_distance numeric;
  v_raw numeric;
  v_fare integer;
  v_fee integer;
BEGIN
  SELECT * INTO v_tariff FROM public.transport_tariffs
  WHERE vehicle_type = p_vehicle_type AND is_active IS TRUE;
  IF v_tariff.vehicle_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'TARIFF_UNAVAILABLE',
      'message', 'Aucun tarif disponible pour ce vehicule.');
  END IF;

  SELECT * INTO v_settings FROM public.transport_settings WHERE id IS TRUE;

  v_straight := 2 * 6371 * asin(sqrt(
    power(sin(radians(p_dropoff_lat - p_pickup_lat) / 2), 2)
    + cos(radians(p_pickup_lat)) * cos(radians(p_dropoff_lat))
      * power(sin(radians(p_dropoff_lng - p_pickup_lng) / 2), 2)));
  v_distance := round((v_straight * v_settings.road_distance_factor)::numeric, 1);

  IF v_distance > v_settings.max_distance_km THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR',
      'message', format('Distance trop longue (%s km maximum).', v_settings.max_distance_km));
  END IF;

  v_raw := greatest(v_tariff.min_fare, v_tariff.base_fee + ceil(v_distance * v_tariff.price_per_km));
  -- Arrondi aux 50 XAF superieurs.
  v_fare := (ceil(v_raw / 50.0) * 50)::integer;
  v_fee := round(v_fare * v_settings.commission_rate)::integer;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_type', p_vehicle_type,
    'distance_km', v_distance,
    'fare_amount', v_fare,
    'platform_fee', v_fee,
    'driver_net', v_fare - v_fee,
    'commission_rate', v_settings.commission_rate,
    'currency', 'XAF'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._transport_compute_fare(text, double precision, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 4) Devis pour l'agriculteur
------------------------------------------------
CREATE OR REPLACE FUNCTION public.quote_transport(
  p_vehicle_type text,
  p_dropoff_latitude double precision,
  p_dropoff_longitude double precision,
  p_pickup_latitude double precision DEFAULT NULL,
  p_pickup_longitude double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_farmer FROM public.farmers f
  WHERE f.user_id = auth.uid() AND f.is_verified IS TRUE AND f.is_active IS TRUE
    AND COALESCE(f.is_refused, false) = false
  LIMIT 1;
  IF v_farmer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'message', 'Reserve aux agriculteurs approuves.');
  END IF;

  IF p_vehicle_type IS NULL OR p_vehicle_type NOT IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VEHICLE_TYPE');
  END IF;
  IF (p_pickup_latitude IS NULL) <> (p_pickup_longitude IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION');
  END IF;

  v_lat := COALESCE(p_pickup_latitude, v_farmer.latitude);
  v_lng := COALESCE(p_pickup_longitude, v_farmer.longitude);
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PICKUP_REQUIRED',
      'message', 'Indiquez le point de ramassage.');
  END IF;
  IF p_dropoff_latitude IS NULL OR p_dropoff_longitude IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DROPOFF_REQUIRED',
      'message', 'Indiquez la destination sur la carte.');
  END IF;
  IF v_lat NOT BETWEEN -4.5 AND 2.9 OR v_lng NOT BETWEEN 8.1 AND 15.1
     OR p_dropoff_latitude NOT BETWEEN -4.5 AND 2.9 OR p_dropoff_longitude NOT BETWEEN 8.1 AND 15.1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION',
      'message', 'Les points doivent etre au Gabon.');
  END IF;

  RETURN public._transport_compute_fare(p_vehicle_type, v_lat, v_lng, p_dropoff_latitude, p_dropoff_longitude);
END;
$$;

------------------------------------------------
-- 5) Administration des tarifs
------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_transport_pricing()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tariffs', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'vehicle_type', t.vehicle_type, 'base_fee', t.base_fee, 'price_per_km', t.price_per_km,
        'min_fare', t.min_fare, 'is_active', t.is_active, 'updated_at', t.updated_at
      ) ORDER BY t.vehicle_type), '[]'::jsonb) FROM public.transport_tariffs t),
    'settings', (SELECT jsonb_build_object(
        'commission_rate', s.commission_rate, 'road_distance_factor', s.road_distance_factor,
        'max_distance_km', s.max_distance_km, 'updated_at', s.updated_at
      ) FROM public.transport_settings s WHERE s.id IS TRUE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_transport_tariff(
  p_vehicle_type text,
  p_base_fee integer,
  p_price_per_km integer,
  p_min_fare integer,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.transport_tariffs;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF p_base_fee IS NULL OR p_price_per_km IS NULL OR p_min_fare IS NULL OR p_is_active IS NULL
     OR p_base_fee < 0 OR p_price_per_km < 0 OR p_min_fare < 0
     OR p_base_fee > 10000000 OR p_price_per_km > 1000000 OR p_min_fare > 10000000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'Montants invalides (entiers positifs en XAF).');
  END IF;

  UPDATE public.transport_tariffs
  SET base_fee = p_base_fee, price_per_km = p_price_per_km, min_fare = p_min_fare,
      is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
  WHERE vehicle_type = p_vehicle_type
  RETURNING * INTO v_row;

  IF v_row.vehicle_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true, 'tariff', jsonb_build_object(
    'vehicle_type', v_row.vehicle_type, 'base_fee', v_row.base_fee, 'price_per_km', v_row.price_per_km,
    'min_fare', v_row.min_fare, 'is_active', v_row.is_active, 'updated_at', v_row.updated_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_transport_settings(
  p_commission_rate numeric,
  p_road_distance_factor numeric,
  p_max_distance_km integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.transport_settings;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;
  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 0.5 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'La commission doit etre comprise entre 0 % et 50 %.');
  END IF;
  IF p_road_distance_factor IS NULL OR p_road_distance_factor < 1 OR p_road_distance_factor > 3 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'Le coefficient de detour doit etre compris entre 1 et 3.');
  END IF;
  IF p_max_distance_km IS NULL OR p_max_distance_km < 1 OR p_max_distance_km > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'La distance maximale doit etre comprise entre 1 et 2000 km.');
  END IF;

  UPDATE public.transport_settings
  SET commission_rate = p_commission_rate, road_distance_factor = p_road_distance_factor,
      max_distance_km = p_max_distance_km, updated_by = auth.uid(), updated_at = now()
  WHERE id IS TRUE
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'settings', jsonb_build_object(
    'commission_rate', v_row.commission_rate, 'road_distance_factor', v_row.road_distance_factor,
    'max_distance_km', v_row.max_distance_km, 'updated_at', v_row.updated_at));
END;
$$;


------------------------------------------------
-- 6) Vues: tarif visible de l'agriculteur et du chauffeur
------------------------------------------------
CREATE OR REPLACE FUNCTION public._transport_farmer_view(r public.transport_requests)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_presence public.driver_presence;
  v_driver_id uuid := COALESCE(r.driver_id, r.current_driver_id);
  v_driver_json jsonb := NULL;
BEGIN
  IF v_driver_id IS NOT NULL THEN
    SELECT * INTO v_driver FROM public.drivers WHERE id = v_driver_id;
    v_driver_json := jsonb_build_object(
      'driver_id', v_driver.id,
      'display_name', public._driver_display_name(v_driver.full_name),
      'vehicle_type', v_driver.vehicle_type,
      'rating', v_driver.rating,
      'total_reviews', v_driver.total_reviews,
      'phone', v_driver.phone
    );
    IF r.status IN ('accepted', 'picked_up') THEN
      SELECT * INTO v_presence FROM public.driver_presence WHERE driver_id = v_driver.id;
      IF v_presence.driver_id IS NOT NULL AND v_presence.latitude IS NOT NULL THEN
        v_driver_json := v_driver_json || jsonb_build_object(
          'latitude', v_presence.latitude,
          'longitude', v_presence.longitude,
          'heading', v_presence.heading,
          'age_seconds', floor(extract(epoch FROM (now() - v_presence.updated_at))));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'dispatch_mode', r.dispatch_mode,
    'vehicle_type', r.vehicle_type,
    'distance_km', r.distance_km,
    'fare_amount', r.fare_amount,
    'pickup_latitude', r.pickup_latitude,
    'pickup_longitude', r.pickup_longitude,
    'pickup_address', r.pickup_address,
    'dropoff_address', r.dropoff_address,
    'dropoff_latitude', r.dropoff_latitude,
    'dropoff_longitude', r.dropoff_longitude,
    'cargo_description', r.cargo_description,
    'proposal_expires_at', CASE WHEN r.status = 'proposed' THEN r.proposal_expires_at END,
    'seconds_left', CASE WHEN r.status = 'proposed'
      THEN greatest(0, floor(extract(epoch FROM (r.proposal_expires_at - now())))) END,
    'closed_reason', r.closed_reason,
    'created_at', r.created_at,
    'accepted_at', r.accepted_at,
    'picked_up_at', r.picked_up_at,
    'delivered_at', r.delivered_at,
    'driver', v_driver_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._transport_driver_view(r public.transport_requests, p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_presence public.driver_presence;
  v_distance numeric := NULL;
  v_accepted boolean := r.status IN ('accepted', 'picked_up');
BEGIN
  SELECT * INTO v_farmer FROM public.farmers WHERE id = r.farmer_id;
  SELECT * INTO v_presence FROM public.driver_presence WHERE driver_id = p_driver_id;

  IF v_presence.driver_id IS NOT NULL AND v_presence.latitude IS NOT NULL THEN
    v_distance := round((2 * 6371 * asin(sqrt(
      power(sin(radians(r.pickup_latitude - v_presence.latitude) / 2), 2)
      + cos(radians(v_presence.latitude)) * cos(radians(r.pickup_latitude))
        * power(sin(radians(r.pickup_longitude - v_presence.longitude) / 2), 2)
    )))::numeric, 2);
  END IF;

  RETURN jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'vehicle_type', r.vehicle_type,
    'pickup_latitude', r.pickup_latitude,
    'pickup_longitude', r.pickup_longitude,
    'pickup_address', r.pickup_address,
    'dropoff_address', r.dropoff_address,
    'dropoff_latitude', r.dropoff_latitude,
    'dropoff_longitude', r.dropoff_longitude,
    'cargo_description', r.cargo_description,
    'distance_km', v_distance,
    'route_distance_km', r.distance_km,
    'fare_amount', r.fare_amount,
    'platform_fee', r.platform_fee,
    'driver_net', r.driver_net,
    'proposal_expires_at', CASE WHEN r.status = 'proposed' THEN r.proposal_expires_at END,
    'seconds_left', CASE WHEN r.status = 'proposed'
      THEN greatest(0, floor(extract(epoch FROM (r.proposal_expires_at - now())))) END,
    'created_at', r.created_at,
    'accepted_at', r.accepted_at,
    'picked_up_at', r.picked_up_at,
    'client', CASE WHEN v_accepted THEN jsonb_build_object(
      'name', v_farmer.farm_name,
      'phone', v_farmer.phone,
      'address', v_farmer.address) END
  );
END;
$$;

------------------------------------------------
-- 7) Creation d'une demande avec tarif fige
------------------------------------------------
-- Ancienne signature (sans coordonnees de livraison obligatoires): remplacee.
DROP FUNCTION IF EXISTS public.create_transport_request(text, uuid, text, text, double precision, double precision, text, double precision, double precision, text);

CREATE OR REPLACE FUNCTION public.create_transport_request(
  p_mode text,
  p_driver_id uuid,
  p_dropoff_address text,
  p_cargo_description text,
  p_dropoff_latitude double precision,
  p_dropoff_longitude double precision,
  p_vehicle_type text DEFAULT NULL,
  p_pickup_latitude double precision DEFAULT NULL,
  p_pickup_longitude double precision DEFAULT NULL,
  p_pickup_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_req public.transport_requests;
  v_driver public.drivers;
  v_vehicle text := p_vehicle_type;
  v_lat double precision;
  v_lng double precision;
  v_address text;
  v_dropoff text := btrim(COALESCE(p_dropoff_address, ''));
  v_cargo text := btrim(COALESCE(p_cargo_description, ''));
  v_fare jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_farmer FROM public.farmers f
  WHERE f.user_id = auth.uid() AND f.is_verified IS TRUE AND f.is_active IS TRUE
    AND COALESCE(f.is_refused, false) = false
  LIMIT 1;
  IF v_farmer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'message', 'Reserve aux agriculteurs approuves.');
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('auto', 'manual') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_MODE');
  END IF;
  IF v_cargo = '' OR char_length(v_cargo) > 500 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_CARGO',
      'message', 'Decrivez la marchandise (500 caracteres maximum).');
  END IF;
  IF v_dropoff = '' OR char_length(v_dropoff) > 300 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_DROPOFF',
      'message', 'Indiquez l''adresse de livraison.');
  END IF;
  IF p_dropoff_latitude IS NULL OR p_dropoff_longitude IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DROPOFF_REQUIRED',
      'message', 'Indiquez la destination sur la carte.');
  END IF;
  IF p_dropoff_latitude NOT BETWEEN -4.5 AND 2.9 OR p_dropoff_longitude NOT BETWEEN 8.1 AND 15.1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION',
      'message', 'La destination doit etre au Gabon.');
  END IF;
  IF v_vehicle IS NOT NULL AND v_vehicle NOT IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VEHICLE_TYPE');
  END IF;
  IF (p_pickup_latitude IS NULL) <> (p_pickup_longitude IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION');
  END IF;

  -- Point de ramassage: celui indique, sinon la ferme.
  v_lat := COALESCE(p_pickup_latitude, v_farmer.latitude);
  v_lng := COALESCE(p_pickup_longitude, v_farmer.longitude);
  v_address := COALESCE(NULLIF(btrim(COALESCE(p_pickup_address, '')), ''), v_farmer.address);
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PICKUP_REQUIRED',
      'message', 'Indiquez le point de ramassage.');
  END IF;
  IF v_lat NOT BETWEEN -4.5 AND 2.9 OR v_lng NOT BETWEEN 8.1 AND 15.1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION',
      'message', 'Le point de ramassage doit etre au Gabon.');
  END IF;

  PERFORM public._transport_sweep_expired();

  IF EXISTS (SELECT 1 FROM public.transport_requests t
             WHERE t.farmer_id = v_farmer.id AND t.status IN ('proposed', 'accepted', 'picked_up')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACTIVE_REQUEST_EXISTS',
      'message', 'Vous avez deja une demande de transport en cours.');
  END IF;

  IF p_mode = 'manual' THEN
    IF p_driver_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'DRIVER_REQUIRED');
    END IF;
    -- Le vehicule du chauffeur choisi fixe le tarif.
    SELECT d.* INTO v_driver
    FROM public.driver_presence dp
    JOIN public.drivers d ON d.id = dp.driver_id
    WHERE d.id = p_driver_id
      AND dp.is_available IS TRUE
      AND dp.latitude IS NOT NULL
      AND dp.updated_at > now() - public.driver_presence_max_age()
      AND d.is_verified IS TRUE AND d.is_active IS TRUE AND COALESCE(d.is_refused, false) = false
      AND public.driver_is_free(d.id);
    IF v_driver.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAVAILABLE',
        'message', 'Ce chauffeur n''est plus disponible. Choisissez-en un autre.');
    END IF;
    v_vehicle := v_driver.vehicle_type;
  ELSIF v_vehicle IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VEHICLE_REQUIRED',
      'message', 'Choisissez le type de vehicule.');
  END IF;

  v_fare := public._transport_compute_fare(v_vehicle, v_lat, v_lng, p_dropoff_latitude, p_dropoff_longitude);
  IF NOT (v_fare->>'success')::boolean THEN
    RETURN v_fare;
  END IF;

  IF p_mode = 'manual' THEN
    BEGIN
      INSERT INTO public.transport_requests (
        farmer_id, status, dispatch_mode, vehicle_type,
        pickup_latitude, pickup_longitude, pickup_address,
        dropoff_address, dropoff_latitude, dropoff_longitude, cargo_description,
        distance_km, fare_amount, platform_fee, driver_net, commission_rate,
        current_driver_id, proposed_at, proposal_expires_at
      ) VALUES (
        v_farmer.id, 'proposed', 'manual', v_vehicle,
        v_lat, v_lng, v_address,
        v_dropoff, p_dropoff_latitude, p_dropoff_longitude, v_cargo,
        (v_fare->>'distance_km')::numeric, (v_fare->>'fare_amount')::integer,
        (v_fare->>'platform_fee')::integer, (v_fare->>'driver_net')::integer, (v_fare->>'commission_rate')::numeric,
        p_driver_id, now(), now() + public.transport_proposal_ttl()
      ) RETURNING * INTO v_req;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAVAILABLE',
        'message', 'Ce chauffeur n''est plus disponible. Choisissez-en un autre.');
    END;
  ELSE
    BEGIN
      INSERT INTO public.transport_requests (
        farmer_id, status, dispatch_mode, vehicle_type,
        pickup_latitude, pickup_longitude, pickup_address,
        dropoff_address, dropoff_latitude, dropoff_longitude, cargo_description,
        distance_km, fare_amount, platform_fee, driver_net, commission_rate
      ) VALUES (
        v_farmer.id, 'no_driver', 'auto', v_vehicle,
        v_lat, v_lng, v_address,
        v_dropoff, p_dropoff_latitude, p_dropoff_longitude, v_cargo,
        (v_fare->>'distance_km')::numeric, (v_fare->>'fare_amount')::integer,
        (v_fare->>'platform_fee')::integer, (v_fare->>'driver_net')::integer, (v_fare->>'commission_rate')::numeric
      ) RETURNING * INTO v_req;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACTIVE_REQUEST_EXISTS',
        'message', 'Vous avez deja une demande de transport en cours.');
    END;

    IF NOT public._transport_propose_next(v_req.id) THEN
      DELETE FROM public.transport_requests WHERE id = v_req.id;
      RETURN jsonb_build_object('success', false, 'code', 'NO_DRIVER_AVAILABLE',
        'message', 'Aucun chauffeur libre pour le moment. Reessayez dans quelques instants.');
    END IF;
    SELECT * INTO v_req FROM public.transport_requests WHERE id = v_req.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'request', public._transport_farmer_view(v_req));
END;
$$;

------------------------------------------------
-- 8) Droits d'execution
------------------------------------------------
REVOKE ALL ON FUNCTION public.create_transport_request(text, uuid, text, text, double precision, double precision, text, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.quote_transport(text, double precision, double precision, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_transport_pricing() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_transport_tariff(text, integer, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_transport_settings(numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transport_request(text, uuid, text, text, double precision, double precision, text, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_transport(text, double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_transport_pricing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_transport_tariff(text, integer, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_transport_settings(numeric, numeric, integer) TO authenticated;

COMMIT;
