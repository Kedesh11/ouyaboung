-- ==========================================
-- Notify all users when a new listing is published
-- Date: 2026-02-27
-- ==========================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_users_new_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_merchant_name text;
  v_title text;
  v_message text;
BEGIN
  -- Notify on INSERT, or when an UPDATE makes a listing visible again on platform.
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      COALESCE(NEW.is_available, false) = true
      AND COALESCE(NEW.quantity_available, 0) > 0
      AND (
        COALESCE(OLD.is_available, false) = false
        OR COALESCE(OLD.quantity_available, 0) <= 0
      )
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Only notify when listing is actually visible on platform
  IF COALESCE(NEW.is_available, false) = false OR COALESCE(NEW.quantity_available, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Safety: notify only for approved/active merchants
  SELECT m.business_name
  INTO v_merchant_name
  FROM public.merchants m
  WHERE m.id = NEW.merchant_id
    AND m.is_verified = true
    AND m.is_active = true
    AND COALESCE(m.is_refused, false) = false
  LIMIT 1;

  IF v_merchant_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.category = 'mixed_basket' THEN 'Nouveau panier disponible'
    ELSE 'Nouveau produit disponible'
  END;

  v_message := CASE
    WHEN NEW.category = 'mixed_basket'
      THEN format('Le panier "%s" vient d''être publié par %s.', NEW.name, v_merchant_name)
    ELSE format('Le produit "%s" vient d''être publié par %s.', NEW.name, v_merchant_name)
  END;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data,
    is_read,
    created_at
  )
  SELECT
    p.user_id,
    'new_food_nearby',
    v_title,
    v_message,
    jsonb_build_object(
      'food_item_id', NEW.id,
      'merchant_id', NEW.merchant_id,
      'item_name', NEW.name,
      'merchant_name', v_merchant_name,
      'category', NEW.category,
      'action_url', COALESCE('/p/' || NEW.slug, '/search')
    ),
    false,
    now()
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND p.role IN ('user', 'merchant', 'admin');

  RAISE LOG 'Notifications sent for new listing % (%)', NEW.name, NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_users_new_listing ON public.food_items;

CREATE TRIGGER trigger_notify_users_new_listing
  AFTER INSERT OR UPDATE OF is_available, quantity_available ON public.food_items
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_users_new_listing();

COMMIT;
