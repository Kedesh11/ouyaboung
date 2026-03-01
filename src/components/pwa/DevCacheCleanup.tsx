'use client';

import { useEffect } from 'react';

/**
 * Prevent stale Next.js chunks in local development by removing old SW/caches.
 * This runs only in development and has no effect in production.
 */
export function DevCacheCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const clearDevCaches = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
        }
      } catch (error) {
        console.warn('[DevCacheCleanup] Failed to clear SW cache', error);
      }
    };

    void clearDevCaches();
  }, []);

  return null;
}
