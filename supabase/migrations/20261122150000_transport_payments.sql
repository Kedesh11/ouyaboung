-- Phase 3b: paiement PVIT d'un transport (agriculteur -> chauffeur, commission plateforme).
--
-- Flux:
--   1. le chauffeur accepte une demande (il doit avoir un numero Mobile Money VERIFIE);
--      l'agriculteur dispose de transport_settings.payment_window_minutes (15 par defaut,
--      modifiable par l'admin) pour payer;
--   2. paiement PVIT en paiement fractionne: le net va au chauffeur, la commission reste
--      sur le compte d'operation de la plateforme (meme mecanique que les commandes);
--   3. tant que la course n'est pas payee, le chauffeur ne peut pas marquer "charge";
--   4. non paye dans le delai -> course annulee, chauffeur libere (traitement a la demande,
--      comme l'expiration des propositions, sans tache planifiee).
--
-- Un chauffeur sans numero verifie n'est plus propose ni commandable (il ne pourrait pas
-- etre paye): driver_is_free() l'exclut des cartes, de l'attribution et de la commande.
--
-- Une course payee ne peut plus etre annulee par l'agriculteur (aucun remboursement
-- automatique): le support traite ces cas. Un paiement confirme sur une course deja annulee
-- est place en 'manual_review'.

BEGIN;

------------------------------------------------
-- 1) Comptes de reversement des chauffeurs (miroir de merchant_payout_accounts)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pvit' CHECK (provider IN ('pvit')),
  operator text NOT NULL CHECK (operator IN ('airtel', 'moov')),
  label text NOT NULL,
  msisdn text NOT NULL,
  normalized_msisdn text NOT NULL,
  disbursement_id text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'disabled')),
  rejection_reason text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_payout_accounts_one_default_idx
  ON public.driver_payout_accounts (driver_id, provider, operator)
  WHERE is_default AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS driver_payout_accounts_unique_number_idx
  ON public.driver_payout_accounts (driver_id, provider, operator, normalized_msisdn)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS driver_payout_accounts_driver_idx
  ON public.driver_payout_accounts (driver_id, verification_status, is_active);

DROP TRIGGER IF EXISTS set_driver_payout_accounts_updated_at ON public.driver_payout_accounts;
CREATE TRIGGER set_driver_payout_accounts_updated_at
BEFORE UPDATE ON public.driver_payout_accounts
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.driver_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Appartenance d'un profil chauffeur a l'utilisateur courant. SECURITY DEFINER pour que les
-- politiques RLS ci-dessous ne re-declenchent pas la RLS de `drivers` (recursion de
-- politiques deja rencontree entre drivers et deliveries).
CREATE OR REPLACE FUNCTION public.is_driver_owner(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id AND d.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_driver_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_driver_owner(uuid) TO authenticated;

-- Le chauffeur lit et PROPOSE ses numeros; seul le service (verify-payout-account) ou un
-- admin peut les passer a "verified" (l'insertion impose pending et aucun disbursement_id).
DROP POLICY IF EXISTS "Drivers can read own payout accounts" ON public.driver_payout_accounts;
CREATE POLICY "Drivers can read own payout accounts"
  ON public.driver_payout_accounts FOR SELECT
  USING (public.is_driver_owner(driver_payout_accounts.driver_id));

DROP POLICY IF EXISTS "Drivers can propose own payout accounts" ON public.driver_payout_accounts;
CREATE POLICY "Drivers can propose own payout accounts"
  ON public.driver_payout_accounts FOR INSERT
  WITH CHECK (
    public.is_driver_owner(driver_payout_accounts.driver_id)
    AND verification_status = 'pending'
    AND disbursement_id IS NULL
  );

DROP POLICY IF EXISTS "Admins can manage driver payout accounts" ON public.driver_payout_accounts;
CREATE POLICY "Admins can manage driver payout accounts"
  ON public.driver_payout_accounts FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.driver_payout_accounts IS 'Numeros Mobile Money Airtel/Moov verifies pour payer les chauffeurs.';

CREATE OR REPLACE FUNCTION public.driver_has_verified_payout(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_payout_accounts a
    WHERE a.driver_id = p_driver_id
      AND a.provider = 'pvit'
      AND a.verification_status = 'verified'
      AND a.is_active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.driver_has_verified_payout(uuid) FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 2) Reglage: delai de paiement
------------------------------------------------
ALTER TABLE public.transport_settings
  ADD COLUMN IF NOT EXISTS payment_window_minutes integer NOT NULL DEFAULT 15
    CHECK (payment_window_minutes BETWEEN 5 AND 180);

------------------------------------------------
-- 3) Etat de paiement sur la demande
------------------------------------------------
ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid')),
  ADD COLUMN IF NOT EXISTS payment_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

------------------------------------------------
-- 4) Ledger des paiements de transport
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_request_id uuid NOT NULL REFERENCES public.transport_requests(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  driver_payout_account_id uuid NOT NULL REFERENCES public.driver_payout_accounts(id) ON DELETE RESTRICT,
  platform_wallet_id uuid NOT NULL REFERENCES public.platform_payment_wallets(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'pvit' CHECK (provider IN ('pvit')),
  operator text NOT NULL CHECK (operator IN ('airtel', 'moov')),
  internal_reference text NOT NULL UNIQUE,
  provider_transaction_id text,
  provider_status text,
  provider_result text,
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'expired', 'refunded')),
  amount integer NOT NULL CHECK (amount > 0),
  platform_fee integer NOT NULL CHECK (platform_fee >= 0),
  driver_net integer NOT NULL CHECK (driver_net >= 0),
  CONSTRAINT transport_payments_split_check CHECK (platform_fee + driver_net = amount),
  settlement_status text NOT NULL DEFAULT 'pending'
    CHECK (settlement_status IN ('pending', 'paid', 'manual_review')),
  currency text NOT NULL DEFAULT 'XAF',
  raw_request jsonb,
  raw_response jsonb,
  raw_callback jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

-- Un seul paiement actif ou confirme par course (double clic, nouvel essai concurrent).
CREATE UNIQUE INDEX IF NOT EXISTS transport_payments_one_active_per_request
  ON public.transport_payments (transport_request_id)
  WHERE status IN ('initiated', 'pending', 'confirmed');
CREATE INDEX IF NOT EXISTS transport_payments_user_idx ON public.transport_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transport_payments_driver_idx ON public.transport_payments (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transport_payments_provider_tx_idx
  ON public.transport_payments (provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_transport_payments_updated_at ON public.transport_payments;
CREATE TRIGGER set_transport_payments_updated_at
BEFORE UPDATE ON public.transport_payments
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.transport_payments ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour les parties concernees; toute ecriture passe par les Edge Functions
-- (service_role, qui contourne la RLS).
DROP POLICY IF EXISTS "Payers can read own transport payments" ON public.transport_payments;
CREATE POLICY "Payers can read own transport payments"
  ON public.transport_payments FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Drivers can read own transport payments" ON public.transport_payments;
CREATE POLICY "Drivers can read own transport payments"
  ON public.transport_payments FOR SELECT
  USING (public.is_driver_owner(transport_payments.driver_id));
DROP POLICY IF EXISTS "Admins can read all transport payments" ON public.transport_payments;
CREATE POLICY "Admins can read all transport payments"
  ON public.transport_payments FOR SELECT USING (public.is_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.transport_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.transport_payments FROM anon;

COMMENT ON TABLE public.transport_payments IS 'Ledger des paiements PVIT des transports (net chauffeur + commission plateforme).';

------------------------------------------------
-- 5) Chauffeur libre = payable
------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_is_free(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.driver_has_verified_payout(p_driver_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.deliveries dl
           WHERE dl.driver_id = p_driver_id
             AND dl.status IN ('accepted', 'picked_up', 'in_transit'))
     AND NOT EXISTS (
           SELECT 1 FROM public.transport_requests tr
           WHERE (tr.driver_id = p_driver_id AND tr.status IN ('accepted', 'picked_up'))
              OR (tr.current_driver_id = p_driver_id AND tr.status = 'proposed'
                  AND tr.proposal_expires_at > now()));
$$;

CREATE OR REPLACE FUNCTION public.driver_is_free_except(p_driver_id uuid, p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.driver_has_verified_payout(p_driver_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.deliveries dl
           WHERE dl.driver_id = p_driver_id
             AND dl.status IN ('accepted', 'picked_up', 'in_transit'))
     AND NOT EXISTS (
           SELECT 1 FROM public.transport_requests tr
           WHERE tr.id <> p_request_id
             AND tr.driver_id = p_driver_id AND tr.status IN ('accepted', 'picked_up'));
$$;

------------------------------------------------
-- 6) Fonctions mises a jour (paiement)
------------------------------------------------
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

  -- Course acceptee mais non payee dans le delai: annulee, le chauffeur est libere.
  -- Un paiement en cours (pending) n'est pas interrompu: s'il echoue, il repasse a
  -- unpaid et la course est annulee au passage suivant.
  UPDATE public.transport_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      closed_reason = 'payment_timeout'
  WHERE status = 'accepted'
    AND payment_status = 'unpaid'
    AND payment_deadline IS NOT NULL
    AND payment_deadline < now();
END;
$$;

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
    'payment_status', r.payment_status,
    'payment_deadline', CASE WHEN r.status = 'accepted' AND r.payment_status <> 'paid' THEN r.payment_deadline END,
    'seconds_to_pay', CASE WHEN r.status = 'accepted' AND r.payment_status <> 'paid' AND r.payment_deadline IS NOT NULL
      THEN greatest(0, floor(extract(epoch FROM (r.payment_deadline - now())))) END,
    'paid_at', r.paid_at,
    'payment_reference', (
      SELECT tp.internal_reference FROM public.transport_payments tp
      WHERE tp.transport_request_id = r.id AND tp.status IN ('initiated', 'pending', 'confirmed')
      ORDER BY tp.created_at DESC LIMIT 1),
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
    'payment_status', r.payment_status,
    'payment_deadline', CASE WHEN r.status = 'accepted' AND r.payment_status <> 'paid' THEN r.payment_deadline END,
    'seconds_to_pay', CASE WHEN r.status = 'accepted' AND r.payment_status <> 'paid' AND r.payment_deadline IS NOT NULL
      THEN greatest(0, floor(extract(epoch FROM (r.payment_deadline - now())))) END,
    'paid_at', r.paid_at,
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
    IF NOT public.driver_has_verified_payout(v_driver.id) THEN
      RETURN jsonb_build_object('success', false, 'code', 'PAYOUT_ACCOUNT_REQUIRED',
        'message', 'Ajoutez et faites verifier votre numero Mobile Money pour recevoir vos paiements.');
    END IF;
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
        payment_status = 'unpaid',
        payment_deadline = now() + make_interval(mins => (SELECT s.payment_window_minutes FROM public.transport_settings s WHERE s.id IS TRUE)),
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

  IF p_status = 'picked_up' AND v_req.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_REQUIRED',
      'message', 'Attendez le paiement de l''agriculteur avant de charger la marchandise.');
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

  IF v_req.status = 'accepted' AND v_req.payment_status <> 'unpaid' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CANNOT_CANCEL_PAID',
      'message', 'Le paiement est en cours ou effectue: contactez le support pour annuler.');
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
-- 7) Administration: delai de paiement
------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_transport_settings(numeric, numeric, integer);

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
        'max_distance_km', s.max_distance_km, 'payment_window_minutes', s.payment_window_minutes, 'updated_at', s.updated_at
      ) FROM public.transport_settings s WHERE s.id IS TRUE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_transport_settings(
  p_commission_rate numeric,
  p_road_distance_factor numeric,
  p_max_distance_km integer,
  p_payment_window_minutes integer DEFAULT NULL
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

  IF p_payment_window_minutes IS NOT NULL AND (p_payment_window_minutes < 5 OR p_payment_window_minutes > 180) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'Le delai de paiement doit etre compris entre 5 et 180 minutes.');
  END IF;

  UPDATE public.transport_settings
  SET payment_window_minutes = COALESCE(p_payment_window_minutes, payment_window_minutes),
      commission_rate = p_commission_rate, road_distance_factor = p_road_distance_factor,
      max_distance_km = p_max_distance_km, updated_by = auth.uid(), updated_at = now()
  WHERE id IS TRUE
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'settings', jsonb_build_object(
    'commission_rate', v_row.commission_rate, 'road_distance_factor', v_row.road_distance_factor,
    'max_distance_km', v_row.max_distance_km, 'payment_window_minutes', v_row.payment_window_minutes, 'updated_at', v_row.updated_at));
END;
$$;

------------------------------------------------
-- 8) Droits d'execution
------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_update_transport_settings(numeric, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_transport_settings(numeric, numeric, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_transport_pricing() TO authenticated;
REVOKE ALL ON FUNCTION public.driver_is_free(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.driver_is_free_except(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.driver_payout_accounts TO authenticated;
GRANT INSERT ON public.driver_payout_accounts TO authenticated;
GRANT SELECT ON public.transport_payments TO authenticated;

COMMIT;
