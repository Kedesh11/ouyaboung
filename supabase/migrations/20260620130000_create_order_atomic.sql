-- ============================================
-- Atomic order creation
-- Date: 2026-06-20
-- Purpose:
--   Ensure reservation creation and stock decrement happen in one
--   database transaction under a row lock.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_food_item_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_food_item public.food_items%ROWTYPE;
  v_merchant public.merchants%ROWTYPE;
  v_total_price integer;
  v_original_total integer;
  v_savings integer;
  v_pickup_code text;
  v_order public.orders%ROWTYPE;
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

  SELECT *
  INTO v_food_item
  FROM public.food_items
  WHERE id = p_food_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_FOUND',
      'message', 'Food item not found'
    );
  END IF;

  SELECT *
  INTO v_merchant
  FROM public.merchants
  WHERE id = v_food_item.merchant_id;

  IF NOT FOUND
    OR v_merchant.is_verified IS DISTINCT FROM true
    OR v_merchant.is_active IS DISTINCT FROM true
    OR COALESCE(v_merchant.is_refused, false) = true
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MERCHANT_NOT_APPROVED',
      'message', 'Ce commerce n''est pas encore approuve ou n''est plus actif.'
    );
  END IF;

  IF v_food_item.is_available IS DISTINCT FROM true
    OR COALESCE(v_food_item.quantity_available, 0) < p_quantity
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_QUANTITY',
      'message', 'Not enough items available'
    );
  END IF;

  v_total_price := v_food_item.discounted_price * p_quantity;
  v_original_total := v_food_item.original_price * p_quantity;
  v_savings := v_original_total - v_total_price;
  v_pickup_code := 'PK' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  INSERT INTO public.orders (
    user_id,
    merchant_id,
    food_item_id,
    quantity,
    total_price,
    original_total,
    savings,
    status,
    pickup_code
  )
  VALUES (
    v_user_id,
    v_food_item.merchant_id,
    v_food_item.id,
    p_quantity,
    v_total_price,
    v_original_total,
    v_savings,
    'pending',
    v_pickup_code
  )
  RETURNING *
  INTO v_order;

  UPDATE public.food_items
  SET
    quantity_available = quantity_available - p_quantity,
    is_available = (quantity_available - p_quantity) > 0,
    updated_at = now()
  WHERE id = v_food_item.id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CREATE_ORDER_ATOMIC_FAILED',
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.create_order_atomic(uuid, integer) IS
  'Atomically creates a reservation and decrements food_items.quantity_available under a row lock.';

DROP POLICY IF EXISTS "Users can view food items from own orders" ON public.food_items;
CREATE POLICY "Users can view food items from own orders"
  ON public.food_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.food_item_id = food_items.id
        AND o.user_id = auth.uid()
    )
  );

COMMIT;
