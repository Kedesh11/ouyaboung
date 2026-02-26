-- ==========================================
-- REMOVE BIRTH DATE FROM PROFILES
-- Date: 2026-02-26
-- Purpose:
--   1. Remove birth_date from profiles table
--   2. Update handle_new_user trigger function accordingly
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
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_error_message text;
BEGIN
  -- Determine role
  IF new.email = 'pendysevan11@gmail.com' THEN
    v_role := 'admin';
  ELSE
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'user');
  END IF;

  -- Extract names
  v_first_name := new.raw_user_meta_data->>'first_name';
  v_last_name := new.raw_user_meta_data->>'last_name';

  -- Construct full_name
  IF v_first_name IS NOT NULL AND v_last_name IS NOT NULL THEN
    v_full_name := TRIM(v_first_name || ' ' || v_last_name);
  ELSIF new.raw_user_meta_data->>'full_name' IS NOT NULL THEN
    v_full_name := new.raw_user_meta_data->>'full_name';
  ELSE
    v_full_name := SPLIT_PART(new.email, '@', 1);
  END IF;

  -- Insert or update profile
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
      role = EXCLUDED.role,
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

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS birth_date;

COMMIT;
