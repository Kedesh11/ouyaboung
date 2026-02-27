import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_GABON_LOCATION = {
  latitude: 0.4162,
  longitude: 9.4673,
  city: 'Libreville',
  country: 'GA',
};

const toPublicIp = (rawIp: string): string => rawIp.replace(/^::ffff:/, '').trim();

const getClientIp = (request: NextRequest): string | null => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0];
    if (first) return toPublicIp(first);
  }

  const realIp =
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-client-ip');

  if (realIp) return toPublicIp(realIp);

  const reqWithIp = request as NextRequest & { ip?: string };
  if (reqWithIp.ip) return toPublicIp(reqWithIp.ip);

  return null;
};

export async function GET(request: NextRequest) {
  const geoipModule = await import('geoip-lite');
  const geoip = geoipModule.default || geoipModule;
  const ip = getClientIp(request);

  if (!ip) {
    return NextResponse.json(
      {
        success: true,
        data: {
          ...DEFAULT_GABON_LOCATION,
          source: 'default_city',
          isApproximate: true,
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  const lookup = geoip.lookup(ip);
  if (!lookup?.ll || lookup.ll.length !== 2) {
    return NextResponse.json(
      {
        success: true,
        data: {
          ...DEFAULT_GABON_LOCATION,
          source: 'default_city',
          isApproximate: true,
          ip,
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  const [latitude, longitude] = lookup.ll;

  return NextResponse.json(
    {
      success: true,
      data: {
        latitude,
        longitude,
        city: lookup.city || DEFAULT_GABON_LOCATION.city,
        country: lookup.country || DEFAULT_GABON_LOCATION.country,
        region: lookup.region || null,
        source: 'ip_lookup',
        isApproximate: true,
        ip,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
