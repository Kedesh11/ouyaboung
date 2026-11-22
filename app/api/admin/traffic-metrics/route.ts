import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminAuth, getSupabaseAdmin } from '@/lib/admin/auth';

export const runtime = 'nodejs';

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
