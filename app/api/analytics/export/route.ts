import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

interface AuthContext {
  authorized: boolean;
  isAdmin: boolean;
  userId: string | null;
  reason?: string;
}

const getSupabaseAdmin = () => {
  const { url } = getSupabasePublicEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
};

const resolveAuthContext = async (req: NextRequest): Promise<AuthContext> => {
  const exportApiKey = process.env.ANALYTICS_EXPORT_KEY?.trim();
  const providedKey = req.headers.get('x-analytics-export-key')?.trim();

  if (exportApiKey && providedKey && providedKey === exportApiKey) {
    return { authorized: true, isAdmin: true, userId: null };
  }

  const { url: supabaseUrl, anonKey } = getSupabasePublicEnv();
  const admin = getSupabaseAdmin();
  if (!supabaseUrl || !anonKey || !admin) {
    return { authorized: false, isAdmin: false, userId: null, reason: 'Supabase config missing' };
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser();

    if (error || !user) {
      return { authorized: false, isAdmin: false, userId: null, reason: 'Unauthenticated' };
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      authorized: true,
      isAdmin: (profile?.role || user.user_metadata?.role) === 'admin',
      userId: user.id,
    };
  }

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

  const {
    data: { user },
    error,
  } = await cookieClient.auth.getUser();

  if (error || !user) {
    return { authorized: false, isAdmin: false, userId: null, reason: 'Unauthenticated' };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    authorized: true,
    isAdmin: (profile?.role || user.user_metadata?.role) === 'admin',
    userId: user.id,
  };
};

const toCsv = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const raw = value === null || value === undefined ? '' : String(value);
    const escaped = raw.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  });

  return lines.join('\n');
};

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const auth = await resolveAuthContext(req);

  if (!auth.authorized) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'UNAUTHENTICATED', message: auth.reason || 'Authentication required' },
      },
      { status: 401 }
    );
  }

  if (!auth.isAdmin) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'SUPABASE_CONFIG_MISSING', message: 'Supabase configuration missing' },
      },
      { status: 500 }
    );
  }

  const params = req.nextUrl.searchParams;
  const format = (params.get('format') || 'json').toLowerCase();
  const limitParam = Number(params.get('limit') || 1000);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 5000) : 1000;

  let query = admin
    .from('user_segments')
    .select('*')
    .limit(limit);

  const from = params.get('from');
  const to = params.get('to');

  if (from) {
    query = query.gte('last_active_at', from);
  }
  if (to) {
    query = query.lte('last_active_at', to);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'DB_QUERY_FAILED', message: error.message },
      },
      { status: 500 }
    );
  }

  const rows = (data || []) as Record<string, unknown>[];

  if (format === 'csv') {
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="analytics_export_${new Date().toISOString().slice(0, 10)}.csv"`,
        'X-Request-Id': requestId,
      },
    });
  }

  return NextResponse.json(
    {
      success: true,
      request_id: requestId,
      exported: rows.length,
      generated_at: new Date().toISOString(),
      rows,
    },
    { status: 200 }
  );
}
