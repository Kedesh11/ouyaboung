-- Frais et commissions: TOUS payes par le client, TOUS modifiables par l'admin.
--
-- Principe (commandes de produits ET transports):
--   le marchand / le chauffeur recoit son prix INTEGRALEMENT; le client paie, en plus:
--     * la commission de la plateforme (taux different pour les commandes et les transports),
--     * les frais PVIT,
--     * les frais de l'operateur Mobile Money (Airtel ou Moov, selon le numero du client).
--   Les frais PVIT et operateur sont une estimation calculee avec les taux ci-dessous: PVIT
--   preleve ses frais reels sur le compte de la plateforme (owner_charge = MERCHANT, comportement
--   verifie en sandbox), le client a donc deja paye de quoi les couvrir.
--
-- Tous les taux sont dans platform_fee_settings, modifiables depuis le tableau de bord admin
-- (admin_update_fee_settings). Chaque changement est journalise (fee_change_log) et notifie
-- a TOUS les utilisateurs de la plateforme. Un seul calcul, compute_fee_breakdown(), sert la
-- carte de detail affichee avant de payer, les Edge Functions de paiement et l'historique
-- (fee_breakdown fige sur chaque paiement).
--
-- La commission des transports quitte transport_settings (une seule source de verite).

BEGIN;

------------------------------------------------
-- 1) Reglages des frais (admin uniquement)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fee_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  order_commission_rate numeric(5, 4) NOT NULL DEFAULT 0.1000 CHECK (order_commission_rate >= 0 AND order_commission_rate <= 0.5),
  transport_commission_rate numeric(5, 4) NOT NULL DEFAULT 0.1000 CHECK (transport_commission_rate >= 0 AND transport_commission_rate <= 0.5),
  pvit_fee_rate numeric(5, 4) NOT NULL DEFAULT 0.0250 CHECK (pvit_fee_rate >= 0 AND pvit_fee_rate <= 0.2),
  airtel_fee_rate numeric(5, 4) NOT NULL DEFAULT 0.0100 CHECK (airtel_fee_rate >= 0 AND airtel_fee_rate <= 0.2),
  moov_fee_rate numeric(5, 4) NOT NULL DEFAULT 0.0100 CHECK (moov_fee_rate >= 0 AND moov_fee_rate <= 0.2),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Valeurs initiales PROVISOIRES: la commission transport reprend celle deja reglee par l'admin;
-- PVIT 2,5 % et operateur 1 % sont les frais observes en sandbox (150 XAF -> 3,75 et 1,5).
INSERT INTO public.platform_fee_settings (id, transport_commission_rate)
SELECT true, COALESCE((SELECT least(s.commission_rate, 0.5) FROM public.transport_settings s WHERE s.id IS TRUE), 0.1000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.transport_settings DROP COLUMN IF EXISTS commission_rate;

ALTER TABLE public.platform_fee_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_fee_settings FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.fee_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  changes jsonb NOT NULL
);
ALTER TABLE public.fee_change_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_change_log FROM PUBLIC, anon, authenticated;

------------------------------------------------
-- 2) Type de notification
------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'order_confirmed', 'order_ready', 'order_cancelled', 'new_food_nearby',
    'merchant_verified', 'merchant_pending', 'merchant_refused',
    'farmer_pending', 'farmer_verified', 'farmer_refused',
    'farm_order_pending', 'farm_order_confirmed', 'farm_order_refused',
    'farm_order_ready', 'farm_order_delivered', 'farm_order_cancelled',
    'driver_pending', 'driver_verified', 'driver_refused',
    'delivery_assigned', 'delivery_picked_up', 'delivery_delivered',
    'promotion', 'system', 'fee_update'
  ));

------------------------------------------------
-- 3) Calcul unique du detail des frais
------------------------------------------------
-- p_flow: 'order' (commande de produits) ou 'transport'; p_operator: 'airtel' ou 'moov'.
-- Arrondis en XAF entiers: la commission est arrondie au plus proche, les frais PVIT/operateur
-- a l'entier superieur (la plateforme ne perd jamais sur l'arrondi). Les frais PVIT et operateur
-- se calculent sur (prix + commission), montant reellement encaisse hors frais.
CREATE OR REPLACE FUNCTION public.compute_fee_breakdown(p_flow text, p_base_amount integer, p_operator text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.platform_fee_settings;
  v_rate numeric;
  v_op_rate numeric;
  v_platform integer;
  v_subtotal integer;
  v_pvit integer;
  v_operator integer;
BEGIN
  IF p_flow IS NULL OR p_flow NOT IN ('order', 'transport') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_FLOW');
  END IF;
  IF p_operator IS NULL OR p_operator NOT IN ('airtel', 'moov') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_OPERATOR');
  END IF;
  IF p_base_amount IS NULL OR p_base_amount <= 0 OR p_base_amount > 100000000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO s FROM public.platform_fee_settings WHERE id IS TRUE;
  v_rate := CASE p_flow WHEN 'order' THEN s.order_commission_rate ELSE s.transport_commission_rate END;
  v_op_rate := CASE p_operator WHEN 'airtel' THEN s.airtel_fee_rate ELSE s.moov_fee_rate END;

  v_platform := round(p_base_amount * v_rate)::integer;
  v_subtotal := p_base_amount + v_platform;
  v_pvit := ceil(v_subtotal * s.pvit_fee_rate)::integer;
  v_operator := ceil(v_subtotal * v_op_rate)::integer;

  RETURN jsonb_build_object(
    'success', true,
    'flow', p_flow,
    'operator', p_operator,
    'base_amount', p_base_amount,
    'recipient_amount', p_base_amount,
    'platform_fee', v_platform,
    'pvit_fee', v_pvit,
    'operator_fee', v_operator,
    'total_amount', p_base_amount + v_platform + v_pvit + v_operator,
    'rates', jsonb_build_object('platform', v_rate, 'pvit', s.pvit_fee_rate, 'operator', v_op_rate),
    'fees_estimated', true,
    'currency', 'XAF'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_fee_breakdown(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_fee_breakdown(text, integer, text) TO authenticated, service_role;

-- Bareme courant, visible de tout utilisateur connecte (information).
CREATE OR REPLACE FUNCTION public.get_fee_schedule()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.platform_fee_settings;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
  END IF;
  SELECT * INTO s FROM public.platform_fee_settings WHERE id IS TRUE;
  RETURN jsonb_build_object(
    'success', true,
    'order_commission_rate', s.order_commission_rate,
    'transport_commission_rate', s.transport_commission_rate,
    'pvit_fee_rate', s.pvit_fee_rate,
    'airtel_fee_rate', s.airtel_fee_rate,
    'moov_fee_rate', s.moov_fee_rate,
    'updated_at', s.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fee_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fee_schedule() TO authenticated;

------------------------------------------------
-- 4) Administration des frais (journal + notification de tous)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_fee_settings()
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
    'settings', (SELECT jsonb_build_object(
        'order_commission_rate', s.order_commission_rate,
        'transport_commission_rate', s.transport_commission_rate,
        'pvit_fee_rate', s.pvit_fee_rate,
        'airtel_fee_rate', s.airtel_fee_rate,
        'moov_fee_rate', s.moov_fee_rate,
        'updated_at', s.updated_at
      ) FROM public.platform_fee_settings s WHERE s.id IS TRUE),
    'history', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', h.id, 'changed_at', h.changed_at, 'changed_by_name', COALESCE(p.full_name, p.email),
        'changes', h.changes) ORDER BY h.changed_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.fee_change_log ORDER BY changed_at DESC LIMIT 20) h
      LEFT JOIN public.profiles p ON p.user_id = h.changed_by)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_fee_settings(
  p_order_commission_rate numeric,
  p_transport_commission_rate numeric,
  p_pvit_fee_rate numeric,
  p_airtel_fee_rate numeric,
  p_moov_fee_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.platform_fee_settings;
  v_new public.platform_fee_settings;
  v_changes jsonb := '[]'::jsonb;
  v_message text;
  v_notified integer;
  r record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_order_commission_rate IS NULL OR p_order_commission_rate < 0 OR p_order_commission_rate > 0.5
     OR p_transport_commission_rate IS NULL OR p_transport_commission_rate < 0 OR p_transport_commission_rate > 0.5 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'Les commissions doivent etre comprises entre 0 % et 50 %.');
  END IF;
  IF p_pvit_fee_rate IS NULL OR p_pvit_fee_rate < 0 OR p_pvit_fee_rate > 0.2
     OR p_airtel_fee_rate IS NULL OR p_airtel_fee_rate < 0 OR p_airtel_fee_rate > 0.2
     OR p_moov_fee_rate IS NULL OR p_moov_fee_rate < 0 OR p_moov_fee_rate > 0.2 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_VALUE',
      'message', 'Les frais PVIT et operateurs doivent etre compris entre 0 % et 20 %.');
  END IF;

  SELECT * INTO v_old FROM public.platform_fee_settings WHERE id IS TRUE FOR UPDATE;

  -- Libelle de chaque taux modifie: "<libelle>: <ancien> % -> <nouveau> %".
  FOR r IN
    SELECT * FROM (VALUES
      ('order_commission_rate', 'Commission sur les commandes', v_old.order_commission_rate, round(p_order_commission_rate, 4)),
      ('transport_commission_rate', 'Commission sur les transports', v_old.transport_commission_rate, round(p_transport_commission_rate, 4)),
      ('pvit_fee_rate', 'Frais PVIT', v_old.pvit_fee_rate, round(p_pvit_fee_rate, 4)),
      ('airtel_fee_rate', 'Frais Airtel Money', v_old.airtel_fee_rate, round(p_airtel_fee_rate, 4)),
      ('moov_fee_rate', 'Frais Moov Money', v_old.moov_fee_rate, round(p_moov_fee_rate, 4))
    ) AS t(field, label, old_rate, new_rate)
    WHERE old_rate IS DISTINCT FROM new_rate
  LOOP
    v_changes := v_changes || jsonb_build_object('field', r.field, 'label', r.label, 'old', r.old_rate, 'new', r.new_rate);
  END LOOP;

  IF jsonb_array_length(v_changes) = 0 THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'notified', 0);
  END IF;

  UPDATE public.platform_fee_settings
  SET order_commission_rate = p_order_commission_rate,
      transport_commission_rate = p_transport_commission_rate,
      pvit_fee_rate = p_pvit_fee_rate,
      airtel_fee_rate = p_airtel_fee_rate,
      moov_fee_rate = p_moov_fee_rate,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id IS TRUE
  RETURNING * INTO v_new;

  INSERT INTO public.fee_change_log (changed_by, before, after, changes)
  VALUES (auth.uid(), to_jsonb(v_old), to_jsonb(v_new), v_changes);

  SELECT 'Les frais de service ont change. ' || string_agg(
    format('%s: %s %% -> %s %%', c->>'label',
      trim(trailing '.' FROM trim(trailing '0' FROM round(((c->>'old')::numeric) * 100, 2)::text)),
      trim(trailing '.' FROM trim(trailing '0' FROM round(((c->>'new')::numeric) * 100, 2)::text))),
    ' ; ')
    || '. Le detail est affiche avant chaque paiement.'
  INTO v_message
  FROM jsonb_array_elements(v_changes) AS c;

  -- Tous les utilisateurs de la plateforme sont informes (consommateurs, marchands, agriculteurs,
  -- chauffeurs, admins).
  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT p.user_id, 'fee_update', 'Frais de service modifies', v_message,
         jsonb_build_object('changes', v_changes, 'changed_at', now())
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL;
  GET DIAGNOSTICS v_notified = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'changed', true, 'notified', v_notified, 'changes', v_changes);
END;
$$;

------------------------------------------------
-- 5) Detail des frais fige sur chaque paiement
------------------------------------------------
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS fee_breakdown jsonb;
ALTER TABLE public.transport_payments ADD COLUMN IF NOT EXISTS fee_breakdown jsonb;

------------------------------------------------
-- 6) Transports: commission payee par l'agriculteur en plus du tarif
------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_transport_settings(numeric, numeric, integer, integer);

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
  v_rate numeric;
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
  SELECT f.transport_commission_rate INTO v_rate FROM public.platform_fee_settings f WHERE f.id IS TRUE;

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
  -- La commission est payee par l'agriculteur EN PLUS du tarif: le chauffeur recoit le tarif entier.
  v_fee := round(v_fare * v_rate)::integer;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_type', p_vehicle_type,
    'distance_km', v_distance,
    'fare_amount', v_fare,
    'platform_fee', v_fee,
    'driver_net', v_fare,
    'commission_rate', v_rate,
    'currency', 'XAF'
  );
END;
$$;

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
        'road_distance_factor', s.road_distance_factor,
        'max_distance_km', s.max_distance_km, 'payment_window_minutes', s.payment_window_minutes, 'updated_at', s.updated_at
      ) FROM public.transport_settings s WHERE s.id IS TRUE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_transport_settings(
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
      road_distance_factor = p_road_distance_factor,
      max_distance_km = p_max_distance_km, updated_by = auth.uid(), updated_at = now()
  WHERE id IS TRUE
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'settings', jsonb_build_object(
    'road_distance_factor', v_row.road_distance_factor,
    'max_distance_km', v_row.max_distance_km, 'payment_window_minutes', v_row.payment_window_minutes, 'updated_at', v_row.updated_at));
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
    'payment_breakdown', (
      SELECT tp.fee_breakdown FROM public.transport_payments tp
      WHERE tp.transport_request_id = r.id AND tp.status IN ('initiated', 'pending', 'confirmed')
      ORDER BY tp.created_at DESC LIMIT 1),
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

------------------------------------------------
-- 8) Vue des transactions: detail des frais + filtre de lignes
------------------------------------------------
-- La vue s'executait avec les droits de son proprietaire et n'appliquait aucun filtre: tout
-- utilisateur connecte pouvait lire TOUTES les transactions (noms, emails, telephones) par l'API.
-- Elle est maintenant limitee au payeur, a la boutique concernee et aux admins. Les requetes de
-- l'application (par client ou par boutique) sont inchangees.
CREATE OR REPLACE VIEW public.merchant_transactions AS
select
  t.id as transaction_id,
  t.created_at as transaction_date,
  t.status as payment_status,
  t.reference as q_gabon_reference,
  t.reference as provider_reference,
  coalesce(t.provider, 'qgabon') as provider,

  t.amount as base_amount,
  t.airtel_fees,
  t.pvit_fees,
  t.app_fees,
  t.total_amount,
  coalesce(ps.net_amount, t.amount_credited, t.total_amount - coalesce(ps.fee_amount, 0), t.total_amount) as merchant_revenue,
  coalesce(ps.fee_amount, t.fees, 0) as q_gabon_fees,
  coalesce(ps.fee_amount, 0) as platform_commission,
  ps.status as settlement_status,
  ps.disbursement_id,
  ps.provider_transfer_reference,
  ps.provider_transfer_status,

  t.customer_id as payment_phone_number,
  t.operator_owner_charge,
  t.transaction_id as q_gabon_transaction_id,
  t.transaction_id as provider_transaction_id,
  t.merchant_reference_id,
  t.operator,
  t.operator_fees,
  t.status_code,
  t.message,
  t.provider_status,
  t.provider_result,

  o.id as order_id,
  o.quantity as order_quantity,
  o.status as order_status,
  o.pickup_code,
  o.consumed_at,
  o.consumed_by,

  f.id as product_id,
  f.name as product_name,
  f.category as product_category,
  f.original_price,
  f.discounted_price,

  m.id as merchant_id,
  m.business_name as merchant_name,
  m.business_type,

  u.id as customer_id,
  p.full_name as customer_name,
  p.email as customer_email,
  t.phone as customer_phone,
  -- Detail fige des frais (commission, PVIT, operateur) pour que le payeur retrouve ce qu'il a paye.
  pt.fee_breakdown as fee_breakdown
from public.transactions t
join public.orders o on t.order_id = o.id
join public.food_items f on o.food_item_id = f.id
join public.merchants m on t.merchant_id = m.id
join auth.users u on t.user_id = u.id
left join public.profiles p on p.user_id = u.id
left join public.payment_transactions pt on pt.id = t.payment_transaction_id
left join public.payment_settlements ps
  on ps.payment_transaction_id = pt.id
  and ps.recipient_type = 'merchant'
WHERE t.user_id = auth.uid()
   OR m.user_id = auth.uid()
   OR public.is_admin(auth.uid());

GRANT SELECT ON public.merchant_transactions TO authenticated;
REVOKE ALL ON public.merchant_transactions FROM anon;

------------------------------------------------
-- 7) Droits d'execution
------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_get_fee_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_fee_settings(numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_transport_settings(numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fee_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_fee_settings(numeric, numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_transport_settings(numeric, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_transport_pricing() TO authenticated;

COMMIT;
