-- ==========================================
-- Farmers Directory (Répertoire des agriculteurs)
-- Date: 2026-08-06
-- Purpose:
-- 1) Add 'farmer' role
-- 2) Create farmers / farm_products tables (mirrors merchants / food_items,
--    kept fully separate per product decision)
-- 3) RLS following the same 3-tier pattern (public / owner / admin)
-- 4) Auto-provision farmer row from profile + notify admins on new pending farmer
-- ==========================================

BEGIN;

------------------------------------------------
-- 1) Allow 'farmer' role on profiles / user_roles
------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'merchant', 'admin', 'farmer'));

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('user', 'merchant', 'admin', 'farmer'));

------------------------------------------------
-- 2) TABLE: farmers (mirrors public.merchants)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.farmers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  farm_name text NOT NULL,
  farmer_type text NOT NULL
    CHECK (farmer_type IN ('agriculture', 'elevage', 'peche', 'mixte', 'other')),
  description text,
  logo_url text,
  cover_image_url text,
  address text NOT NULL,
  city text NOT NULL,
  quartier text NOT NULL,
  latitude double precision,
  longitude double precision,
  phone text NOT NULL,
  email text NOT NULL,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_refused boolean NOT NULL DEFAULT false,
  validated_at timestamptz,
  refused_at timestamptz,
  refusal_reason text,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farmers_refusal_reason_required CHECK (
    is_refused = false OR (refusal_reason IS NOT NULL AND btrim(refusal_reason) <> '')
  )
);

CREATE INDEX IF NOT EXISTS farmers_city_idx ON public.farmers(city);
CREATE INDEX IF NOT EXISTS farmers_quartier_idx ON public.farmers(quartier);
CREATE INDEX IF NOT EXISTS farmers_is_active_idx ON public.farmers(is_active);
CREATE INDEX IF NOT EXISTS farmers_farmer_type_idx ON public.farmers(farmer_type);

ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;

------------------------------------------------
-- 3) TABLE: farm_products (mirrors public.food_items)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.farm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL
    CHECK (category IN (
      'tubercules',
      'legumes_feuilles',
      'fruits',
      'cereales',
      'elevage_volaille',
      'elevage_betail',
      'peche',
      'autre'
    )),
  unit text NOT NULL DEFAULT 'kg',
  price_per_unit integer NOT NULL, -- XAF
  quantity_available numeric(10,2) NOT NULL DEFAULT 0,
  available_from date,
  available_until date,
  image_url text,
  images text[],
  is_available boolean NOT NULL DEFAULT true,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_products_farmer_id_idx ON public.farm_products(farmer_id);
CREATE INDEX IF NOT EXISTS farm_products_category_idx ON public.farm_products(category);
CREATE INDEX IF NOT EXISTS farm_products_is_available_idx ON public.farm_products(is_available);

ALTER TABLE public.farm_products ENABLE ROW LEVEL SECURITY;

------------------------------------------------
-- 4) updated_at triggers (reuse public.set_updated_at)
------------------------------------------------
DROP TRIGGER IF EXISTS set_farmers_updated_at ON public.farmers;
CREATE TRIGGER set_farmers_updated_at
BEFORE UPDATE ON public.farmers
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_farm_products_updated_at ON public.farm_products;
CREATE TRIGGER set_farm_products_updated_at
BEFORE UPDATE ON public.farm_products
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

------------------------------------------------
-- 5) Slugs (reuse public.generate_slug)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_farmers_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.generate_slug(NEW.farm_name) || '-' || substring(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS tr_farmers_slug_trigger ON public.farmers;
CREATE TRIGGER tr_farmers_slug_trigger
BEFORE INSERT ON public.farmers
FOR EACH ROW EXECUTE PROCEDURE public.tr_farmers_slug();

CREATE OR REPLACE FUNCTION public.tr_farm_products_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.generate_slug(NEW.name) || '-' || substring(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS tr_farm_products_slug_trigger ON public.farm_products;
CREATE TRIGGER tr_farm_products_slug_trigger
BEFORE INSERT ON public.farm_products
FOR EACH ROW EXECUTE PROCEDURE public.tr_farm_products_slug();

------------------------------------------------
-- 6) SECURITY DEFINER helper (mirrors is_merchant)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_farmer(user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = user_uuid AND role = 'farmer'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

------------------------------------------------
-- 7) RLS policies (mirrors merchants / food_items current policies)
------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view active farmers" ON public.farmers;
CREATE POLICY "Anyone can view active farmers"
  ON public.farmers FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND is_verified = true
    AND COALESCE(is_refused, false) = false
  );

DROP POLICY IF EXISTS "Admins can manage all farmers" ON public.farmers;
CREATE POLICY "Admins can manage all farmers"
  ON public.farmers FOR ALL
  TO authenticated
  USING ( public.is_admin(auth.uid()) );

DROP POLICY IF EXISTS "Farmers can manage own profile" ON public.farmers;
CREATE POLICY "Farmers can manage own profile"
  ON public.farmers FOR ALL
  TO authenticated
  USING ( public.is_farmer(auth.uid()) AND user_id = auth.uid() );

DROP POLICY IF EXISTS "Anyone can view available farm products" ON public.farm_products;
CREATE POLICY "Anyone can view available farm products"
  ON public.farm_products FOR SELECT
  TO anon, authenticated
  USING (
    is_available = true
    AND quantity_available > 0
    AND EXISTS (
      SELECT 1
      FROM public.farmers f
      WHERE f.id = farm_products.farmer_id
        AND f.is_active = true
        AND f.is_verified = true
        AND COALESCE(f.is_refused, false) = false
    )
  );

DROP POLICY IF EXISTS "Admins can manage all farm products" ON public.farm_products;
CREATE POLICY "Admins can manage all farm products"
  ON public.farm_products FOR ALL
  TO authenticated
  USING ( public.is_admin(auth.uid()) );

DROP POLICY IF EXISTS "Farmers can manage own products" ON public.farm_products;
CREATE POLICY "Farmers can manage own products"
  ON public.farm_products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.farmers f
      WHERE f.id = farm_products.farmer_id
        AND f.user_id = auth.uid()
        AND public.is_farmer(auth.uid())
        AND f.is_verified = true
        AND f.is_active = true
        AND COALESCE(f.is_refused, false) = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.farmers f
      WHERE f.id = farm_products.farmer_id
        AND f.user_id = auth.uid()
        AND public.is_farmer(auth.uid())
        AND f.is_verified = true
        AND f.is_active = true
        AND COALESCE(f.is_refused, false) = false
    )
  );

------------------------------------------------
-- 8) Notification type + admin notify trigger (mirrors merchant_pending)
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
      'promotion',
      'system'
    ));
END $$;

CREATE OR REPLACE FUNCTION public.notify_admin_new_farmer()
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
        AND n.type = 'farmer_pending'
        AND n.data->>'farmer_id' = NEW.id::text
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (
      user_id, type, title, message, data, is_read, created_at
    )
    VALUES (
      v_admin_user_id,
      'farmer_pending',
      'Nouvelle demande agriculteur',
      format('L''exploitation "%s" (%s, %s) demande à rejoindre la plateforme',
        NEW.farm_name, NEW.farmer_type, NEW.city
      ),
      jsonb_build_object(
        'farmer_id', NEW.id,
        'farm_name', NEW.farm_name,
        'farmer_type', NEW.farmer_type,
        'email', NEW.email,
        'city', NEW.city,
        'phone', NEW.phone,
        'action_url', '/admin/validations'
      ),
      false,
      now()
    );
  END LOOP;

  RAISE LOG 'Admin notified for new farmer: % (ID: %)', NEW.farm_name, NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_admin_farmer ON public.farmers;
CREATE TRIGGER trigger_notify_admin_farmer
  AFTER INSERT ON public.farmers
  FOR EACH ROW
  WHEN (NEW.is_verified = false AND COALESCE(NEW.is_refused, false) = false)
  EXECUTE FUNCTION public.notify_admin_new_farmer();

------------------------------------------------
-- 9) Auto-provision farmer row from profile (mirrors ensure_merchant_profile_from_profile)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_farmer_profile_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_meta jsonb := '{}'::jsonb;
  v_farm_name text;
  v_farmer_type text;
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
  IF COALESCE(NEW.role, '') <> 'farmer' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(raw_user_meta_data, '{}'::jsonb)
  INTO v_meta
  FROM auth.users
  WHERE id = NEW.user_id;

  v_farm_name := COALESCE(NULLIF(v_meta->>'farm_name', ''), NULLIF(NEW.full_name, ''), SPLIT_PART(NEW.email, '@', 1), 'Mon Exploitation');
  v_farmer_type := COALESCE(NULLIF(v_meta->>'farmer_type', ''), 'other');
  v_description := COALESCE(v_meta->>'description', '');
  v_phone := COALESCE(NULLIF(v_meta->>'phone', ''), 'À compléter');
  v_address := COALESCE(NULLIF(v_meta->>'address', ''), 'À compléter');
  v_city := COALESCE(NULLIF(v_meta->>'city', ''), 'Libreville');
  v_quartier := COALESCE(NULLIF(v_meta->>'quartier', ''), 'À compléter');

  v_farmer_type := CASE
    WHEN v_farmer_type IN ('agriculture', 'elevage', 'peche', 'mixte', 'other') THEN v_farmer_type
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

  -- 1) Link pre-registration farmer application (email match)
  UPDATE public.farmers
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
    FROM public.farmers
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 3) Create farmer row if still missing
  IF v_linked_id IS NULL THEN
    v_slug := regexp_replace(lower(v_farm_name), '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
    IF v_slug = '' THEN
      v_slug := 'exploitation';
    END IF;

    INSERT INTO public.farmers (
      user_id, farm_name, farmer_type, description, address, city, quartier,
      phone, email, latitude, longitude, rating, total_reviews,
      is_verified, is_active, is_refused, slug
    )
    VALUES (
      NEW.user_id, v_farm_name, v_farmer_type, v_description, v_address, v_city, v_quartier,
      v_phone, NEW.email, v_latitude, v_longitude, 0, 0,
      false, false, false,
      CONCAT(v_slug, '-', FLOOR(RANDOM() * 100000)::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_farmer_profile_on_profile ON public.profiles;
CREATE TRIGGER trigger_ensure_farmer_profile_on_profile
AFTER INSERT OR UPDATE OF role, email ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_farmer_profile_from_profile();

COMMIT;
