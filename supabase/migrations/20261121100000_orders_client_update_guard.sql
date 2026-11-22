-- ============================================
-- Securisation de la table orders
-- ============================================
-- Constat: les politiques RLS d'origine autorisaient les clients API a
--   * inserer directement une commande (prix, statut et marchand libres);
--   * modifier leurs commandes sans restriction de colonnes: statut `confirmed`
--     sans paiement, ou `total_price` abaisse avant le paiement;
--   * (marchands) modifier tout champ d'une commande de leur boutique.
-- Le prix d'une commande est la source de verite du paiement et seul un
-- paiement confirme doit pouvoir la faire passer a `confirmed`.
--
-- Correctif:
--   1. plus d'insertion directe: la creation passe par create_order_atomic
--      (SECURITY DEFINER);
--   2. un trigger BEFORE UPDATE verrouille les colonnes de prix/propriete et
--      n'autorise que les transitions de statut legitimes pour un client API;
--   3. l'annulation (RPC et API) est refusee tant qu'un paiement est en cours
--      ou confirme pour la commande.
-- Les chemins serveur (service_role, fonctions SECURITY DEFINER) ne sont pas
-- concernes par le trigger.

BEGIN;

-- 1) Plus d'insertion directe de commandes par les clients API
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;

-- 2) Paiement en cours ou confirme pour une commande
CREATE OR REPLACE FUNCTION public.order_has_active_payment(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payment_transactions pt
    WHERE pt.order_id = p_order_id
      AND (
        pt.status = 'confirmed'
        OR (pt.status IN ('initiated', 'pending') AND pt.created_at > now() - interval '10 minutes')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.order_has_active_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_has_active_payment(uuid) TO authenticated, service_role;

-- 3) Garde des mises a jour directes (API) sur orders
CREATE OR REPLACE FUNCTION public.guard_orders_client_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_customer boolean;
  v_is_merchant boolean;
BEGIN
  -- Chemins serveur: service_role, fonctions SECURITY DEFINER (current_user =
  -- proprietaire de la fonction). Seules les requetes API directes sont gardees.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Colonnes de prix et de propriete: immuables pour un client API.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
     OR NEW.food_item_id IS DISTINCT FROM OLD.food_item_id
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.total_price IS DISTINCT FROM OLD.total_price
     OR NEW.original_total IS DISTINCT FROM OLD.original_total
     OR NEW.savings IS DISTINCT FROM OLD.savings
     OR NEW.pickup_code IS DISTINCT FROM OLD.pickup_code
  THEN
    RAISE EXCEPTION 'orders: protected columns cannot be modified' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Les administrateurs conservent la main sur le statut.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid AND p.role = 'admin') THEN
    RETURN NEW;
  END IF;

  v_is_customer := (OLD.user_id = v_uid);
  v_is_merchant := EXISTS (
    SELECT 1 FROM public.merchants m WHERE m.id = OLD.merchant_id AND m.user_id = v_uid
  );

  -- Annulation: commande non payee uniquement.
  IF NEW.status = 'cancelled' THEN
    IF NOT (v_is_customer OR v_is_merchant) OR OLD.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'orders: invalid status transition % -> %', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
    IF public.order_has_active_payment(OLD.id) THEN
      RAISE EXCEPTION 'orders: payment in progress or already paid' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Cycle de retrait (marchand): confirme -> pret -> retire/termine/absent.
  -- Le passage a `confirmed` est reserve au paiement (service_role).
  IF v_is_merchant AND (
       (OLD.status = 'confirmed' AND NEW.status IN ('ready', 'completed', 'picked_up', 'no_show'))
    OR (OLD.status = 'ready' AND NEW.status IN ('completed', 'picked_up', 'no_show'))
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'orders: invalid status transition % -> %', OLD.status, NEW.status USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_orders_client_updates ON public.orders;
CREATE TRIGGER guard_orders_client_updates
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_orders_client_updates();

-- 4) cancel_user_order: refuse l'annulation d'une commande payee ou en cours de paiement
CREATE OR REPLACE FUNCTION public.cancel_user_order(
  p_order_id uuid,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_food_item food_items%ROWTYPE;
BEGIN
  -- Verrou de ligne: serialise l'annulation avec les autres ecritures sur la commande
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found or access denied');
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order cannot be cancelled (status: ' || v_order.status || ')'
    );
  END IF;

  IF public.order_has_active_payment(p_order_id) THEN
    RETURN json_build_object(
      'success', false,
      'code', 'PAYMENT_LOCKED',
      'error', 'Order has a payment in progress or already paid; contact support to cancel it'
    );
  END IF;

  SELECT * INTO v_food_item
  FROM food_items
  WHERE id = v_order.food_item_id;

  UPDATE orders
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancellation_reason = p_cancellation_reason,
    updated_at = NOW()
  WHERE id = p_order_id;

  IF v_food_item.id IS NOT NULL THEN
    UPDATE food_items
    SET
      quantity_available = quantity_available + v_order.quantity,
      is_available = true,
      updated_at = NOW()
    WHERE id = v_food_item.id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'id', v_order.id,
      'status', 'cancelled',
      'cancelled_at', NOW()
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_user_order(uuid, text) TO authenticated;

COMMIT;
