import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

