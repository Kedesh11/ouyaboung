-- ==========================================
-- Drivers & Delivery (Chauffeurs — livraison agriculteur -> commerçant)
-- Date: 2026-08-07
-- Purpose:
-- 1) Add 'driver' role
-- 2) Create drivers / deliveries / driver_locations tables
-- 3) Bridge triggers with farm_orders (ready -> unassigned delivery,
--    delivered/cancelled -> close delivery, delivery delivered -> close order)
-- 4) Atomic accept_delivery RPC (prevents two drivers claiming the same job)
-- 5) RLS following the merchant/farmer ownership pattern
-- 6) Notifications on assignment + status changes
-- 7) Storage bucket for delivery proof photos
-- ==========================================

BEGIN;

------------------------------------------------
-- 1) Allow 'driver' role on profiles / user_roles
------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'merchant', 'admin', 'farmer', 'driver'));

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('user', 'merchant', 'admin', 'farmer', 'driver'));

------------------------------------------------
-- 2) TABLE: drivers (individual, not a business — no slug/public page)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  vehicle_type text NOT NULL
    CHECK (vehicle_type IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other')),
  plate_number text,
  phone text NOT NULL,
  email text NOT NULL,
  photo_url text,
  city text NOT NULL,
  delivery_zone text,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_refused boolean NOT NULL DEFAULT false,
  validated_at timestamptz,
  refused_at timestamptz,
  refusal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drivers_refusal_reason_required CHECK (
    is_refused = false OR (refusal_reason IS NOT NULL AND btrim(refusal_reason) <> '')
  )
);

CREATE INDEX IF NOT EXISTS drivers_city_idx ON public.drivers(city);
CREATE INDEX IF NOT EXISTS drivers_is_active_idx ON public.drivers(is_active);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_drivers_updated_at ON public.drivers;
CREATE TRIGGER set_drivers_updated_at
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

------------------------------------------------
-- 3) TABLE: deliveries (1:1 with farm_orders for this phase)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_order_id uuid NOT NULL UNIQUE REFERENCES public.farm_orders(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled')),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  proof_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_driver_id_idx ON public.deliveries(driver_id);
CREATE INDEX IF NOT EXISTS deliveries_status_idx ON public.deliveries(status);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_deliveries_updated_at ON public.deliveries;
CREATE TRIGGER set_deliveries_updated_at
BEFORE UPDATE ON public.deliveries
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

------------------------------------------------
-- 4) TABLE: driver_locations (tracked only during an active delivery)
------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_locations_delivery_recorded_idx
  ON public.driver_locations(delivery_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS driver_locations_driver_recorded_idx
  ON public.driver_locations(driver_id, recorded_at DESC);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

------------------------------------------------
-- 5) SECURITY DEFINER helper (mirrors is_farmer / is_merchant)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_driver(user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = user_uuid AND role = 'driver'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

------------------------------------------------
-- 6) Auto-provision driver row from profile (mirrors ensure_farmer_profile_from_profile)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_driver_profile_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_meta jsonb := '{}'::jsonb;
  v_full_name text;
  v_vehicle_type text;
  v_plate_number text;
  v_phone text;
  v_city text;
  v_delivery_zone text;
  v_linked_id uuid;
BEGIN
  IF COALESCE(NEW.role, '') <> 'driver' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(raw_user_meta_data, '{}'::jsonb)
  INTO v_meta
  FROM auth.users
  WHERE id = NEW.user_id;

  v_full_name := COALESCE(NULLIF(v_meta->>'full_name', ''), NULLIF(NEW.full_name, ''), SPLIT_PART(NEW.email, '@', 1), 'Chauffeur');
  v_vehicle_type := COALESCE(NULLIF(v_meta->>'vehicle_type', ''), 'other');
  v_plate_number := NULLIF(v_meta->>'plate_number', '');
  v_phone := COALESCE(NULLIF(v_meta->>'phone', ''), 'À compléter');
  v_city := COALESCE(NULLIF(v_meta->>'city', ''), 'Libreville');
  v_delivery_zone := NULLIF(v_meta->>'delivery_zone', '');

  v_vehicle_type := CASE
    WHEN v_vehicle_type IN ('moto', 'voiture', 'camionnette', 'tricycle', 'other') THEN v_vehicle_type
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

  -- 1) Link pre-registration driver application (email match)
  UPDATE public.drivers
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
    FROM public.drivers
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 3) Create driver row if still missing
  IF v_linked_id IS NULL THEN
    INSERT INTO public.drivers (
      user_id, full_name, vehicle_type, plate_number, phone, email, city, delivery_zone,
      rating, total_reviews, is_verified, is_active, is_refused
    )
    VALUES (
      NEW.user_id, v_full_name, v_vehicle_type, v_plate_number, v_phone, NEW.email, v_city, v_delivery_zone,
      0, 0, false, false, false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_driver_profile_on_profile ON public.profiles;
CREATE TRIGGER trigger_ensure_driver_profile_on_profile
AFTER INSERT OR UPDATE OF role, email ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_driver_profile_from_profile();

------------------------------------------------
-- 7) RPC: accept_delivery (atomic claim, prevents double-accept race)
------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_delivery(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_driver public.drivers%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED', 'message', 'Authentication required');
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_user_id;

  IF NOT FOUND
    OR v_driver.is_verified IS DISTINCT FROM true
    OR v_driver.is_active IS DISTINCT FROM true
    OR COALESCE(v_driver.is_refused, false) = true
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'DRIVER_NOT_APPROVED',
      'message', 'Votre profil chauffeur doit être approuvé pour accepter des livraisons.'
    );
  END IF;

  SELECT * INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Livraison introuvable');
  END IF;

  IF v_delivery.status <> 'unassigned' OR v_delivery.driver_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_ASSIGNED',
      'message', 'Cette livraison a déjà été prise en charge par un autre chauffeur.'
    );
  END IF;

  UPDATE public.deliveries
  SET driver_id = v_driver.id,
      status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_delivery_id;

  RETURN jsonb_build_object('success', true, 'delivery_id', p_delivery_id);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCEPT_DELIVERY_FAILED', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_delivery(uuid) IS
  'Atomically assigns a delivery to the calling (approved) driver under a row lock, preventing two drivers from claiming the same job.';

------------------------------------------------
-- 8) Bridge triggers with farm_orders
------------------------------------------------

-- 8a) farm_orders -> ready: make the delivery available to the driver pool
CREATE OR REPLACE FUNCTION public.create_delivery_for_ready_farm_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    INSERT INTO public.deliveries (farm_order_id, status)
    VALUES (NEW.id, 'unassigned')
    ON CONFLICT (farm_order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_delivery_on_farm_order_ready ON public.farm_orders;
CREATE TRIGGER trigger_create_delivery_on_farm_order_ready
AFTER UPDATE OF status ON public.farm_orders
FOR EACH ROW
EXECUTE FUNCTION public.create_delivery_for_ready_farm_order();

-- 8b) farm_orders -> delivered/cancelled (farmer self-manages, no driver used):
--     close the matching delivery so it stops showing as active/available.
CREATE OR REPLACE FUNCTION public.close_delivery_on_farm_order_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.deliveries
    SET status = 'delivered', delivered_at = now(), updated_at = now()
    WHERE farm_order_id = NEW.id
      AND status NOT IN ('delivered', 'cancelled');
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.deliveries
    SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Commande annulée', updated_at = now()
    WHERE farm_order_id = NEW.id
      AND status NOT IN ('delivered', 'cancelled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_close_delivery_on_farm_order_close ON public.farm_orders;
CREATE TRIGGER trigger_close_delivery_on_farm_order_close
AFTER UPDATE OF status ON public.farm_orders
FOR EACH ROW
EXECUTE FUNCTION public.close_delivery_on_farm_order_close();

-- 8c) deliveries -> delivered (driver-driven): close the farm_order too.
CREATE OR REPLACE FUNCTION public.close_farm_order_on_delivery_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.farm_orders
    SET status = 'delivered', delivered_at = now(), updated_at = now()
    WHERE id = NEW.farm_order_id
      AND status <> 'delivered';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_close_farm_order_on_delivery_delivered ON public.deliveries;
CREATE TRIGGER trigger_close_farm_order_on_delivery_delivered
AFTER UPDATE OF status ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.close_farm_order_on_delivery_delivered();

------------------------------------------------
-- 9) RLS policies
------------------------------------------------

-- drivers: own profile, admin, and parties to a delivery they're assigned to
DROP POLICY IF EXISTS "Drivers can manage own profile" ON public.drivers;
CREATE POLICY "Drivers can manage own profile"
  ON public.drivers FOR ALL
  TO authenticated
  USING ( public.is_driver(auth.uid()) AND user_id = auth.uid() );

DROP POLICY IF EXISTS "Admins can manage all drivers" ON public.drivers;
CREATE POLICY "Admins can manage all drivers"
  ON public.drivers FOR ALL
  TO authenticated
  USING ( public.is_admin(auth.uid()) );

-- SECURITY DEFINER helpers (mirrors is_admin/is_merchant from
-- 20260128150000_fix_rls_recursion.sql): drivers <-> deliveries policies
-- reference each other's table, and a plain EXISTS subquery re-triggers the
-- other table's RLS, which references drivers again - infinite recursion
-- ("infinite recursion detected in policy for relation drivers"). Routing
-- the cross-table lookups through SECURITY DEFINER functions bypasses RLS
-- for just that internal lookup, breaking the cycle.
CREATE OR REPLACE FUNCTION public.is_approved_driver(user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE user_id = user_uuid AND is_verified = true AND is_active = true AND COALESCE(is_refused, false) = false
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.owns_delivery(p_delivery_driver_id uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE id = p_delivery_driver_id AND user_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.driver_visible_to_delivery_parties(p_driver_id uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deliveries d
    JOIN public.farm_orders fo ON fo.id = d.farm_order_id
    LEFT JOIN public.farmers f ON f.id = fo.farmer_id
    LEFT JOIN public.merchants m ON m.id = fo.merchant_id
    WHERE d.driver_id = p_driver_id
      AND (f.user_id = user_uuid OR m.user_id = user_uuid)
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Delivery parties can view assigned driver" ON public.drivers;
CREATE POLICY "Delivery parties can view assigned driver"
  ON public.drivers FOR SELECT
  TO authenticated
  USING ( public.driver_visible_to_delivery_parties(drivers.id, auth.uid()) );

-- deliveries: unassigned pool visible to approved drivers, own delivery,
-- farm_order owners (farmer/merchant), admin.
DROP POLICY IF EXISTS "Approved drivers can view unassigned deliveries" ON public.deliveries;
CREATE POLICY "Approved drivers can view unassigned deliveries"
  ON public.deliveries FOR SELECT
  TO authenticated
  USING (
    status = 'unassigned'
    AND public.is_approved_driver(auth.uid())
  );

DROP POLICY IF EXISTS "Drivers can manage own deliveries" ON public.deliveries;
CREATE POLICY "Drivers can manage own deliveries"
  ON public.deliveries FOR ALL
  TO authenticated
  USING ( public.owns_delivery(deliveries.driver_id, auth.uid()) )
  WITH CHECK ( public.owns_delivery(deliveries.driver_id, auth.uid()) );

DROP POLICY IF EXISTS "Farm order parties can view their delivery" ON public.deliveries;
CREATE POLICY "Farm order parties can view their delivery"
  ON public.deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.farm_orders fo
      LEFT JOIN public.farmers f ON f.id = fo.farmer_id
      LEFT JOIN public.merchants m ON m.id = fo.merchant_id
      WHERE fo.id = deliveries.farm_order_id
        AND (f.user_id = auth.uid() OR m.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can manage all deliveries" ON public.deliveries;
CREATE POLICY "Admins can manage all deliveries"
  ON public.deliveries FOR ALL
  TO authenticated
  USING ( public.is_admin(auth.uid()) );

-- farm_orders (table from phase 2, supabase/migrations/20260807100000_create_farm_orders.sql)
-- had no policy granting drivers SELECT. deliveries.driver_id was itself
-- correctly visible, but PostgREST evaluates RLS on the *embedded*
-- farm_orders(...) table too, under the same (driver) role - with no
-- matching policy that embed silently comes back null, so the driver UI
-- fell back to placeholder text ("Produit", "Exploitation", "Commerce")
-- instead of the real product/farmer/merchant names. A plain EXISTS
-- subquery on deliveries here also re-triggers deliveries' own RLS, which
-- references farm_orders again ("Farm order parties can view their
-- delivery") - infinite recursion, same shape as the drivers<->deliveries
-- cycle above. Routed through a SECURITY DEFINER helper for the same
-- reason those were.
CREATE OR REPLACE FUNCTION public.driver_can_view_farm_order(p_farm_order_id uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.farm_order_id = p_farm_order_id
      AND (
        (d.status = 'unassigned' AND public.is_approved_driver(user_uuid))
        OR public.owns_delivery(d.driver_id, user_uuid)
      )
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Drivers can view farm orders tied to visible deliveries" ON public.farm_orders;
CREATE POLICY "Drivers can view farm orders tied to visible deliveries"
  ON public.farm_orders FOR SELECT
  TO authenticated
  USING ( public.driver_can_view_farm_order(farm_orders.id, auth.uid()) );

-- driver_locations: insert by the assigned driver only, read by driver +
-- farm_order parties + admin.
DROP POLICY IF EXISTS "Assigned driver can insert own locations" ON public.driver_locations;
CREATE POLICY "Assigned driver can insert own locations"
  ON public.driver_locations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drivers dr
      WHERE dr.id = driver_locations.driver_id AND dr.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = driver_locations.delivery_id AND d.driver_id = driver_locations.driver_id
    )
  );

DROP POLICY IF EXISTS "Delivery parties can view driver locations" ON public.driver_locations;
CREATE POLICY "Delivery parties can view driver locations"
  ON public.driver_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers dr
      WHERE dr.id = driver_locations.driver_id AND dr.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.deliveries d
      JOIN public.farm_orders fo ON fo.id = d.farm_order_id
      LEFT JOIN public.farmers f ON f.id = fo.farmer_id
      LEFT JOIN public.merchants m ON m.id = fo.merchant_id
      WHERE d.id = driver_locations.delivery_id
        AND (f.user_id = auth.uid() OR m.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all driver locations" ON public.driver_locations;
CREATE POLICY "Admins can view all driver locations"
  ON public.driver_locations FOR SELECT
  TO authenticated
  USING ( public.is_admin(auth.uid()) );

------------------------------------------------
-- 10) Notifications
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
      'driver_pending',
      'driver_verified',
      'driver_refused',
      'delivery_assigned',
      'delivery_picked_up',
      'delivery_delivered',
      'promotion',
      'system'
    ));
END $$;

-- Notify admins of a new pending driver (mirrors notify_admin_new_farmer)
CREATE OR REPLACE FUNCTION public.notify_admin_new_driver()
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
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_admin_user_id
        AND n.type = 'driver_pending'
        AND n.data->>'driver_id' = NEW.id::text
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (
      v_admin_user_id,
      'driver_pending',
      'Nouvelle demande chauffeur',
      format('%s (%s, %s) demande à rejoindre la plateforme', NEW.full_name, NEW.vehicle_type, NEW.city),
      jsonb_build_object(
        'driver_id', NEW.id,
        'full_name', NEW.full_name,
        'vehicle_type', NEW.vehicle_type,
        'email', NEW.email,
        'city', NEW.city,
        'phone', NEW.phone,
        'action_url', '/admin/validations'
      ),
      false,
      now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_admin_driver ON public.drivers;
CREATE TRIGGER trigger_notify_admin_driver
  AFTER INSERT ON public.drivers
  FOR EACH ROW
  WHEN (NEW.is_verified = false AND COALESCE(NEW.is_refused, false) = false)
  EXECUTE FUNCTION public.notify_admin_new_driver();

-- Notify farmer + merchant when a driver accepts their delivery
CREATE OR REPLACE FUNCTION public.notify_parties_delivery_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer_user_id uuid;
  v_merchant_user_id uuid;
  v_driver_name text;
  v_notif_type text;
  v_title text;
  v_message text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('accepted', 'picked_up', 'delivered') THEN
    RETURN NEW;
  END IF;

  SELECT f.user_id, m.user_id
  INTO v_farmer_user_id, v_merchant_user_id
  FROM public.farm_orders fo
  LEFT JOIN public.farmers f ON f.id = fo.farmer_id
  LEFT JOIN public.merchants m ON m.id = fo.merchant_id
  WHERE fo.id = NEW.farm_order_id;

  SELECT full_name INTO v_driver_name FROM public.drivers WHERE id = NEW.driver_id;

  v_notif_type := CASE NEW.status
    WHEN 'accepted' THEN 'delivery_assigned'
    WHEN 'picked_up' THEN 'delivery_picked_up'
    WHEN 'delivered' THEN 'delivery_delivered'
  END;
  v_title := CASE NEW.status
    WHEN 'accepted' THEN 'Chauffeur assigné'
    WHEN 'picked_up' THEN 'Commande récupérée'
    WHEN 'delivered' THEN 'Commande livrée'
  END;
  v_message := CASE NEW.status
    WHEN 'accepted' THEN format('%s prend en charge la livraison de votre commande.', COALESCE(v_driver_name, 'Un chauffeur'))
    WHEN 'picked_up' THEN format('%s a récupéré la commande et est en route.', COALESCE(v_driver_name, 'Le chauffeur'))
    WHEN 'delivered' THEN 'La commande a été livrée.'
  END;

  IF v_farmer_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (v_farmer_user_id, v_notif_type, v_title, v_message,
      jsonb_build_object('delivery_id', NEW.id, 'farm_order_id', NEW.farm_order_id, 'action_url', '/farmer/orders'),
      false, now());
  END IF;

  IF v_merchant_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
    VALUES (v_merchant_user_id, v_notif_type, v_title, v_message,
      jsonb_build_object('delivery_id', NEW.id, 'farm_order_id', NEW.farm_order_id, 'action_url', '/merchant/farm-orders'),
      false, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_parties_delivery_status ON public.deliveries;
CREATE TRIGGER trigger_notify_parties_delivery_status
  AFTER UPDATE OF status ON public.deliveries
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_parties_delivery_status_change();

------------------------------------------------
-- 11) Storage bucket for delivery proof photos (private)
------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-proofs', 'delivery-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Drivers can upload delivery proofs" ON storage.objects;
CREATE POLICY "Drivers can upload delivery proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-proofs'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'driver')
  );

-- Uploads are stored under `${deliveryId}/${filename}` (see
-- uploadDeliveryProof in storage.service.ts) so the first path segment
-- identifies the delivery for RLS scoping.
DROP POLICY IF EXISTS "Delivery parties can view delivery proofs" ON storage.objects;
CREATE POLICY "Delivery parties can view delivery proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role IN ('driver', 'admin'))
      OR EXISTS (
        SELECT 1
        FROM public.deliveries d
        JOIN public.farm_orders fo ON fo.id = d.farm_order_id
        LEFT JOIN public.farmers f ON f.id = fo.farmer_id
        LEFT JOIN public.merchants m ON m.id = fo.merchant_id
        WHERE d.id::text = split_part(storage.objects.name, '/', 1)
          AND (f.user_id = auth.uid() OR m.user_id = auth.uid())
      )
    )
  );

COMMIT;
