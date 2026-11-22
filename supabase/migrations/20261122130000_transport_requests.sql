-- Phase 2: demandes de transport (agriculteur -> chauffeur).
--
-- Un agriculteur verifie commande un chauffeur libre pour transporter ses produits:
--   * manuel: il choisit un chauffeur sur la carte;
--   * automatique: le chauffeur libre le plus proche est propose, puis le suivant.
-- Le chauffeur propose a 180 secondes pour accepter ou refuser. Passe ce delai (ou en
-- cas de refus), une demande automatique passe au chauffeur libre suivant; une demande
-- manuelle s'arrete (l'agriculteur choisit un autre chauffeur).
--
-- Sans tache planifiee: les propositions expirees sont traitees a la demande (a chaque
-- appel d'une RPC de transport), sous verrou de ligne.
--
-- Vie privee:
--   * table sans politique RLS et sans droit pour anon/authenticated: acces par RPC seulement;
--   * le chauffeur propose voit le point de ramassage et la marchandise, mais le telephone
--     et le nom de la ferme du client ne lui sont donnes qu'une fois la course acceptee;
--   * l'agriculteur voit la position en direct du chauffeur seulement pendant sa course;
--   * aucune position de l'agriculteur n'est suivie: seul le point de ramassage indique.
--
-- Hors perimetre (Phase 3): tarif calcule et paiement PVIT.

BEGIN;

------------------------------------------------
-- 1) Constantes
------------------------------------------------
CREATE OR REPLACE FUNCTION public.transport_proposal_ttl()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$ SELECT interval '180 seconds' $$;

------------------------------------------------
-- 2) Table des demandes
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'picked_up', 'delivered', 'cancelled', 'no_driver')),
  dispatch_mode text NOT NULL CHECK (dispatch_mode IN ('auto', 'manual')),
  vehicle_type text
    CHECK (vehicle_type IS NULL OR vehicle_type IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other')),
  pickup_latitude double precision NOT NULL CHECK (pickup_latitude BETWEEN -90 AND 90),
  pickup_longitude double precision NOT NULL CHECK (pickup_longitude BETWEEN -180 AND 180),
  pickup_address text NOT NULL,
  dropoff_address text NOT NULL,
  dropoff_latitude double precision CHECK (dropoff_latitude IS NULL OR dropoff_latitude BETWEEN -90 AND 90),
  dropoff_longitude double precision CHECK (dropoff_longitude IS NULL OR dropoff_longitude BETWEEN -180 AND 180),
  cargo_description text NOT NULL
    CHECK (char_length(btrim(cargo_description)) BETWEEN 1 AND 500),
  -- Chauffeur a qui la demande est proposee en ce moment (status = proposed).
  current_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  proposed_at timestamptz,
  proposal_expires_at timestamptz,
  -- Chauffeurs deja sollicites (refus ou delai depasse): jamais re-proposes pour cette demande.
  excluded_driver_ids uuid[] NOT NULL DEFAULT '{}',
  -- Chauffeur qui a accepte.
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  closed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.transport_requests IS
  'Demandes de transport des agriculteurs. Acces uniquement via les RPC de transport (aucune politique RLS).';

-- Garanties d'integrite, y compris sous concurrence:
CREATE UNIQUE INDEX IF NOT EXISTS transport_requests_one_active_per_farmer
  ON public.transport_requests (farmer_id)
  WHERE status IN ('proposed', 'accepted', 'picked_up');
CREATE UNIQUE INDEX IF NOT EXISTS transport_requests_one_proposal_per_driver
  ON public.transport_requests (current_driver_id)
  WHERE status = 'proposed';
CREATE UNIQUE INDEX IF NOT EXISTS transport_requests_one_job_per_driver
  ON public.transport_requests (driver_id)
  WHERE status IN ('accepted', 'picked_up');
CREATE INDEX IF NOT EXISTS transport_requests_proposal_expiry_idx
  ON public.transport_requests (proposal_expires_at)
  WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS transport_requests_farmer_created_idx
  ON public.transport_requests (farmer_id, created_at DESC);

ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transport_requests FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_transport_requests_updated_at ON public.transport_requests;
CREATE TRIGGER set_transport_requests_updated_at
BEFORE UPDATE ON public.transport_requests
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

------------------------------------------------
-- 3) Chauffeur libre (une seule definition, partagee)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_is_free(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.deliveries dl
           WHERE dl.driver_id = p_driver_id
             AND dl.status IN ('accepted', 'picked_up', 'in_transit'))
     AND NOT EXISTS (
           SELECT 1 FROM public.transport_requests tr
           WHERE (tr.driver_id = p_driver_id AND tr.status IN ('accepted', 'picked_up'))
              OR (tr.current_driver_id = p_driver_id AND tr.status = 'proposed'
                  AND tr.proposal_expires_at > now()));
$$;

REVOKE ALL ON FUNCTION public.driver_is_free(uuid) FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 4) Attribution du chauffeur libre le plus proche
------------------------------------------------
-- Propose la demande au chauffeur libre le plus proche du point de ramassage, hors
-- chauffeurs deja sollicites. Sans candidat: la demande passe a no_driver.
CREATE OR REPLACE FUNCTION public._transport_propose_next(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.transport_requests;
  cand record;
BEGIN
  SELECT * INTO r FROM public.transport_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL THEN
    RETURN false;
  END IF;

  FOR cand IN
    SELECT d.id AS driver_id,
           2 * 6371 * asin(sqrt(
             power(sin(radians(dp.latitude - r.pickup_latitude) / 2), 2)
             + cos(radians(r.pickup_latitude)) * cos(radians(dp.latitude))
               * power(sin(radians(dp.longitude - r.pickup_longitude) / 2), 2)
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
      AND NOT (d.id = ANY (r.excluded_driver_ids))
      AND (r.vehicle_type IS NULL OR d.vehicle_type = r.vehicle_type)
      AND public.driver_is_free(d.id)
    ORDER BY distance_km ASC
    LIMIT 20
  LOOP
    IF cand.distance_km > 200 THEN
      EXIT;
    END IF;
    BEGIN
      UPDATE public.transport_requests
      SET status = 'proposed',
          current_driver_id = cand.driver_id,
          proposed_at = now(),
          proposal_expires_at = now() + public.transport_proposal_ttl()
      WHERE id = r.id;
      RETURN true;
    EXCEPTION WHEN unique_violation THEN
      -- Un autre agriculteur vient de solliciter ce chauffeur: on passe au suivant.
      CONTINUE;
    END;
  END LOOP;

  UPDATE public.transport_requests
  SET status = 'no_driver',
      current_driver_id = NULL,
      proposed_at = NULL,
      proposal_expires_at = NULL,
      closed_reason = COALESCE(closed_reason, 'no_driver_available')
  WHERE id = r.id;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._transport_propose_next(uuid) FROM PUBLIC, anon, authenticated;

-- Traite les propositions dont le delai est depasse (appele a chaque RPC de transport).
CREATE OR REPLACE FUNCTION public._transport_sweep_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.transport_requests;
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.transport_requests
    WHERE status = 'proposed' AND proposal_expires_at <= now()
    ORDER BY proposal_expires_at
    LIMIT 100
  LOOP
    SELECT * INTO r FROM public.transport_requests WHERE id = v_id FOR UPDATE SKIP LOCKED;
    CONTINUE WHEN r.id IS NULL OR r.status <> 'proposed' OR r.proposal_expires_at > now();

    UPDATE public.transport_requests
    SET excluded_driver_ids = array_append(excluded_driver_ids, current_driver_id),
        current_driver_id = NULL,
        closed_reason = 'proposal_expired'
    WHERE id = r.id;

    IF r.dispatch_mode = 'auto' THEN
      PERFORM public._transport_propose_next(r.id);
    ELSE
      UPDATE public.transport_requests
      SET status = 'no_driver', proposed_at = NULL, proposal_expires_at = NULL
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._transport_sweep_expired() FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 5) Vues JSON (champs limites selon le role)
------------------------------------------------
-- Prenom + initiale du nom.
CREATE OR REPLACE FUNCTION public._driver_display_name(p_full_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN position(' ' IN btrim(p_full_name)) > 0
      THEN split_part(btrim(p_full_name), ' ', 1) || ' '
           || upper(left((regexp_split_to_array(btrim(p_full_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_full_name), '\s+'), 1)], 1)) || '.'
    ELSE btrim(p_full_name)
  END
$$;

REVOKE ALL ON FUNCTION public._driver_display_name(text) FROM PUBLIC, anon, authenticated;

-- Vue agriculteur: chauffeur propose ou assigne; position en direct pendant la course.
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

REVOKE ALL ON FUNCTION public._transport_farmer_view(public.transport_requests) FROM PUBLIC, anon, authenticated;

-- Vue chauffeur: le telephone et le nom de la ferme ne sont donnes qu'apres acceptation.
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

REVOKE ALL ON FUNCTION public._transport_driver_view(public.transport_requests, uuid) FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 6) Agriculteur: creer une demande
------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_transport_request(
  p_mode text,
  p_driver_id uuid,
  p_dropoff_address text,
  p_cargo_description text,
  p_pickup_latitude double precision DEFAULT NULL,
  p_pickup_longitude double precision DEFAULT NULL,
  p_pickup_address text DEFAULT NULL,
  p_dropoff_latitude double precision DEFAULT NULL,
  p_dropoff_longitude double precision DEFAULT NULL,
  p_vehicle_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_req public.transport_requests;
  v_lat double precision;
  v_lng double precision;
  v_address text;
  v_dropoff text := btrim(COALESCE(p_dropoff_address, ''));
  v_cargo text := btrim(COALESCE(p_cargo_description, ''));
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
  IF p_vehicle_type IS NOT NULL
     AND p_vehicle_type NOT IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VEHICLE_TYPE');
  END IF;
  IF (p_dropoff_latitude IS NULL) <> (p_dropoff_longitude IS NULL)
     OR (p_dropoff_latitude IS NOT NULL
         AND (p_dropoff_latitude NOT BETWEEN -90 AND 90 OR p_dropoff_longitude NOT BETWEEN -180 AND 180)) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION');
  END IF;

  -- Point de ramassage: celui indique, sinon la ferme.
  v_lat := COALESCE(p_pickup_latitude, v_farmer.latitude);
  v_lng := COALESCE(p_pickup_longitude, v_farmer.longitude);
  v_address := COALESCE(NULLIF(btrim(COALESCE(p_pickup_address, '')), ''), v_farmer.address);
  IF (p_pickup_latitude IS NULL) <> (p_pickup_longitude IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION');
  END IF;
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
    IF NOT EXISTS (
      SELECT 1
      FROM public.driver_presence dp
      JOIN public.drivers d ON d.id = dp.driver_id
      WHERE d.id = p_driver_id
        AND dp.is_available IS TRUE
        AND dp.latitude IS NOT NULL
        AND dp.updated_at > now() - public.driver_presence_max_age()
        AND d.is_verified IS TRUE AND d.is_active IS TRUE AND COALESCE(d.is_refused, false) = false
        AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
        AND public.driver_is_free(d.id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAVAILABLE',
        'message', 'Ce chauffeur n''est plus disponible. Choisissez-en un autre.');
    END IF;

    BEGIN
      INSERT INTO public.transport_requests (
        farmer_id, status, dispatch_mode, vehicle_type,
        pickup_latitude, pickup_longitude, pickup_address,
        dropoff_address, dropoff_latitude, dropoff_longitude, cargo_description,
        current_driver_id, proposed_at, proposal_expires_at
      ) VALUES (
        v_farmer.id, 'proposed', 'manual', p_vehicle_type,
        v_lat, v_lng, v_address,
        v_dropoff, p_dropoff_latitude, p_dropoff_longitude, v_cargo,
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
        dropoff_address, dropoff_latitude, dropoff_longitude, cargo_description
      ) VALUES (
        v_farmer.id, 'no_driver', 'auto', p_vehicle_type,
        v_lat, v_lng, v_address,
        v_dropoff, p_dropoff_latitude, p_dropoff_longitude, v_cargo
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
-- 7) Agriculteur: suivre / annuler sa demande
------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_transport_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_req public.transport_requests;
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

  PERFORM public._transport_sweep_expired();

  -- La demande en cours, sinon la derniere terminee depuis moins de 30 minutes.
  SELECT * INTO v_req FROM public.transport_requests t
  WHERE t.farmer_id = v_farmer.id
    AND (t.status IN ('proposed', 'accepted', 'picked_up') OR t.updated_at > now() - interval '30 minutes')
  ORDER BY (t.status IN ('proposed', 'accepted', 'picked_up')) DESC, t.created_at DESC
  LIMIT 1;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'request', NULL, 'server_time', now());
  END IF;
  RETURN jsonb_build_object('success', true, 'request', public._transport_farmer_view(v_req), 'server_time', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_transport_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_req public.transport_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_farmer FROM public.farmers f WHERE f.user_id = auth.uid() LIMIT 1;
  IF v_farmer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_req FROM public.transport_requests
  WHERE id = p_request_id AND farmer_id = v_farmer.id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_req.status NOT IN ('proposed', 'accepted') THEN
    RETURN jsonb_build_object('success', false, 'code', 'CANNOT_CANCEL',
      'message', 'Cette demande ne peut plus etre annulee.');
  END IF;

  UPDATE public.transport_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      closed_reason = 'cancelled_by_farmer',
      current_driver_id = NULL,
      proposal_expires_at = NULL
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  RETURN jsonb_build_object('success', true, 'request', public._transport_farmer_view(v_req));
END;
$$;

------------------------------------------------
-- 8) Chauffeur: courses proposees / en cours
------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_transport_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_jobs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED');
  END IF;

  PERFORM public._transport_sweep_expired();

  SELECT COALESCE(jsonb_agg(public._transport_driver_view(t, v_driver.id)
                            ORDER BY (t.status = 'proposed') DESC, t.created_at), '[]'::jsonb)
  INTO v_jobs
  FROM public.transport_requests t
  WHERE (t.status = 'proposed' AND t.current_driver_id = v_driver.id AND t.proposal_expires_at > now())
     OR (t.status IN ('accepted', 'picked_up') AND t.driver_id = v_driver.id);

  RETURN jsonb_build_object('success', true, 'jobs', v_jobs, 'server_time', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_transport_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_req public.transport_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED');
  END IF;
  IF p_accept IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_RESPONSE');
  END IF;

  PERFORM public._transport_sweep_expired();

  SELECT * INTO v_req FROM public.transport_requests
  WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status <> 'proposed' OR v_req.current_driver_id IS DISTINCT FROM v_driver.id THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROPOSAL_NOT_AVAILABLE',
      'message', 'Cette demande n''est plus disponible.');
  END IF;
  IF v_req.proposal_expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROPOSAL_EXPIRED',
      'message', 'Le delai de reponse est depasse.');
  END IF;

  IF p_accept THEN
    IF NOT public.driver_is_free_except(v_driver.id, v_req.id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DRIVER_BUSY',
        'message', 'Terminez votre course en cours avant d''en accepter une autre.');
    END IF;

    UPDATE public.transport_requests
    SET status = 'accepted',
        driver_id = v_driver.id,
        current_driver_id = NULL,
        proposal_expires_at = NULL,
        accepted_at = now(),
        closed_reason = NULL
    WHERE id = v_req.id
    RETURNING * INTO v_req;
  ELSE
    UPDATE public.transport_requests
    SET excluded_driver_ids = array_append(excluded_driver_ids, v_driver.id),
        current_driver_id = NULL,
        closed_reason = 'declined'
    WHERE id = v_req.id
    RETURNING * INTO v_req;

    IF v_req.dispatch_mode = 'auto' THEN
      PERFORM public._transport_propose_next(v_req.id);
    ELSE
      UPDATE public.transport_requests
      SET status = 'no_driver', proposed_at = NULL, proposal_expires_at = NULL
      WHERE id = v_req.id;
    END IF;
    RETURN jsonb_build_object('success', true, 'declined', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'job', public._transport_driver_view(v_req, v_driver.id));
END;
$$;

-- Libre en ignorant la proposition en cours pour cette demande (le chauffeur y repond).
CREATE OR REPLACE FUNCTION public.driver_is_free_except(p_driver_id uuid, p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.deliveries dl
           WHERE dl.driver_id = p_driver_id
             AND dl.status IN ('accepted', 'picked_up', 'in_transit'))
     AND NOT EXISTS (
           SELECT 1 FROM public.transport_requests tr
           WHERE tr.id <> p_request_id
             AND tr.driver_id = p_driver_id AND tr.status IN ('accepted', 'picked_up'));
$$;

REVOKE ALL ON FUNCTION public.driver_is_free_except(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_transport_job_status(p_request_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_req public.transport_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('picked_up', 'delivered') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS');
  END IF;

  SELECT * INTO v_req FROM public.transport_requests
  WHERE id = p_request_id AND driver_id = v_driver.id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF NOT ((v_req.status = 'accepted' AND p_status = 'picked_up')
       OR (v_req.status = 'picked_up' AND p_status = 'delivered')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION',
      'message', 'Etape impossible pour l''etat actuel de la course.');
  END IF;

  UPDATE public.transport_requests
  SET status = p_status,
      picked_up_at = CASE WHEN p_status = 'picked_up' THEN now() ELSE picked_up_at END,
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  RETURN jsonb_build_object('success', true, 'job', public._transport_driver_view(v_req, v_driver.id));
END;
$$;

------------------------------------------------
-- 9) Le chauffeur occupe n'est plus propose sur la carte
------------------------------------------------

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
      -- Libre: aucune livraison, course ou proposition en cours.
      AND public.driver_is_free(d.id)
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

------------------------------------------------
-- 10) Droits d'execution
------------------------------------------------
REVOKE ALL ON FUNCTION public.create_transport_request(text, uuid, text, text, double precision, double precision, text, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_transport_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_transport_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_transport_jobs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_transport_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_transport_job_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_drivers(double precision, double precision, double precision, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transport_proposal_ttl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transport_request(text, uuid, text, text, double precision, double precision, text, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_transport_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transport_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_transport_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_transport_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transport_job_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_drivers(double precision, double precision, double precision, text, integer) TO authenticated;

COMMIT;
