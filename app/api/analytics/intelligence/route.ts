import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

interface AuthContext {
  authenticated: boolean;
  isAdmin: boolean;
  userId: string | null;
  viaServiceKey: boolean;
  reason?: string;
}

const scoreSchema = z.number().min(0).max(100);
const writeSchema = z
  .object({
    user_id: z.string().uuid(),
    intent_score: scoreSchema.optional(),
    engagement_score: scoreSchema.optional(),
    price_sensitivity_score: scoreSchema.optional(),
    churn_risk_score: scoreSchema.optional(),
    dynamic_segment: z.string().min(2).max(120).optional(),
    source: z.enum(['manual', 'ml', 'rule_engine', 'api']).default('api'),
  })
  .refine(
    (value) =>
      value.intent_score !== undefined ||
      value.engagement_score !== undefined ||
      value.price_sensitivity_score !== undefined ||
      value.churn_risk_score !== undefined ||
      value.dynamic_segment !== undefined,
    {
      message: 'At least one score or dynamic_segment must be provided.',
      path: ['intent_score'],
    }
  );

const getSupabaseAdmin = () => {
  const { url } = getSupabasePublicEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
};

const resolveAuthContext = async (req: NextRequest): Promise<AuthContext> => {
  const intelligenceApiKey = process.env.INTELLIGENCE_API_KEY?.trim();
  const providedKey = req.headers.get('x-intelligence-key')?.trim();

  if (intelligenceApiKey && providedKey && providedKey === intelligenceApiKey) {
    return { authenticated: true, isAdmin: true, userId: null, viaServiceKey: true };
  }

  const { url: supabaseUrl, anonKey } = getSupabasePublicEnv();
  const admin = getSupabaseAdmin();
  if (!supabaseUrl || !anonKey || !admin) {
    return {
      authenticated: false,
      isAdmin: false,
      userId: null,
      viaServiceKey: false,
      reason: 'Supabase config missing',
    };
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    const authClient = createClient(supabaseUrl, anonKey);

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);

    if (error || !user) {
      return {
        authenticated: false,
        isAdmin: false,
        userId: null,
        viaServiceKey: false,
        reason: 'Unauthenticated',
      };
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      authenticated: true,
      isAdmin: (profile?.role || user.user_metadata?.role || user.app_metadata?.role) === 'admin',
      userId: user.id,
      viaServiceKey: false,
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
    return {
      authenticated: false,
      isAdmin: false,
      userId: null,
      viaServiceKey: false,
      reason: 'Unauthenticated',
    };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    authenticated: true,
    isAdmin: (profile?.role || user.user_metadata?.role || user.app_metadata?.role) === 'admin',
    userId: user.id,
    viaServiceKey: false,
  };
};

const buildMergedIntelligence = (
  computed: Record<string, unknown> | null,
  manual: Record<string, unknown> | null
) => {
  const safeComputed = computed || {};
  const safeManual = manual || {};

  return {
    user_id: (manual?.user_id ?? computed?.user_id ?? null) as string | null,
    intent_score: Number(safeManual.intent_score ?? safeComputed.intent_score ?? 0),
    engagement_score: Number(safeManual.engagement_score ?? safeComputed.engagement_score ?? 0),
    price_sensitivity_score: Number(
      safeManual.price_sensitivity_score ?? safeComputed.price_sensitivity_score ?? 0
    ),
    churn_risk_score: Number(safeManual.churn_risk_score ?? safeComputed.churn_risk_score ?? 0),
    dynamic_segment: String(
      safeManual.dynamic_segment ?? safeComputed.dynamic_segment ?? 'Regular'
    ),
    source: String(safeManual.source ?? 'computed'),
    updated_at: String(safeManual.updated_at ?? safeComputed.updated_at ?? new Date().toISOString()),
  };
};

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const auth = await resolveAuthContext(req);

  if (!auth.authenticated) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'UNAUTHENTICATED', message: auth.reason || 'Authentication required' },
      },
      { status: 401 }
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

  const requestedUserId = req.nextUrl.searchParams.get('user_id');
  const targetUserId =
    requestedUserId && (auth.isAdmin || auth.viaServiceKey)
      ? requestedUserId
      : auth.userId;

  if (!targetUserId) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'TARGET_USER_MISSING', message: 'No target user could be resolved' },
      },
      { status: 400 }
    );
  }

  if (requestedUserId && requestedUserId !== auth.userId && !auth.isAdmin && !auth.viaServiceKey) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'FORBIDDEN', message: 'Cannot access intelligence for another user' },
      },
      { status: 403 }
    );
  }

  const [{ data: computed }, { data: manual }] = await Promise.all([
    admin.from('user_segments').select('*').eq('user_id', targetUserId).maybeSingle(),
    admin.from('user_intelligence_scores').select('*').eq('user_id', targetUserId).maybeSingle(),
  ]);

  if (!computed && !manual) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'NOT_FOUND', message: 'No intelligence profile found for user' },
      },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      request_id: requestId,
      intelligence: buildMergedIntelligence(
        (computed || null) as Record<string, unknown> | null,
        (manual || null) as Record<string, unknown> | null
      ),
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const auth = await resolveAuthContext(req);

  if (!auth.authenticated) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'UNAUTHENTICATED', message: auth.reason || 'Authentication required' },
      },
      { status: 401 }
    );
  }

  if (!auth.isAdmin && !auth.viaServiceKey) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'FORBIDDEN', message: 'Admin or service key access required' },
      },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      },
      { status: 400 }
    );
  }

  const parsed = writeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Payload validation failed',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      { status: 400 }
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

  const now = new Date().toISOString();
  const payload = {
    ...parsed.data,
    updated_at: now,
    updated_by: auth.userId,
  };

  const { data, error } = await admin
    .from('user_intelligence_scores')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        request_id: requestId,
        error: { code: 'DB_UPSERT_FAILED', message: error.message },
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      request_id: requestId,
      updated: data,
    },
    { status: 200 }
  );
}
