import { NextRequest, NextResponse } from 'next/server';

// API route to collect Web Vitals metrics
export async function POST(request: NextRequest) {
  try {
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
