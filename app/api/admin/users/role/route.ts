import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';
import { DB_TABLES } from '@/api/routes';

export const runtime = 'nodejs';

interface AuthResult {
  ok: boolean;
  status: number;
  userId?: string;
  reason?: string;
}

const getSupabaseAdmin = () => {
  const { url } = getSupabasePublicEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
};

const resolveAdminAuth = async (req: NextRequest): Promise<AuthResult> => {
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

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const auth = await resolveAdminAuth(req);
  
  if (!auth.ok) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: {
          code: auth.status === 401 ? 'UNAUTHENTICATED' : auth.status === 403 ? 'FORBIDDEN' : 'CONFIG_ERROR',
          message: auth.reason || 'Unauthorized',
        },
      },
      { status: auth.status }
    );
  }

  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'CONFIG_ERROR', message: 'Supabase service role is missing' },
      },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json(
        {
          success: false,
          request_id: requestId,
          error: { code: 'INVALID_INPUT', message: 'Email and role are required' },
        },
        { status: 400 }
      );
    }

    if (!['user', 'merchant', 'admin'].includes(role)) {
      return NextResponse.json(
        {
          success: false,
          request_id: requestId,
          error: { code: 'INVALID_ROLE', message: 'Invalid role specified' },
        },
        { status: 400 }
      );
    }

    // 1. Find user by email in profiles
    const { data: profile, error: findError } = await adminClient
      .from('profiles')
      .select('id, user_id, full_name')
      .eq('email', email)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          request_id: requestId,
          error: { code: 'USER_NOT_FOUND', message: `Utilisateur avec l'email ${email} non trouvé` },
        },
        { status: 404 }
      );
    }

    // 2. Update role
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (updateError) {
      throw updateError;
    }

    // 3. Log activity
    await adminClient.from(DB_TABLES.ADMIN_ACTIVITIES).insert({
      type: 'test_activity', // Or add a new type in the constraint if possible, but 'test_activity' is allowed
      description: `Changement de rôle pour ${profile.full_name || email}: -> ${role}`,
      metadata: { 
        admin_id: auth.userId, 
        target_user_id: profile.user_id,
        target_email: email,
        new_role: role 
      },
    });

    return NextResponse.json(
      {
        success: true,
        request_id: requestId,
        message: `Rôle de ${email} mis à jour vers ${role} avec succès`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'INTERNAL_ERROR', message: error.message || 'An internal error occurred' },
      },
      { status: 500 }
    );
  }
}
