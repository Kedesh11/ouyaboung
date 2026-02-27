-- ==========================================
-- Merchant Pending Workflow Hardening
-- Date: 2026-02-27
-- Purpose:
-- 1) Ensure merchant records exist for merchant accounts
-- 2) Enforce pending/approved/rejected visibility and product permissions
-- 3) Notify admins for every new pending merchant
-- 4) Expose admin contacts via a secure helper function for server routes
-- ==========================================

BEGIN;

-- Keep columns aligned across environments
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS is_refused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS refused_at timestamptz,
  ADD COLUMN IF NOT EXISTS refusal_reason text;

-- Normalize common city values coming from legacy forms
UPDATE public.merchants SET city = 'Libreville' WHERE lower(city) IN ('libreville');
UPDATE public.merchants SET city = 'Port-Gentil' WHERE lower(city) IN ('port-gentil', 'port gentil', 'port_gentil');
UPDATE public.merchants SET city = 'Franceville' WHERE lower(city) IN ('franceville');
UPDATE public.merchants SET city = 'Oyem' WHERE lower(city) IN ('oyem');
UPDATE public.merchants SET city = 'Moanda' WHERE lower(city) IN ('moanda');

-- Pending merchants must not be publicly active
UPDATE public.merchants
SET is_active = false,
    updated_at = now()
WHERE is_verified = false
  AND COALESCE(is_refused, false) = false;

-- Ensure notification type check includes merchant workflow notifications
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
      'promotion',
      'system'
    ));
END $$;

-- Helper: return admin contacts for server-side notification/email dispatch
CREATE OR REPLACE FUNCTION public.get_admin_contacts()
RETURNS TABLE(user_id uuid, email text, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.email, p.full_name
  FROM public.profiles p
  WHERE p.role = 'admin'
    AND p.user_id IS NOT NULL
    AND p.email IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_contacts() TO authenticated;

-- Ensure merchant row exists when a profile with role=merchant is created/updated
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

DROP TRIGGER IF EXISTS trigger_ensure_merchant_profile_on_profile ON public.profiles;
CREATE TRIGGER trigger_ensure_merchant_profile_on_profile
AFTER INSERT OR UPDATE OF role, email ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_merchant_profile_from_profile();

-- Backfill: create merchant rows for existing merchant profiles without merchant row
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
  rating,
  total_reviews,
  is_verified,
  is_active,
  is_refused,
  slug
)
SELECT
  p.user_id,
  COALESCE(NULLIF(au.raw_user_meta_data->>'business_name', ''), NULLIF(p.full_name, ''), SPLIT_PART(p.email, '@', 1), 'Mon Commerce') AS business_name,
  CASE
    WHEN COALESCE(au.raw_user_meta_data->>'business_type', 'other') IN ('restaurant','bakery','grocery','supermarket','hotel','caterer','other')
      THEN COALESCE(au.raw_user_meta_data->>'business_type', 'other')
    ELSE 'other'
  END AS business_type,
  COALESCE(au.raw_user_meta_data->>'description', '') AS description,
  COALESCE(NULLIF(au.raw_user_meta_data->>'address', ''), 'À compléter') AS address,
  CASE lower(COALESCE(NULLIF(au.raw_user_meta_data->>'city', ''), 'Libreville'))
    WHEN 'libreville' THEN 'Libreville'
    WHEN 'port-gentil' THEN 'Port-Gentil'
    WHEN 'port gentil' THEN 'Port-Gentil'
    WHEN 'port_gentil' THEN 'Port-Gentil'
    WHEN 'franceville' THEN 'Franceville'
    WHEN 'oyem' THEN 'Oyem'
    WHEN 'moanda' THEN 'Moanda'
    ELSE COALESCE(NULLIF(au.raw_user_meta_data->>'city', ''), 'Libreville')
  END AS city,
  COALESCE(NULLIF(au.raw_user_meta_data->>'quartier', ''), 'À compléter') AS quartier,
  COALESCE(NULLIF(au.raw_user_meta_data->>'phone', ''), 'À compléter') AS phone,
  p.email,
  0,
  0,
  false,
  false,
  false,
  CONCAT(
    regexp_replace(
      regexp_replace(lower(COALESCE(NULLIF(au.raw_user_meta_data->>'business_name', ''), NULLIF(p.full_name, ''), SPLIT_PART(p.email, '@', 1), 'commerce')), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
    '-',
    FLOOR(RANDOM() * 100000)::text
  )
FROM public.profiles p
LEFT JOIN public.merchants m ON m.user_id = p.user_id
LEFT JOIN auth.users au ON au.id = p.user_id
WHERE p.role = 'merchant'
  AND p.user_id IS NOT NULL
  AND m.id IS NULL;

-- Public merchants: only approved + active
DROP POLICY IF EXISTS "Anyone can view active merchants" ON public.merchants;
CREATE POLICY "Anyone can view active merchants"
  ON public.merchants FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND is_verified = true
    AND COALESCE(is_refused, false) = false
  );

-- Public food items: only from approved + active merchants
DROP POLICY IF EXISTS "Anyone can view available food items" ON public.food_items;
CREATE POLICY "Anyone can view available food items"
  ON public.food_items FOR SELECT
  TO anon, authenticated
  USING (
    is_available = true
    AND quantity_available > 0
    AND EXISTS (
      SELECT 1
      FROM public.merchants m
      WHERE m.id = food_items.merchant_id
        AND m.is_active = true
        AND m.is_verified = true
        AND COALESCE(m.is_refused, false) = false
    )
  );

-- Merchants can manage food items only if approved + active + not refused
DROP POLICY IF EXISTS "Merchants can manage own food items" ON public.food_items;
CREATE POLICY "Merchants can manage own food items"
  ON public.food_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.merchants m
      JOIN public.profiles p ON p.user_id = m.user_id
      WHERE m.id = food_items.merchant_id
        AND m.user_id = auth.uid()
        AND p.role = 'merchant'
        AND m.is_verified = true
        AND m.is_active = true
        AND COALESCE(m.is_refused, false) = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.merchants m
      JOIN public.profiles p ON p.user_id = m.user_id
      WHERE m.id = food_items.merchant_id
        AND m.user_id = auth.uid()
        AND p.role = 'merchant'
        AND m.is_verified = true
        AND m.is_active = true
        AND COALESCE(m.is_refused, false) = false
    )
  );

-- Notify admins for every new pending merchant (with dedup)
CREATE OR REPLACE FUNCTION public.notify_admin_new_merchant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_user_id uuid;
BEGIN
  IF NEW.is_verified = true OR COALESCE(NEW.is_refused, false) = true THEN
    RETURN NEW;
  END IF;

  FOR v_admin_user_id IN
    SELECT user_id FROM public.profiles WHERE role = 'admin' AND user_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = v_admin_user_id
        AND n.type = 'merchant_pending'
        AND n.data->>'merchant_id' = NEW.id::text
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      is_read,
      created_at
    )
    VALUES (
      v_admin_user_id,
      'merchant_pending',
      'Nouvelle demande marchand',
      format('Le commerce "%s" (%s, %s) demande à rejoindre la plateforme',
        NEW.business_name,
        NEW.business_type,
        NEW.city
      ),
      jsonb_build_object(
        'merchant_id', NEW.id,
        'business_name', NEW.business_name,
        'business_type', NEW.business_type,
        'email', NEW.email,
        'city', NEW.city,
        'phone', NEW.phone,
        'action_url', '/admin/validations'
      ),
      false,
      now()
    );
  END LOOP;

  RAISE LOG 'Admin notified for new merchant: % (ID: %)', NEW.business_name, NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_admin_merchant ON public.merchants;
CREATE TRIGGER trigger_notify_admin_merchant
  AFTER INSERT ON public.merchants
  FOR EACH ROW
  WHEN (NEW.is_verified = false AND COALESCE(NEW.is_refused, false) = false)
  EXECUTE FUNCTION public.notify_admin_new_merchant();

COMMIT;
