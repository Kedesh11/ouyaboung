// ============================================================
// Tracking System – Page Auto-Tracking Hook
// src/hooks/usePageTracking.ts
// ============================================================
"use client";

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView, trackTimeOnPage, startScrollTracker, stopScrollTracker, resetScrollTracker } from '@/lib/tracking/auto-trackers';

/**
 * Hook to be instantiated ONE TIME centrally (e.g. inside a global AppEnhancement layout module).
 * It listens to Next.js route navigation and automatically triggers:
 * - time_on_page (when leaving a route)
 * - page_view (when entering a route)
 * - scroll depth tracking (resets per route)
 */
export function usePageTracking() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const lastRouteRef = useRef<string | null>(null);
  const mountTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Construct current full relative URL including query params
    const rawSearch = searchParams?.toString();
    const queryStr = rawSearch ? `?${rawSearch}` : '';
    const currentRoute = `${pathname || ''}${queryStr}`;

    const now = Date.now();
    const lastRoute = lastRouteRef.current;

    if (lastRoute && lastRoute !== currentRoute) {
      // 1. Emit time_on_page for the old route
      const durationMs = now - mountTimeRef.current;
      trackTimeOnPage(lastRoute, durationMs);

      // 2. Stop scroll tracking on old route
      stopScrollTracker();
    }

    if (lastRoute !== currentRoute) {
      // 3. Emit page_view for the new route
      trackPageView(currentRoute);

      // 4. Start scroll tracking for new route
      resetScrollTracker();
      startScrollTracker();

      // Update refs
      lastRouteRef.current = currentRoute;
      mountTimeRef.current = now;
    }
  }, [pathname, searchParams]);

  // Handle final teardown (unmount/unload)
  useEffect(() => {
    return () => {
      const lastRoute = lastRouteRef.current;
      if (lastRoute) {
        const durationMs = Date.now() - mountTimeRef.current;
        trackTimeOnPage(lastRoute, durationMs);
        stopScrollTracker();
      }
    };
  }, []);
}
