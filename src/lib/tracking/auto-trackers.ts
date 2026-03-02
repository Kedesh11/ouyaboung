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
// Product Dwell Time (Intersection Observer)
// ------------------------------------------------------------
const productDwellTimes = new Map<string, number>();
let productObserver: IntersectionObserver | null = null;

/**
 * Initializes an IntersectionObserver to track how long product cards stay in view.
 * Cards must have data-product-id attribute.
 */
export function startProductDwellTracker() {
  if (typeof window === 'undefined' || productObserver) return;

  productObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const productId = (entry.target as HTMLElement).dataset.productId;
      if (!productId) return;

      if (entry.isIntersecting) {
        // Started viewing
        productDwellTimes.set(productId, Date.now());
      } else {
        // Stopped viewing
        const startTime = productDwellTimes.get(productId);
        if (startTime) {
          const duration = Date.now() - startTime;
          if (duration >= 2000) { // Track only if viewed for > 2s
            tracker.track(EventType.PRODUCT_DWELL, { 
              product_id: productId, 
              duration_ms: duration 
            });
          }
          productDwellTimes.delete(productId);
        }
      }
    });
  }, { threshold: 0.5 }); // 50% must be visible

  // Elements are observed via custom hook or manual call when list renders
}

export function observeProduct(el: HTMLElement) {
  productObserver?.observe(el);
}

// ------------------------------------------------------------
// Intent & Hesitation Signals
// ------------------------------------------------------------

/**
 * Track "Intent Signals" like opening shipping details or hovering price info for a long time.
 */
export function trackIntentSignal(type: string, metadata: any = {}) {
  tracker.track(EventType.INTENT_SIGNAL, { signal_type: type, ...metadata });
}

export function trackPriceHesitation(productId: string) {
  tracker.track(EventType.PRICE_HESITATION, { product_id: productId });
}

// ------------------------------------------------------------
// Time on Page / Page View
// ------------------------------------------------------------
export function trackPageView(route: string) {
  tracker.track(EventType.PAGE_VIEW, { route });
}

export function trackTimeOnPage(route: string, durationMs: number) {
  if (durationMs < 100) return; // ignore instant bounces
  tracker.track(EventType.TIME_ON_PAGE, { duration_ms: durationMs }, route);
}
