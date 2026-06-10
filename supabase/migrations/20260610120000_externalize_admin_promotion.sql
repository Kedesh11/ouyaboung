-- Externalize admin promotion from hardcoded emails to platform_settings
BEGIN;

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'admin_emails',
  '["pendysevan11@gmail.com", "sevankedesh11@gmail.com"]'::jsonb,
  'Emails auto-promoted to admin role on signup'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.is_admin_email(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT LOWER(TRIM(p_email)) = ANY (
        SELECT jsonb_array_elements_text(value)
        FROM public.platform_settings
        WHERE key = 'admin_emails'
      )
    ),
    false
  );
$$;

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
  IF public.is_admin_email(new.email) THEN
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

COMMIT;
