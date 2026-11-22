-- ============================================
-- Presence des chauffeurs: partage ACTIF PAR DEFAUT
-- ============================================
-- Decision produit: un chauffeur valide est "Disponible" et sa position est
-- partagee des l'ouverture de l'application, sans etape de consentement
-- bloquante. Il garde la possibilite de couper le partage avec l'interrupteur,
-- et l'application l'informe clairement de ce qui est partage.
--
-- Consequences sur le modele:
--   * location_consent_at devient location_notice_ack_at: le moment ou le
--     chauffeur a pris connaissance du message d'information (sert uniquement a
--     ne plus afficher le bandeau). Elle ne conditionne plus le suivi.
--   * accept_location_sharing est remplacee par acknowledge_location_notice.
--   * Plus de CONSENT_REQUIRED: update_driver_presence, set_driver_availability
--     et get_available_drivers n'exigent plus d'accord prealable.
-- Inchangees: vie privee par conception (derniere position seulement, effacee a
-- la desactivation, aucun historique), champs limites pour l'agriculteur,
-- chauffeur occupe/inactif/sans signal non propose, acces uniquement par RPC.

BEGIN;

------------------------------------------------
-- 1) Colonne: consentement -> information lue
------------------------------------------------
ALTER TABLE public.drivers
  RENAME COLUMN location_consent_at TO location_notice_ack_at;

COMMENT ON COLUMN public.drivers.location_notice_ack_at IS
  'Moment ou le chauffeur a pris connaissance du message sur le partage de sa position. Informatif: le partage est actif par defaut et ne depend pas de cette valeur.';

------------------------------------------------
-- 2) Accuse de lecture du message d'information
------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_location_sharing();

CREATE OR REPLACE FUNCTION public.acknowledge_location_notice()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_ack timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED',
      'message', 'Votre profil chauffeur doit etre approuve.');
  END IF;

  UPDATE public.drivers
  SET location_notice_ack_at = COALESCE(location_notice_ack_at, now())
  WHERE id = v_driver.id
  RETURNING location_notice_ack_at INTO v_ack;

  RETURN jsonb_build_object('success', true, 'notice_ack_at', v_ack);
END;
$$;

------------------------------------------------
-- 3) Etat de partage du chauffeur courant
------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_driver_presence()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_presence public.driver_presence;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED');
  END IF;

  SELECT * INTO v_presence FROM public.driver_presence WHERE driver_id = v_driver.id;

  RETURN jsonb_build_object(
    'success', true,
    'notice_ack_at', v_driver.location_notice_ack_at,
    -- Disponible par defaut tant que le chauffeur n'a pas coupe le partage.
    'is_available', COALESCE(v_presence.is_available, true),
    'last_sent_at', CASE WHEN v_presence.latitude IS NULL THEN NULL ELSE v_presence.updated_at END
  );
END;
$$;

------------------------------------------------
-- 4) Disponible / indisponible (sans accord prealable)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_driver_availability(p_available boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;
  IF p_available IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED',
      'message', 'Votre profil chauffeur doit etre approuve.');
  END IF;

  INSERT INTO public.driver_presence (driver_id, is_available)
  VALUES (v_driver.id, p_available)
  ON CONFLICT (driver_id) DO UPDATE
    SET is_available = EXCLUDED.is_available,
        -- Couper le partage efface la derniere position: rien n'est conserve.
        latitude = CASE WHEN EXCLUDED.is_available THEN public.driver_presence.latitude ELSE NULL END,
        longitude = CASE WHEN EXCLUDED.is_available THEN public.driver_presence.longitude ELSE NULL END,
        heading = CASE WHEN EXCLUDED.is_available THEN public.driver_presence.heading ELSE NULL END,
        speed = CASE WHEN EXCLUDED.is_available THEN public.driver_presence.speed ELSE NULL END,
        accuracy_m = CASE WHEN EXCLUDED.is_available THEN public.driver_presence.accuracy_m ELSE NULL END,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'is_available', p_available);
END;
$$;

------------------------------------------------
-- 5) Publication de la position (sans accord prealable)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_driver_presence(
  p_latitude double precision,
  p_longitude double precision,
  p_heading real DEFAULT NULL,
  p_speed real DEFAULT NULL,
  p_accuracy real DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_presence public.driver_presence;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;

  v_driver := public.current_approved_driver();
  IF v_driver.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_APPROVED',
      'message', 'Votre profil chauffeur doit etre approuve.');
  END IF;

  -- Position plausible (Gabon elargi): rejette les valeurs aberrantes ou hors zone.
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -4.5 AND 2.9
     OR p_longitude NOT BETWEEN 8.1 AND 15.1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_POSITION');
  END IF;

  SELECT * INTO v_presence FROM public.driver_presence WHERE driver_id = v_driver.id;

  -- Chauffeur indisponible (interrupteur coupe): on n'enregistre aucune position.
  IF FOUND AND v_presence.is_available IS FALSE THEN
    RETURN jsonb_build_object('success', true, 'is_available', false, 'ignored', true);
  END IF;

  -- Anti-rafale: au plus une ecriture par intervalle minimal et par chauffeur.
  IF FOUND AND v_presence.latitude IS NOT NULL
     AND v_presence.updated_at > now() - public.driver_presence_min_write_interval() THEN
    RETURN jsonb_build_object('success', true, 'is_available', true, 'throttled', true);
  END IF;

  INSERT INTO public.driver_presence (driver_id, is_available, latitude, longitude, heading, speed, accuracy_m, updated_at)
  VALUES (v_driver.id, true, p_latitude, p_longitude, p_heading, p_speed, p_accuracy, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        heading = EXCLUDED.heading,
        speed = EXCLUDED.speed,
        accuracy_m = EXCLUDED.accuracy_m,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'is_available', true);
END;
$$;

------------------------------------------------
-- 6) Chauffeurs libres et operationnels (agriculteur): plus de filtre de consentement
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
      -- Prenom + initiale du nom: jamais le nom complet, ni telephone/email/plaque.
      CASE
        WHEN position(' ' IN btrim(d.full_name)) > 0
          THEN split_part(btrim(d.full_name), ' ', 1) || ' '
               || upper(left((regexp_split_to_array(btrim(d.full_name), '\s+'))[array_length(regexp_split_to_array(btrim(d.full_name), '\s+'), 1)], 1)) || '.'
        ELSE btrim(d.full_name)
      END AS display_name,
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
-- 7) Droits d'execution
------------------------------------------------
REVOKE ALL ON FUNCTION public.acknowledge_location_notice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_location_notice() TO authenticated;

-- CREATE OR REPLACE conserve les droits des fonctions deja existantes; on les reaffirme.
REVOKE ALL ON FUNCTION public.get_my_driver_presence() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_driver_availability(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_driver_presence(double precision, double precision, real, real, real) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_drivers(double precision, double precision, double precision, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_driver_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_driver_availability(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_presence(double precision, double precision, real, real, real) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_drivers(double precision, double precision, double precision, text, integer) TO authenticated;

COMMIT;
