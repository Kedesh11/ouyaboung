import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchNewMerchantNotifications } from '@/services/merchant-onboarding.server';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

type NotifyPayload = {
  merchantId?: string;
};

const parsePayload = async (request: NextRequest): Promise<NotifyPayload> => {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== 'object') {
    return {};
  }

  const merchantId =
    typeof (body as Record<string, unknown>).merchantId === 'string'
      ? (body as Record<string, string>).merchantId
      : undefined;

  return { merchantId };
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
    if (role !== 'merchant') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const payload = await parsePayload(request);

    let merchantQuery = supabase
      .from('merchants')
      .select('id, business_name, business_type, email, phone, city, created_at, is_verified, is_refused, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (payload.merchantId) {
      merchantQuery = supabase
        .from('merchants')
        .select('id, business_name, business_type, email, phone, city, created_at, is_verified, is_refused, user_id')
        .eq('id', payload.merchantId)
        .eq('user_id', user.id)
        .limit(1);
    }

    const { data: merchantRows, error: merchantError } = await merchantQuery;

    if (merchantError || !merchantRows || merchantRows.length === 0) {
      return NextResponse.json(
        { success: false, error: merchantError?.message || 'Merchant not found' },
        { status: 404 }
      );
    }

    const merchant = merchantRows[0];

    if (merchant.is_verified || merchant.is_refused) {
      return NextResponse.json(
        {
          success: false,
          error: 'Merchant is not pending validation',
        },
        { status: 409 }
      );
    }

    const result = await dispatchNewMerchantNotifications(supabase, {
      id: merchant.id,
      business_name: merchant.business_name,
      business_type: merchant.business_type,
      email: merchant.email,
      phone: merchant.phone,
      city: merchant.city,
      created_at: merchant.created_at,
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
