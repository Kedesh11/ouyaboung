import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { EventType, type DeviceType } from '@/lib/tracking/types';

// Remove top-level supabase client to fix build errors.
// It will be instantiated inside the POST handler lazily.

// ============================================================
// Types & Schemas
// ============================================================

const eventSchema = z.object({
  event_type: z.nativeEnum(EventType).or(z.string()), // Allow custom strings for future extensions
  route: z.string().max(1024),
  session_id: z.string().max(128),
  user_id: z.string().uuid().nullable(),
  device_type: z.enum(['mobile', 'tablet', 'desktop', 'unknown']).catch('unknown' as DeviceType),
  user_agent: z.string().max(1024).catch('unknown'),
  referrer: z.string().max(2048).catch(''),
  metadata: z.record(z.any()).catch({}),
  client_ts: z.number().optional(), // For logical ordering if needed later
});

const batchSchema = z.object({
  events: z.array(eventSchema).max(100), // Hard limit of 100 events per batch
});

// ============================================================
// Simple In-Memory Rate Limiter (for single-instance / serverless)
// For scalable setups, migrate to Upstash Redis.
// ============================================================

interface RateLimitTracker {
  count: number;
  resetAt: number;
}
const rateLimiter = new Map<string, RateLimitTracker>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60;     // 60 req/min/IP = 1 per second average

function enforceRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimiter.get(ip);

  if (!record || now > record.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_REQUESTS) {
    return false;
  }

  record.count += 1;
  return true;
}

// Clean up stale IP records periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  Array.from(rateLimiter.entries()).forEach(([ip, record]) => {
    if (now > record.resetAt) rateLimiter.delete(ip);
  });
}, WINDOW_MS * 5);

// ============================================================
// Handler
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown_ip';

    if (!enforceRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const rawBody = await req.json();
    const result = batchSchema.safeParse(rawBody);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: result.error.issues },
        { status: 400 }
      );
    }

    const { events } = result.data;
    if (events.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Insert into user_events using the service_role key
    // RLS explicitly blocks anon/authenticated access to this table.
    const { error: dbError } = await supabaseAdmin
      .from('user_events')
      .insert(events.map(e => ({
        event_type: e.event_type,
        route: e.route,
        session_id: e.session_id,
        user_id: e.user_id,
        device_type: e.device_type,
        user_agent: e.user_agent,
        referrer: e.referrer,
        metadata: e.metadata,
        // created_at is automatically handled by the database default value.
      })));

    if (dbError) {
      console.error('[Analytics API] DB Insert Error:', dbError);
      return NextResponse.json({ error: 'Database Error' }, { status: 500 });
    }

    return NextResponse.json({ inserted: events.length }, { status: 201 });

  } catch (error) {
    console.error('[Analytics API] Unexpected Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
