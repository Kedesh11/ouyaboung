import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { sendDriverApprovalEmail, sendDriverRejectionEmail } from '@/services/email.server';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

type DriverEmailPayload = {
  type: 'approval' | 'rejection';
  email: string;
  driverName: string;
  reason?: string;
};

const isValidPayload = (payload: unknown): payload is DriverEmailPayload => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<DriverEmailPayload>;
  return (
    (candidate.type === 'approval' || candidate.type === 'rejection') &&
    typeof candidate.email === 'string' &&
    candidate.email.length > 3 &&
    typeof candidate.driverName === 'string' &&
    candidate.driverName.length > 0
  );
};

const assertAdmin = async (): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabasePublicEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, error: 'Supabase config missing' };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: 'Unauthenticated' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, error: profileError.message };
  }

  const role = profile?.role || user.user_metadata?.role || 'user';
  if (role !== 'admin') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true };
};

export async function POST(request: NextRequest) {
  const auth = await assertAdmin();
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  if (!isValidPayload(payload)) {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
  }

  const result =
    payload.type === 'approval'
      ? await sendDriverApprovalEmail(payload.email, payload.driverName)
      : await sendDriverRejectionEmail(payload.email, payload.driverName, payload.reason);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || 'Email send failed' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
