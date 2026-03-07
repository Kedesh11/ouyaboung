import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

interface AuthResult {
  ok: boolean;
  status: number;
  reason?: string;
}

interface DailyTrafficRow {
  period_date: string;
  visitors: number;
  authenticated_visitors: number;
  sessions: number;
  page_views: number;
  pwa_installs: number;
}

interface TrafficSummaryRow {
  total_pwa_installs: number;
  pwa_installs_30d: number;
  unique_visitors_30d: number;
  recurring_visitors_7d: number;
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

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return { ok: false, status: 401, reason: 'Unauthenticated' };
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

    return { ok: true, status: 200 };
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
    error: userError,
  } = await cookieClient.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, reason: 'Unauthenticated' };
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

  return { ok: true, status: 200 };
};

export async function GET(req: NextRequest) {
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

  const rawDays = Number(req.nextUrl.searchParams.get('days') || 14);
  const days = Number.isFinite(rawDays)
    ? Math.min(Math.max(Math.round(rawDays), 7), 90)
    : 14;

  const [dailyResult, summaryResult, profilesResult, adminsResult] = await Promise.all([
    adminClient.rpc('get_admin_traffic_daily', { p_window_days: days }),
    adminClient.rpc('get_admin_traffic_summary'),
    adminClient.from('profiles').select('id', { count: 'exact', head: true }),
    adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
  ]);

  if (dailyResult.error) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'DAILY_RPC_FAILED', message: dailyResult.error.message },
      },
      { status: 500 }
    );
  }

  if (summaryResult.error) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'SUMMARY_RPC_FAILED', message: summaryResult.error.message },
      },
      { status: 500 }
    );
  }

  const dailyRowsRaw = (dailyResult.data || []) as DailyTrafficRow[];
  const summaryRowRaw = ((summaryResult.data || [])[0] || null) as TrafficSummaryRow | null;

  const daily = dailyRowsRaw.map((row) => ({
    periodDate: row.period_date,
    visitors: Number(row.visitors || 0),
    authenticatedVisitors: Number(row.authenticated_visitors || 0),
    sessions: Number(row.sessions || 0),
    pageViews: Number(row.page_views || 0),
    pwaInstalls: Number(row.pwa_installs || 0),
  }));

  const today = daily[daily.length - 1] || null;
  const yesterday = daily[daily.length - 2] || null;

  const visitorsToday = today?.visitors || 0;
  const visitorsYesterday = yesterday?.visitors || 0;
  const visitorsGrowthPercent = visitorsYesterday > 0
    ? ((visitorsToday - visitorsYesterday) / visitorsYesterday) * 100
    : visitorsToday > 0
      ? 100
      : 0;

  const totalProfiles = profilesResult.count || 0;
  const totalAdmins = adminsResult.count || 0;
  const totalRegisteredUsers = Math.max(0, totalProfiles - totalAdmins);

  const dailyAverageVisitors = daily.length
    ? daily.reduce((sum, item) => sum + item.visitors, 0) / daily.length
    : 0;

  const dailyVisitRatePercent = totalRegisteredUsers > 0
    ? (visitorsToday / totalRegisteredUsers) * 100
    : 0;

  return NextResponse.json(
    {
      success: true,
      request_id: requestId,
      metrics: {
        windowDays: days,
        totalRegisteredUsers,
        visitorsToday,
        visitorsYesterday,
        visitorsGrowthPercent,
        dailyAverageVisitors,
        dailyVisitRatePercent,
        pageViewsToday: today?.pageViews || 0,
        sessionsToday: today?.sessions || 0,
        pwaInstallsTotal: Number(summaryRowRaw?.total_pwa_installs || 0),
        pwaInstallsLast30d: Number(summaryRowRaw?.pwa_installs_30d || 0),
        recurringVisitors7d: Number(summaryRowRaw?.recurring_visitors_7d || 0),
        daily,
      },
    },
    { status: 200 }
  );
}
