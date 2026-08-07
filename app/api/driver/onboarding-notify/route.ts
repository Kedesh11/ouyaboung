import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchNewDriverNotifications } from '@/services/driver-onboarding.server';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

type NotifyPayload = {
  driverId?: string;
};

const parsePayload = async (request: NextRequest): Promise<NotifyPayload> => {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== 'object') {
    return {};
  }

  const driverId =
    typeof (body as Record<string, unknown>).driverId === 'string'
      ? (body as Record<string, string>).driverId
      : undefined;

  return { driverId };
};

const createSupabaseServerClient = async () => {
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabasePublicEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing');
  }

  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
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
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { success: false, error: profileError.message },
        { status: 500 }
      );
    }

    const role = profile?.role || user.user_metadata?.role || 'user';
    if (role !== 'driver') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const payload = await parsePayload(request);

    let driverQuery = supabase
      .from('drivers')
      .select('id, full_name, vehicle_type, email, phone, city, created_at, is_verified, is_refused, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (payload.driverId) {
      driverQuery = supabase
        .from('drivers')
        .select('id, full_name, vehicle_type, email, phone, city, created_at, is_verified, is_refused, user_id')
        .eq('id', payload.driverId)
        .eq('user_id', user.id)
        .limit(1);
    }

    const { data: driverRows, error: driverError } = await driverQuery;

    if (driverError || !driverRows || driverRows.length === 0) {
      return NextResponse.json(
        { success: false, error: driverError?.message || 'Driver not found' },
        { status: 404 }
      );
    }

    const driver = driverRows[0];

    if (driver.is_verified || driver.is_refused) {
      return NextResponse.json(
        {
          success: false,
          error: 'Driver is not pending validation',
        },
        { status: 409 }
      );
    }

    const result = await dispatchNewDriverNotifications(supabase, {
      id: driver.id,
      full_name: driver.full_name,
      vehicle_type: driver.vehicle_type,
      email: driver.email,
      phone: driver.phone,
      city: driver.city,
      created_at: driver.created_at,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Notification dispatch failed',
          details: {
            internalNotificationsSent: result.internalNotificationsSent,
            emailsSent: result.emailsSent,
            emailFailures: result.emailFailures,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        internalNotificationsSent: result.internalNotificationsSent,
        emailsSent: result.emailsSent,
        emailFailures: result.emailFailures,
      },
    });
  } catch (error: any) {
    console.error('[OnboardingNotify] Unexpected error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unexpected server error' },
      { status: 500 }
    );
  }
}
