import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export interface AdminAuthResult {
  ok: boolean;
  status: number;
  userId?: string;
  reason?: string;
}

export const getSupabaseAdmin = (): SupabaseClient | null => {
  const { url } = getSupabasePublicEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
};

export const resolveAdminAuth = async (req: NextRequest): Promise<AdminAuthResult> => {
  const { url: supabaseUrl, anonKey } = getSupabasePublicEnv();
  const adminClient = getSupabaseAdmin();
  if (!supabaseUrl || !anonKey || !adminClient) {
    return { ok: false, status: 500, reason: 'Supabase configuration missing' };
  }

  const authHeader = req.headers.get('authorization');

  let user;

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    const authClient = createClient(supabaseUrl, anonKey);
    const { data, error: userError } = await authClient.auth.getUser(token);
    if (userError || !data.user) {
      return { ok: false, status: 401, reason: 'Unauthenticated' };
    }
    user = data.user;
  } else {
    const cookieStore = await cookies();
    const cookieClient = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });
    const { data, error: userError } = await cookieClient.auth.getUser();
    if (userError || !data.user) {
      return { ok: false, status: 401, reason: 'Unauthenticated' };
    }
    user = data.user;
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = profile?.role || user.user_metadata?.role || 'user';
  if (role !== 'admin') {
    return { ok: false, status: 403, reason: 'Forbidden' };
  }

  return { ok: true, status: 200, userId: user.id };
};

export const authErrorResponseBody = (auth: AdminAuthResult, requestId: string) => ({
  success: false,
  request_id: requestId,
  error: {
    code: auth.status === 401 ? 'UNAUTHENTICATED' : auth.status === 403 ? 'FORBIDDEN' : 'CONFIG_ERROR',
    message: auth.reason || 'Unauthorized',
  },
});
