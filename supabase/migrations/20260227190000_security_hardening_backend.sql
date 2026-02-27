-- ==========================================
-- Security hardening: roles, RLS and webhook access
-- Date: 2026-02-27
-- ==========================================

BEGIN;

-- ------------------------------------------------------------------
-- 1) Harden profile bootstrap role assignment (never trust raw metadata for admin)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_error_message text;
BEGIN
  IF new.email IN ('pendysevan11@gmail.com', 'sevankedesh11@gmail.com') THEN
    v_role := 'admin';
  ELSIF COALESCE(new.raw_user_meta_data->>'role', 'user') = 'merchant' THEN
    v_role := 'merchant';
  ELSE
    v_role := 'user';
  END IF;

  v_first_name := new.raw_user_meta_data->>'first_name';
  v_last_name := new.raw_user_meta_data->>'last_name';

  IF v_first_name IS NOT NULL AND v_last_name IS NOT NULL THEN
    v_full_name := TRIM(v_first_name || ' ' || v_last_name);
  ELSIF new.raw_user_meta_data->>'full_name' IS NOT NULL THEN
    v_full_name := new.raw_user_meta_data->>'full_name';
  ELSE
    v_full_name := SPLIT_PART(new.email, '@', 1);
  END IF;

  BEGIN
    INSERT INTO public.profiles (
      user_id,
      email,
      role,
      full_name,
      first_name,
      last_name,
      phone
    )
    VALUES (
      new.id,
      new.email,
      v_role,
      v_full_name,
      v_first_name,
      v_last_name,
      new.phone
    )
    ON CONFLICT (user_id) DO UPDATE SET
      -- Keep admin role sticky if already present
      role = CASE WHEN public.profiles.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
      first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
      updated_at = now();

    RAISE LOG 'Profile created/updated successfully for user: % (role: %)', new.email, v_role;

  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Failed to create profile for user %: %', new.email, v_error_message;
    RAISE EXCEPTION 'Profile creation failed for %: %', new.email, v_error_message;
  END;

  RETURN new;
END;
$$;

-- ------------------------------------------------------------------
-- 2) Prevent privilege escalation via profile updates
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to perform controlled role/email updates.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-admin users can only update their own non-privileged fields.
  IF auth.uid() = OLD.user_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Role update is not allowed';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'user_id update is not allowed';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Email update is not allowed on profiles table';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized profile update';
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trigger_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ------------------------------------------------------------------
-- 3) Harden transactions policies
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Service role can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own pending transactions" ON public.transactions;

CREATE POLICY "Users can insert own transactions"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = transactions.order_id
        AND o.user_id = auth.uid()
        AND o.merchant_id = transactions.merchant_id
    )
  );

CREATE POLICY "Users can update own pending transactions"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status = 'PENDING'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('PENDING', 'FAILED')
  );

CREATE POLICY "Service role can insert transactions"
  ON public.transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update transactions"
  ON public.transactions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------
-- 4) Restrict webhook logs visibility to admins only
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users (admins) to view logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;

CREATE POLICY "Admins can view webhook logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------
-- 5) Align QR consumer FK with authenticated merchant user id
-- ------------------------------------------------------------------
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_consumed_by_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_consumed_by_fkey
  FOREIGN KEY (consumed_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMIT;
