-- ==========================================
-- RE-RUN BACKFILL MISSING PROFILES
-- ==========================================

-- Insert missing profiles for existing auth users who don't have a profile row
-- This targets users created manually or before triggers were active
INSERT INTO public.profiles (
    user_id, 
    email, 
    role, 
    full_name, 
    first_name, 
    last_name, 
    birth_date
)
SELECT 
    au.id,
    au.email,
    -- Default role fallback
    COALESCE(au.raw_user_meta_data->>'role', 'user'),
    -- Full name logic
    COALESCE(
        au.raw_user_meta_data->>'full_name', 
        TRIM(COALESCE(au.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(au.raw_user_meta_data->>'last_name', '')),
        SPLIT_PART(au.email, '@', 1) -- Fallback to email username if nothing else
    ),
    au.raw_user_meta_data->>'first_name',
    au.raw_user_meta_data->>'last_name',
    -- Birth date logic
    CASE 
        WHEN au.raw_user_meta_data->>'birth_date' IS NOT NULL AND au.raw_user_meta_data->>'birth_date' != ''
        THEN (au.raw_user_meta_data->>'birth_date')::date 
        ELSE NULL 
    END
FROM auth.users au
LEFT JOIN public.profiles p ON p.user_id = au.id
WHERE p.id IS NULL;
