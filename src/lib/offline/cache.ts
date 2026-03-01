import {
  deleteIndexedDbValue,
  getIndexedDbValue,
  setIndexedDbValue,
} from "./indexeddb";

const CACHE_PREFIX = 'ouyaboung:offline:cache:v1:';
export const DEFAULT_OFFLINE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface OfflineCacheEntry<T> {
  cachedAt: number;
  data: T;
}

const hasBrowserStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const isBrowserOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

export const isBrowserOnline = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

export const getOfflineCache = <T>(
  key: string,
  maxAgeMs: number = DEFAULT_OFFLINE_CACHE_TTL_MS
): T | null => {
  if (!hasBrowserStorage()) return null;

  const storageKey = `${CACHE_PREFIX}${key}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as OfflineCacheEntry<T>;
    if (!parsed || typeof parsed.cachedAt !== 'number') {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    if (Date.now() - parsed.cachedAt > maxAgeMs) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parsed.data;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
};

export const setOfflineCache = <T>(key: string, data: T): void => {
  if (!hasBrowserStorage()) return;

  const storageKey = `${CACHE_PREFIX}${key}`;
  const payload: OfflineCacheEntry<T> = {
    cachedAt: Date.now(),
    data,
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore quota errors to avoid breaking runtime requests.
  }
};

export const getOfflineCacheAsync = async <T>(
  key: string,
  maxAgeMs: number = DEFAULT_OFFLINE_CACHE_TTL_MS
): Promise<T | null> => {
  const storageKey = `${CACHE_PREFIX}${key}`;

  const localValue = getOfflineCache<T>(key, maxAgeMs);
  if (localValue) return localValue;

  const indexedPayload = await getIndexedDbValue<OfflineCacheEntry<T>>(storageKey);
  if (!indexedPayload || typeof indexedPayload.cachedAt !== "number") {
    return null;
  }

  if (Date.now() - indexedPayload.cachedAt > maxAgeMs) {
    await deleteIndexedDbValue(storageKey);
    return null;
  }

  // Keep localStorage warm for synchronous reads.
  setOfflineCache(key, indexedPayload.data);
  return indexedPayload.data;
};

export const setOfflineCacheAsync = async <T>(key: string, data: T): Promise<void> => {
  const storageKey = `${CACHE_PREFIX}${key}`;
  const payload: OfflineCacheEntry<T> = {
    cachedAt: Date.now(),
    data,
  };

  setOfflineCache(key, data);
  await setIndexedDbValue(storageKey, payload);
};

export const isLikelyOfflineError = (errorLike: unknown): boolean => {
  if (!errorLike) return false;

  const text = (() => {
    if (typeof errorLike === 'string') return errorLike;
    if (typeof errorLike === 'object') {
      const obj = errorLike as Record<string, unknown>;
      const parts = [obj.code, obj.message, obj.details]
        .filter(Boolean)
        .map((v) => String(v))
        .join(' ')
        .toLowerCase();
      return parts;
    }
    return String(errorLike).toLowerCase();
  })();

  return (
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('offline') ||
    text.includes('fetch failed') ||
    text.includes('timeout')
  );
};
