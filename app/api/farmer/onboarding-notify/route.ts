import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchNewFarmerNotifications } from '@/services/farmer-onboarding.server';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

type NotifyPayload = {
  farmerId?: string;
};

const parsePayload = async (request: NextRequest): Promise<NotifyPayload> => {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== 'object') {
    return {};
  }

  const farmerId =
    typeof (body as Record<string, unknown>).farmerId === 'string'
      ? (body as Record<string, string>).farmerId
      : undefined;

  return { farmerId };
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
    if (role !== 'farmer') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const payload = await parsePayload(request);

    let farmerQuery = supabase
      .from('farmers')
      .select('id, farm_name, farmer_type, email, phone, city, created_at, is_verified, is_refused, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (payload.farmerId) {
      farmerQuery = supabase
        .from('farmers')
        .select('id, farm_name, farmer_type, email, phone, city, created_at, is_verified, is_refused, user_id')
        .eq('id', payload.farmerId)
        .eq('user_id', user.id)
        .limit(1);
    }

    const { data: farmerRows, error: farmerError } = await farmerQuery;

    if (farmerError || !farmerRows || farmerRows.length === 0) {
      return NextResponse.json(
        { success: false, error: farmerError?.message || 'Farmer not found' },
        { status: 404 }
      );
    }

    const farmer = farmerRows[0];

    if (farmer.is_verified || farmer.is_refused) {
      return NextResponse.json(
        {
          success: false,
          error: 'Farmer is not pending validation',
        },
        { status: 409 }
      );
    }

    const result = await dispatchNewFarmerNotifications(supabase, {
      id: farmer.id,
      farm_name: farmer.farm_name,
      farmer_type: farmer.farmer_type,
      email: farmer.email,
      phone: farmer.phone,
      city: farmer.city,
      created_at: farmer.created_at,
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
