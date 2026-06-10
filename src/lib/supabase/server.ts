import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

/**
 * Client Supabase anonyme pour les lectures publiques côté serveur (ISR/SSR).
 */
export const createPublicSupabaseClient = (): SupabaseClient | null => {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * Client Supabase SSR avec cookies pour les routes serveur authentifiées.
 */
export const createServerSupabaseClient = async (): Promise<SupabaseClient | null> => {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignored in Server Components where cookies are read-only.
        }
      },
    },
  });
};
