const GEOLOCATION_STORAGE_KEY = 'ouyaboung_user_location_v2';
const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

export type GeolocationSource = 'browser' | 'ip_lookup' | 'default_city' | 'cache';

export interface UserGeolocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source: GeolocationSource;
  isApproximate: boolean;
}

interface StoredGeolocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source: Exclude<GeolocationSource, 'cache'>;
  isApproximate: boolean;
  cachedAt: number;
}

interface GeolocationErrorPayload {
  code: string;
  message: string;
}

export interface ResolveLocationResult {
  success: boolean;
  data: UserGeolocation | null;
  error: GeolocationErrorPayload | null;
}

export interface ResolveLocationOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
  enableHighAccuracy?: boolean;
  fallbackToIp?: boolean;
  cacheMaxAgeMs?: number;
}

const hasStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isValidCoord = (lat?: number | null, lng?: number | null): lat is number =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

const saveLocation = (location: Omit<StoredGeolocation, 'cachedAt'>): void => {
  if (!hasStorage()) return;
  try {
    const payload: StoredGeolocation = { ...location, cachedAt: Date.now() };
    localStorage.setItem(GEOLOCATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write errors.
  }
};

export const getCachedUserLocation = (
  maxAgeMs: number = DEFAULT_CACHE_MAX_AGE_MS
): UserGeolocation | null => {
  if (!hasStorage()) return null;

  try {
    const raw = localStorage.getItem(GEOLOCATION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredGeolocation;
    if (!parsed || !isValidCoord(parsed.latitude, parsed.longitude)) {
      localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
      return null;
    }

    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > maxAgeMs) {
      localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
      return null;
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      accuracy: parsed.accuracy ?? null,
      source: 'cache',
      isApproximate: parsed.isApproximate,
    };
  } catch {
    localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
    return null;
  }
};

const getBrowserLocation = async (
  options: ResolveLocationOptions
): Promise<ResolveLocationResult> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      success: false,
      data: null,
      error: {
        code: 'GEO_UNSUPPORTED',
        message: "La geolocalisation n'est pas supportee par ce navigateur.",
      },
    };
  }

  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({
        name: 'geolocation' as PermissionName,
      });
      if (permission.state === 'denied') {
        return {
          success: false,
          data: null,
          error: {
            code: 'GEO_PERMISSION_DENIED',
            message: 'Permission de geolocalisation refusee dans le navigateur.',
          },
        };
      }
    } catch {
      // Ignore permission API failures and continue with direct geolocation call.
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: UserGeolocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'browser',
          isApproximate: false,
        };
        saveLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          source: 'browser',
          isApproximate: false,
        });
        resolve({ success: true, data: location, error: null });
      },
      (error) => {
        let message = "Impossible d'obtenir votre position.";
        let code = 'GEO_FAILED';

        if (error.code === 1) {
          code = 'GEO_PERMISSION_DENIED';
          message = 'Acces a la position refuse.';
        } else if (error.code === 2) {
          code = 'GEO_POSITION_UNAVAILABLE';
          message = 'Position indisponible.';
        } else if (error.code === 3) {
          code = 'GEO_TIMEOUT';
          message = "Le delai d'obtention de la position est depasse.";
        }

        resolve({
          success: false,
          data: null,
          error: { code, message },
        });
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        timeout: options.timeoutMs ?? 15000,
        maximumAge: options.maximumAgeMs ?? 300000,
      }
    );
  });
};

const getIpFallbackLocation = async (): Promise<ResolveLocationResult> => {
  try {
    const response = await fetch('/api/geolocation/fallback', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: {
          code: 'GEO_FALLBACK_FAILED',
          message: 'Le fallback de geolocalisation a echoue.',
        },
      };
    }

    const body = await response.json();
    const lat = body?.data?.latitude;
    const lng = body?.data?.longitude;

    if (!isValidCoord(lat, lng)) {
      return {
        success: false,
        data: null,
        error: {
          code: 'GEO_FALLBACK_INVALID',
          message: 'Le fallback a retourne des coordonnees invalides.',
        },
      };
    }

    const source = body?.data?.source === 'ip_lookup' ? 'ip_lookup' : 'default_city';

    saveLocation({
      latitude: lat,
      longitude: lng,
      accuracy: null,
      source,
      isApproximate: true,
    });

    return {
      success: true,
      data: {
        latitude: lat,
        longitude: lng,
        accuracy: null,
        source,
        isApproximate: true,
      },
      error: null,
    };
  } catch {
    return {
      success: false,
      data: null,
      error: {
        code: 'GEO_FALLBACK_NETWORK',
        message: 'Le fallback IP est indisponible.',
      },
    };
  }
};

export const resolveUserLocation = async (
  options: ResolveLocationOptions = {}
): Promise<ResolveLocationResult> => {
  const cacheMaxAgeMs = options.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;

  if (!options.forceRefresh) {
    const cached = getCachedUserLocation(cacheMaxAgeMs);
    if (cached) {
      return { success: true, data: cached, error: null };
    }
  }

  const browserAttempt = await getBrowserLocation(options);
  if (browserAttempt.success) return browserAttempt;

  if (options.fallbackToIp === false) {
    return browserAttempt;
  }

  const fallbackAttempt = await getIpFallbackLocation();
  if (fallbackAttempt.success) return fallbackAttempt;

  return browserAttempt;
};

