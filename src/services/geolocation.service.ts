const GEOLOCATION_STORAGE_KEY = 'ouyaboung_user_location_v2';
const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h
const DEFAULT_BROWSER_TIMEOUT_MS = 15000;
const DEFAULT_BROWSER_MAX_AGE_MS = 300000;
const LOW_ACCURACY_RETRY_TIMEOUT_MS = 7000;

export const GABON_DEFAULT_LOCATION = {
  latitude: 0.4162,
  longitude: 9.4673,
  city: 'Libreville',
  country: 'GA',
} as const;

export const GABON_LOCATION_BOUNDS = {
  minLatitude: -4.2,
  maxLatitude: 2.6,
  minLongitude: 8.4,
  maxLongitude: 14.8,
} as const;

export type GeolocationSource = 'browser' | 'ip_lookup' | 'default_city' | 'cache';

export interface UserGeolocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source: GeolocationSource;
  isApproximate: boolean;
  city?: string | null;
  country?: string | null;
  region?: string | null;
}

interface StoredGeolocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source: Exclude<GeolocationSource, 'cache'>;
  isApproximate: boolean;
  city?: string | null;
  country?: string | null;
  region?: string | null;
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
  requestBrowserPermission?: boolean;
  retryLowAccuracy?: boolean;
}

const hasStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const isValidCoordinate = (lat?: number | null, lng?: number | null): boolean =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

export const isWithinGabonBounds = (lat?: number | null, lng?: number | null): boolean => {
  if (!isValidCoordinate(lat, lng)) return false;
  const latitude = lat as number;
  const longitude = lng as number;
  return (
    latitude >= GABON_LOCATION_BOUNDS.minLatitude &&
    latitude <= GABON_LOCATION_BOUNDS.maxLatitude &&
    longitude >= GABON_LOCATION_BOUNDS.minLongitude &&
    longitude <= GABON_LOCATION_BOUNDS.maxLongitude
  );
};

export const formatLocationAccuracy = (
  location?: Pick<UserGeolocation, 'accuracy' | 'isApproximate' | 'source'> | null
): string => {
  if (!location) return 'Position non définie';
  if (location.source === 'default_city') return 'Ville par défaut';
  if (location.isApproximate) return 'Position approximative';
  if (typeof location.accuracy === 'number' && Number.isFinite(location.accuracy)) {
    if (location.accuracy < 1000) return `GPS ±${Math.round(location.accuracy)} m`;
    return `GPS ±${(location.accuracy / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
  }
  return 'GPS actif';
};

const saveLocation = (location: Omit<StoredGeolocation, 'cachedAt'>): void => {
  if (!hasStorage()) return;
  try {
    const payload: StoredGeolocation = { ...location, cachedAt: Date.now() };
    localStorage.setItem(GEOLOCATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write errors.
  }
};

export const clearCachedUserLocation = (): void => {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
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
    if (!parsed || !isValidCoordinate(parsed.latitude, parsed.longitude)) {
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
      city: parsed.city ?? null,
      country: parsed.country ?? null,
      region: parsed.region ?? null,
    };
  } catch {
    localStorage.removeItem(GEOLOCATION_STORAGE_KEY);
    return null;
  }
};

const getBrowserPermissionState = async (): Promise<PermissionState | 'unsupported' | 'unknown'> => {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported';
  }

  try {
    const permission = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });
    return permission.state;
  } catch {
    return 'unknown';
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

  const permissionState = await getBrowserPermissionState();
  if (permissionState === 'denied') {
    return {
      success: false,
      data: null,
      error: {
        code: 'GEO_PERMISSION_DENIED',
        message: 'Permission de geolocalisation refusee dans le navigateur.',
      },
    };
  }

  if (
    options.requestBrowserPermission === false &&
    (permissionState === 'prompt' || permissionState === 'unsupported' || permissionState === 'unknown')
  ) {
    return {
      success: false,
      data: null,
      error: {
        code: 'GEO_PERMISSION_PROMPT_SKIPPED',
        message: 'Demande de permission GPS ignoree pour ce chargement passif.',
      },
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isValidCoordinate(position.coords.latitude, position.coords.longitude)) {
          resolve({
            success: false,
            data: null,
            error: {
              code: 'GEO_INVALID_COORDS',
              message: 'Le navigateur a retourne des coordonnees invalides.',
            },
          });
          return;
        }

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
        timeout: options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS,
        maximumAge: options.maximumAgeMs ?? DEFAULT_BROWSER_MAX_AGE_MS,
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

    if (!isValidCoordinate(lat, lng)) {
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
      city: body?.data?.city ?? null,
      country: body?.data?.country ?? null,
      region: body?.data?.region ?? null,
    });

    return {
      success: true,
      data: {
        latitude: lat,
        longitude: lng,
        accuracy: null,
        source,
        isApproximate: true,
        city: body?.data?.city ?? null,
        country: body?.data?.country ?? null,
        region: body?.data?.region ?? null,
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

  const shouldRetryLowAccuracy =
    options.retryLowAccuracy !== false &&
    options.enableHighAccuracy !== false &&
    options.requestBrowserPermission !== false &&
    (browserAttempt.error?.code === 'GEO_TIMEOUT' ||
      browserAttempt.error?.code === 'GEO_POSITION_UNAVAILABLE');

  if (shouldRetryLowAccuracy) {
    const retryAttempt = await getBrowserLocation({
      ...options,
      enableHighAccuracy: false,
      timeoutMs: Math.min(options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS, LOW_ACCURACY_RETRY_TIMEOUT_MS),
      maximumAgeMs: Math.max(options.maximumAgeMs ?? DEFAULT_BROWSER_MAX_AGE_MS, DEFAULT_BROWSER_MAX_AGE_MS),
      retryLowAccuracy: false,
    });
    if (retryAttempt.success) return retryAttempt;
  }

  if (options.fallbackToIp === false) {
    return browserAttempt;
  }

  const fallbackAttempt = await getIpFallbackLocation();
  if (fallbackAttempt.success) return fallbackAttempt;

  return browserAttempt;
};
