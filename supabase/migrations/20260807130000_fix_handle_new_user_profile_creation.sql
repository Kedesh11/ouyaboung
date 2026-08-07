-- ==========================================
-- Fix handle_new_user(): restore profiles row creation
-- Date: 2026-08-07
--
-- Root cause: 20260709100000_merchant_coordinates_hardening.sql redefined
-- public.handle_new_user() (the trigger function bound to
-- auth.users -> on_auth_user_created) while fixing an unrelated coordinate
-- bug, but pasted in a much older version of the function. That version
-- never inserts into public.profiles for ANY role, and only creates a
-- public.merchants row directly, bypassing the profiles table entirely.
--
-- Verified empirically against a freshly `supabase db reset` local stack:
-- creating a user with role 'user' or role 'farmer' via the auth admin API
-- produced zero rows in public.profiles.
--
-- Consequence: since that migration, no new signup (any role) gets a
-- profiles row. This breaks role-based routing (middleware/AuthContext),
-- every RLS policy keyed on profiles.role (is_admin/is_merchant/is_farmer/
-- is_driver), and the ensure_{merchant,farmer,driver}_profile_from_profile
-- triggers, which fire on INSERT/UPDATE of public.profiles and therefore
-- never run.
--
-- Fix: restore the atomic_auth_repair / externalize_admin_promotion
-- architecture (insert into public.profiles for every role, letting the
-- profile-linking triggers create the merchants/farmers/drivers row),
-- extended to recognize 'farmer' and 'driver' metadata roles which didn't
-- exist yet the last time this function was correct. Drop the direct
-- public.merchants insert entirely - it's redundant with (and now
-- inconsistent with) ensure_merchant_profile_from_profile, which already
-- performs the same Gabon-bounds coordinate sanitization independently.
-- ==========================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
  v_meta_role text;
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_error_message text;
BEGIN
  v_meta_role := COALESCE(new.raw_user_meta_data->>'role', 'user');

  IF public.is_admin_email(new.email) THEN
    v_role := 'admin';
  ELSIF v_meta_role IN ('merchant', 'farmer', 'driver') THEN
    v_role := v_meta_role;
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

-- Backfill: link/create merchants/farmers/drivers rows for any account that
-- signed up while this bug was live and is missing its profiles row. Insert
-- into profiles for those auth.users; the AFTER INSERT trigger on profiles
-- (ensure_merchant_profile_from_profile / ensure_farmer_profile_from_profile
-- / ensure_driver_profile_from_profile) then creates/links the business row
-- exactly as it does for a fresh signup.
INSERT INTO public.profiles (user_id, email, role, full_name, phone)
SELECT
  u.id,
  u.email,
  CASE
    WHEN public.is_admin_email(u.email) THEN 'admin'
    WHEN COALESCE(u.raw_user_meta_data->>'role', 'user') IN ('merchant', 'farmer', 'driver')
      THEN u.raw_user_meta_data->>'role'
    ELSE 'user'
  END,
  COALESCE(
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(u.raw_user_meta_data->>'last_name', '')), ''),
    u.raw_user_meta_data->>'full_name',
    SPLIT_PART(u.email, '@', 1)
  ),
  u.phone
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
