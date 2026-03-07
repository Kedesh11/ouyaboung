import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { EventType } from '@/lib/tracking/types';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

export const runtime = 'nodejs';

// ============================================================
// Validation Schema
// ============================================================

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const eventTypeValues = Object.values(EventType) as [string, ...string[]];

const eventSchema = z.object({
  event_type: z.enum(eventTypeValues),
  route: z.string().min(1).max(1024),
  session_id: z.string().min(6).max(128),
  user_id: z.string().uuid().nullable(),
  device_type: z.enum(['mobile', 'tablet', 'desktop', 'unknown']),
  user_agent: z.string().max(1024),
  referrer: z.string().max(2048),
  metadata: z.record(z.string(), jsonValueSchema).default({}),
  client_ts: z.number().int().positive(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
  sent_at: z.number().int().positive().optional(),
});

// ============================================================
// Sliding Window Rate Limiting (per IP)
// ============================================================

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 90;
const rateWindow = new Map<string, number[]>();

const getRequestIp = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  return req.headers.get('x-real-ip') || 'unknown';
};

const applyRateLimit = (ip: string) => {
  const now = Date.now();
  const history = rateWindow.get(ip) ?? [];
  const active = history.filter((ts) => now - ts < RATE_WINDOW_MS);

  if (active.length >= RATE_LIMIT_REQUESTS) {
    const oldest = active[0] ?? now;
    const retryAfterMs = RATE_WINDOW_MS - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      resetAt: oldest + RATE_WINDOW_MS,
    };
  }

  active.push(now);
  rateWindow.set(ip, active);

  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_REQUESTS - active.length),
    retryAfterSec: 0,
    resetAt: now + RATE_WINDOW_MS,
  };
};

const errorResponse = (
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: HeadersInit
) =>
  NextResponse.json(
    {
      success: false,
      request_id: requestId,
      error: {
        code,
        message,
        details: details ?? null,
      },
    },
    {
      status,
      headers,
    }
  );

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = getRequestIp(req);
  const limit = applyRateLimit(ip);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!limit.allowed) {
    return errorResponse(
      requestId,
      429,
      'RATE_LIMITED',
      'Too many requests. Please retry later.',
      {
        window_ms: RATE_WINDOW_MS,
        max_requests: RATE_LIMIT_REQUESTS,
      },
      {
        'Retry-After': String(limit.retryAfterSec),
        'X-RateLimit-Limit': String(RATE_LIMIT_REQUESTS),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(limit.resetAt),
      }
    );
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return errorResponse(requestId, 415, 'INVALID_CONTENT_TYPE', 'Content-Type must be application/json');
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(requestId, 400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const parsed = batchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(
      requestId,
      400,
      'INVALID_PAYLOAD',
      'Payload does not match expected schema.',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
  }

  const { url: supabaseUrl } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !serviceRoleKey) {
    if (!isProduction) {
      return NextResponse.json(
        {
          success: true,
          request_id: requestId,
          accepted: parsed.data.events.length,
          inserted: 0,
          dropped: parsed.data.events.length,
          warning: {
            code: 'INGEST_DISABLED_DEV',
            message: 'Tracking ingest disabled in development: missing Supabase server configuration.',
          },
        },
        {
          status: 202,
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_REQUESTS),
            'X-RateLimit-Remaining': String(limit.remaining),
            'X-RateLimit-Reset': String(limit.resetAt),
          },
        }
      );
    }

    return errorResponse(requestId, 500, 'SUPABASE_CONFIG_MISSING', 'Supabase configuration is missing');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const records = parsed.data.events.map((event) => ({
    event_type: event.event_type,
    route: event.route,
    session_id: event.session_id,
    user_id: event.user_id,
    device_type: event.device_type,
    user_agent: event.user_agent,
    referrer: event.referrer,
    metadata: event.metadata,
  }));

  const { error } = await supabaseAdmin
    .from('user_events')
    .insert(records);

  if (error) {
    return errorResponse(requestId, 500, 'DB_INSERT_FAILED', 'Failed to insert tracking events', {
      message: error.message,
      code: error.code,
    });
  }

  return NextResponse.json(
    {
      success: true,
      request_id: requestId,
      accepted: parsed.data.events.length,
      inserted: parsed.data.events.length,
      dropped: 0,
    },
    {
      status: 201,
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT_REQUESTS),
        'X-RateLimit-Remaining': String(limit.remaining),
        'X-RateLimit-Reset': String(limit.resetAt),
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: 'POST, OPTIONS',
    },
  });
}
