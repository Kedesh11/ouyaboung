-- Fix prevent_profile_privilege_escalation to allow service_role access
-- This allows our admin API (using service role) to update user roles.

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Allow service_role to perform any update
  -- This is essential for backend administrative tasks.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 2. Allow admins to perform controlled role/email updates.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- 3. Non-admin users can only update their own non-privileged fields.
  IF auth.uid() = OLD.user_id THEN
    -- Prevent self-promotion or role changing
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Role update is not allowed';
    END IF;

    -- Prevent user_id hijacking
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'user_id update is not allowed';
    END IF;

    -- Prevent email changes (should be done via auth.updateUser)
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Email update is not allowed on profiles table';
    END IF;

    RETURN NEW;
  END IF;

  -- 4. Reject everything else
  RAISE EXCEPTION 'Unauthorized profile update';
END;
$$;
