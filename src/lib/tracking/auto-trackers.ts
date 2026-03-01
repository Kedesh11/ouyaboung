// ============================================================
// Tracking System – Auto Trackers (DOM listeners)
// src/lib/tracking/auto-trackers.ts
// ============================================================

import { EventType } from './types';
import { tracker } from './tracker';

// ------------------------------------------------------------
// Scroll Depth Tracking
// ------------------------------------------------------------
let maxScrollDepth = 0;
let scrollListener: (() => void) | null = null;
const SCROLL_THRESHOLDS = [25, 50, 75, 90, 100];

export function resetScrollTracker() {
  maxScrollDepth = 0;
}

export function startScrollTracker() {
  if (typeof window === 'undefined' || scrollListener) return;

  let ticking = false;

  scrollListener = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const h = document.documentElement;
        const b = document.body;
        const scrollPercent =
           (h.scrollTop || b.scrollTop) / 
           ((h.scrollHeight || b.scrollHeight) - h.clientHeight) * 100;

        const currentDepth = Math.min(100, Math.max(0, scrollPercent));

        if (currentDepth > maxScrollDepth) {
          maxScrollDepth = currentDepth;
          // Find thresholds crossed
          for (let i = SCROLL_THRESHOLDS.length - 1; i >= 0; i--) {
            const threshold = SCROLL_THRESHOLDS[i];
            if (currentDepth >= threshold && maxScrollDepth < threshold + 1) { // roughly crossed it this tick
               // Because we jump values fast, the most robust way is just:
            }
          }
          // Simpler logic: if we cross a threshold we haven't tracked yet for this page
          // (Requires tracking which thresholds were fired per page). 
          // Let's defer threshold firing and just track max depth on unload instead for simplicity and less spam.
        }
        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', scrollListener, { passive: true });
}

export function stopScrollTracker() {
  if (typeof window === 'undefined' || !scrollListener) return;
  window.removeEventListener('scroll', scrollListener);
  scrollListener = null;

  // Emit final max depth if > 0
  if (maxScrollDepth > 10) {
    tracker.track(EventType.SCROLL_DEPTH, { depth: Math.round(maxScrollDepth) });
  }
}

// ------------------------------------------------------------
// Time on Page / Page View
// ------------------------------------------------------------
export function trackPageView(route: string) {
  tracker.track(EventType.PAGE_VIEW, { route });
}

export function trackTimeOnPage(route: string, durationMs: number) {
  if (durationMs < 100) return; // ignore instant bounces
  // Note: we can override the route so the time_on_page event 
  // correctly attributes to the PREVIOUS route we just left.
  tracker.track(EventType.TIME_ON_PAGE, { duration_ms: durationMs }, route);
}
