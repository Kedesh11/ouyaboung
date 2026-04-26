import { NextRequest, NextResponse } from 'next/server';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_GABON_LOCATION = {
  latitude: 0.4162,
  longitude: 9.4673,
  city: 'Libreville',
  country: 'GA',
};

const toPublicIp = (rawIp: string): string => rawIp.replace(/^::ffff:/, '').trim();

type GeoIpLookupResult = {
  ll?: [number, number] | number[];
  city?: string | null;
  country?: string | null;
  region?: string | null;
};

type GeoIpLike = {
  lookup: (ip: string) => GeoIpLookupResult | null;
};

let geoIpLoader: Promise<GeoIpLike | null> | null = null;
let geoIpLoadFailedLogged = false;

const geoIpDataAvailable = async (): Promise<boolean> => {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve('geoip-lite/package.json');
    const dataPath = join(dirname(packagePath), 'data', 'geoip-country.dat');
    await access(dataPath);
    return true;
  } catch {
    return false;
  }
};

const loadGeoIp = async (): Promise<GeoIpLike | null> => {
  if (!geoIpLoader) {
    geoIpLoader = (async () => {
      try {
        const hasData = await geoIpDataAvailable();
        if (!hasData) {
          if (!geoIpLoadFailedLogged) {
            geoIpLoadFailedLogged = true;
            console.warn('[Geolocation Fallback] geoip-lite database missing, using default city fallback.');
          }
          return null;
        }

        const geoipModule = await import('geoip-lite');
        return (geoipModule.default || geoipModule) as GeoIpLike;
      } catch (error) {
        if (!geoIpLoadFailedLogged) {
          geoIpLoadFailedLogged = true;
          console.warn('[Geolocation Fallback] geoip-lite unavailable, using default city fallback.');
          if (process.env.NODE_ENV !== 'production') {
            console.warn(error);
          }
        }
        return null;
      }
    })();
  }
  return geoIpLoader;
};

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
  const geoip = await loadGeoIp();
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

  const lookup = geoip?.lookup(ip);
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
