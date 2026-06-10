import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, getRequestIp } from '@/lib/rate-limit';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 120;

// API route to collect Web Vitals metrics
export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request.headers);
    const limit = await applyRateLimit(`analytics-vitals:${ip}`, {
      windowMs: RATE_WINDOW_MS,
      maxRequests: RATE_LIMIT_REQUESTS,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(limit.retryAfterSec),
            'X-RateLimit-Limit': String(RATE_LIMIT_REQUESTS),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(limit.resetAt),
          },
        }
      );
    }

    const metric = await request.json();
    
    // Validate metric structure
    if (!metric.name || typeof metric.value !== 'number') {
      return NextResponse.json(
        { error: 'Invalid metric data' },
        { status: 400 }
      );
    }

    // Log metric (in production, send to analytics service)
    console.log('[Analytics] Web Vital:', {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      url: metric.url,
      timestamp: new Date(metric.timestamp).toISOString(),
    });

    // TODO: Send to analytics service (Vercel Analytics, Google Analytics, etc.)
    // Example with Vercel Analytics:
    // await fetch('https://vitals.vercel-insights.com/v1/vitals', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     dsn: process.env.VERCEL_ANALYTICS_ID,
    //     ...metric,
    //   }),
    // });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Analytics] Error processing metric:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// CORS headers for cross-origin requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
