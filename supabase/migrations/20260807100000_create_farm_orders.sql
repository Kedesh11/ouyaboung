-- ==========================================
-- Farm Orders (Marché B2B commerçant <-> agriculteur)
-- Date: 2026-08-07
-- Purpose:
-- 1) Create farm_orders table (merchant orders a farmer's product)
-- 2) Atomic order creation RPC (mirrors create_order_atomic)
-- 3) Cancellation RPC (mirrors cancel_user_order)
-- 4) RLS following the merchant/farmer ownership pattern
-- 5) Notifications on new order + status change
-- ==========================================

BEGIN;

------------------------------------------------
-- 1) TABLE: farm_orders
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.farm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  farm_product_id uuid NOT NULL REFERENCES public.farm_products(id) ON DELETE RESTRICT,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  price_per_unit integer NOT NULL, -- XAF
  total_price integer NOT NULL,    -- XAF
  special_request text,
  requested_date date,
  status text NOT NULL
    CHECK (status IN ('pending', 'confirmed', 'refused', 'ready', 'delivered', 'cancelled')),
  confirmed_at timestamptz,
  refused_at timestamptz,
  refusal_reason text,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_orders_refusal_reason_required CHECK (
    status <> 'refused' OR (refusal_reason IS NOT NULL AND btrim(refusal_reason) <> '')
  )
);

CREATE INDEX IF NOT EXISTS farm_orders_merchant_id_idx ON public.farm_orders(merchant_id);
CREATE INDEX IF NOT EXISTS farm_orders_farmer_id_idx ON public.farm_orders(farmer_id);
CREATE INDEX IF NOT EXISTS farm_orders_farm_product_id_idx ON public.farm_orders(farm_product_id);
CREATE INDEX IF NOT EXISTS farm_orders_status_idx ON public.farm_orders(status);

ALTER TABLE public.farm_orders ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_farm_orders_updated_at ON public.farm_orders;
CREATE TRIGGER set_farm_orders_updated_at
BEFORE UPDATE ON public.farm_orders
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

------------------------------------------------
-- 2) RPC: create_farm_order_atomic (mirrors create_order_atomic)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_farm_order_atomic(
  p_farm_product_id uuid,
  p_quantity numeric,
  p_special_request text DEFAULT NULL,
  p_requested_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_merchant public.merchants%ROWTYPE;
  v_product public.farm_products%ROWTYPE;
  v_farmer public.farmers%ROWTYPE;
  v_total_price integer;
  v_order public.farm_orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNAUTHENTICATED',
      'message', 'Authentication required'
    );
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_QUANTITY',
      'message', 'Quantity must be greater than zero'
    );
  END IF;

  SELECT * INTO v_merchant
  FROM public.merchants
  WHERE user_id = v_user_id;

  IF NOT FOUND
    OR v_merchant.is_verified IS DISTINCT FROM true
    OR v_merchant.is_active IS DISTINCT FROM true
    OR COALESCE(v_merchant.is_refused, false) = true
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MERCHANT_NOT_APPROVED',
      'message', 'Votre commerce doit être approuvé pour passer commande.'
    );
  END IF;

  SELECT * INTO v_product
  FROM public.farm_products
  WHERE id = p_farm_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Produit introuvable'
    );
  END IF;

  SELECT * INTO v_farmer
  FROM public.farmers
  WHERE id = v_product.farmer_id;

  IF NOT FOUND
    OR v_farmer.is_verified IS DISTINCT FROM true
    OR v_farmer.is_active IS DISTINCT FROM true
    OR COALESCE(v_farmer.is_refused, false) = true
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FARMER_NOT_APPROVED',
      'message', 'Cette exploitation n''est pas (ou plus) approuvée.'
    );
  END IF;

  IF v_product.is_available IS DISTINCT FROM true
    OR COALESCE(v_product.quantity_available, 0) < p_quantity
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_QUANTITY',
      'message', 'Quantité demandée indisponible'
    );
  END IF;

  v_total_price := round(v_product.price_per_unit * p_quantity);

  INSERT INTO public.farm_orders (
    merchant_id, farmer_id, farm_product_id,
    quantity, unit, price_per_unit, total_price,
    special_request, requested_date, status
  )
  VALUES (
    v_merchant.id, v_farmer.id, v_product.id,
    p_quantity, v_product.unit, v_product.price_per_unit, v_total_price,
    p_special_request, p_requested_date, 'pending'
  )
  RETURNING * INTO v_order;

  UPDATE public.farm_products
  SET
    quantity_available = quantity_available - p_quantity,
    is_available = (quantity_available - p_quantity) > 0,
    updated_at = now()
  WHERE id = v_product.id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CREATE_FARM_ORDER_ATOMIC_FAILED',
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_farm_order_atomic(uuid, numeric, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_farm_order_atomic(uuid, numeric, text, date) TO authenticated;

COMMENT ON FUNCTION public.create_farm_order_atomic(uuid, numeric, text, date) IS
  'Atomically creates a B2B farm order and decrements farm_products.quantity_available under a row lock.';

------------------------------------------------
-- 3) RPC: cancel_farm_order (mirrors cancel_user_order)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_farm_order(
  p_order_id uuid,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order farm_orders%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order
  FROM farm_orders o
  JOIN merchants m ON m.id = o.merchant_id
  WHERE o.id = p_order_id
    AND m.user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order not found or access denied'
    );
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order cannot be cancelled (status: ' || v_order.status || ')'
    );
  END IF;

  UPDATE farm_orders
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = p_cancellation_reason,
    updated_at = now()
  WHERE id = p_order_id;

  UPDATE farm_products
  SET
    quantity_available = quantity_available + v_order.quantity,
    is_available = true,
    updated_at = now()
  WHERE id = v_order.farm_product_id;

  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'id', v_order.id,
      'status', 'cancelled',
      'cancelled_at', now()
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_farm_order(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_farm_order IS 'Permet à un commerçant d''annuler sa propre commande B2B en attente/confirmée';

------------------------------------------------
-- 4) RLS policies
------------------------------------------------
DROP POLICY IF EXISTS "Merchants can view own farm orders" ON public.farm_orders;
CREATE POLICY "Merchants can view own farm orders"
  ON public.farm_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = farm_orders.merchant_id AND m.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can create farm orders" ON public.farm_orders;
CREATE POLICY "Merchants can create farm orders"
  ON public.farm_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = farm_orders.merchant_id AND m.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can cancel own pending farm orders" ON public.farm_orders;
CREATE POLICY "Merchants can cancel own pending farm orders"
  ON public.farm_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = farm_orders.merchant_id AND m.user_id = (select auth.uid())
    )
    AND status IN ('pending', 'confirmed')
  );

DROP POLICY IF EXISTS "Farmers can view own farm orders" ON public.farm_orders;
CREATE POLICY "Farmers can view own farm orders"
  ON public.farm_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.farmers f
      WHERE f.id = farm_orders.farmer_id AND f.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Farmers can update own farm orders" ON public.farm_orders;
CREATE POLICY "Farmers can update own farm orders"
  ON public.farm_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.farmers f
      WHERE f.id = farm_orders.farmer_id AND f.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can manage all farm orders" ON public.farm_orders;
CREATE POLICY "Admins can manage all farm orders"
  ON public.farm_orders FOR ALL
  TO authenticated
  USING ( public.is_admin((select auth.uid())) );

------------------------------------------------
-- 5) Notifications
------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'order_confirmed',
      'order_ready',
      'order_cancelled',
      'new_food_nearby',
      'merchant_verified',
      'merchant_pending',
      'merchant_refused',
      'farmer_pending',
      'farmer_verified',
      'farmer_refused',
      'farm_order_pending',
      'farm_order_confirmed',
      'farm_order_refused',
      'farm_order_ready',
      'farm_order_delivered',
      'farm_order_cancelled',
      'promotion',
      'system'
    ));
END $$;

-- Notify the farmer when a merchant places a new order
CREATE OR REPLACE FUNCTION public.notify_farmer_new_farm_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer_user_id uuid;
  v_merchant_name text;
BEGIN
  SELECT user_id INTO v_farmer_user_id FROM public.farmers WHERE id = NEW.farmer_id;
  SELECT business_name INTO v_merchant_name FROM public.merchants WHERE id = NEW.merchant_id;

  IF v_farmer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_farmer_user_id,
    'farm_order_pending',
    'Nouvelle commande reçue',
    format('%s souhaite commander %s %s', COALESCE(v_merchant_name, 'Un commerçant'), NEW.quantity, NEW.unit),
    jsonb_build_object(
      'farm_order_id', NEW.id,
      'merchant_id', NEW.merchant_id,
      'action_url', '/farmer/orders'
    ),
    false,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_farmer_new_farm_order ON public.farm_orders;
CREATE TRIGGER trigger_notify_farmer_new_farm_order
  AFTER INSERT ON public.farm_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_farmer_new_farm_order();

-- Notify the merchant when the order status changes
CREATE OR REPLACE FUNCTION public.notify_merchant_farm_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_user_id uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_merchant_user_id FROM public.merchants WHERE id = NEW.merchant_id;
  IF v_merchant_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_merchant_user_id,
    CASE NEW.status
      WHEN 'confirmed' THEN 'farm_order_confirmed'
      WHEN 'refused' THEN 'farm_order_refused'
      WHEN 'ready' THEN 'farm_order_ready'
      WHEN 'delivered' THEN 'farm_order_delivered'
      WHEN 'cancelled' THEN 'farm_order_cancelled'
      ELSE 'system'
    END,
    CASE NEW.status
      WHEN 'confirmed' THEN 'Commande confirmée'
      WHEN 'refused' THEN 'Commande refusée'
      WHEN 'ready' THEN 'Commande prête'
      WHEN 'delivered' THEN 'Commande livrée'
      WHEN 'cancelled' THEN 'Commande annulée'
      ELSE 'Mise à jour de commande'
    END,
    CASE NEW.status
      WHEN 'confirmed' THEN 'Votre commande a été confirmée par l''agriculteur.'
      WHEN 'refused' THEN format('Votre commande a été refusée.%s', CASE WHEN NEW.refusal_reason IS NOT NULL THEN ' Motif: ' || NEW.refusal_reason ELSE '' END)
      WHEN 'ready' THEN 'Votre commande est prête.'
      WHEN 'delivered' THEN 'Votre commande a été livrée.'
      WHEN 'cancelled' THEN 'Votre commande a été annulée.'
      ELSE 'Statut de votre commande mis à jour.'
    END,
    jsonb_build_object(
      'farm_order_id', NEW.id,
      'status', NEW.status,
      'action_url', '/merchant/farm-orders'
    ),
    false,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_merchant_farm_order_status ON public.farm_orders;
CREATE TRIGGER trigger_notify_merchant_farm_order_status
  AFTER UPDATE OF status ON public.farm_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_merchant_farm_order_status_change();

COMMIT;
