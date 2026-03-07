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
const firedScrollThresholds = new Set<number>();
const SCROLL_THRESHOLDS = [25, 50, 75, 90, 100];

export function resetScrollTracker() {
  maxScrollDepth = 0;
  firedScrollThresholds.clear();
}

export function startScrollTracker() {
  if (typeof window === 'undefined' || scrollListener) return;

  let ticking = false;

  scrollListener = () => {
    if (ticking) return;

    ticking = true;
    window.requestAnimationFrame(() => {
      const h = document.documentElement;
      const b = document.body;

      const scrollTop = h.scrollTop || b.scrollTop;
      const scrollHeight = (h.scrollHeight || b.scrollHeight) - h.clientHeight;

      if (scrollHeight <= 0) {
        ticking = false;
        return;
      }

      const currentDepth = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
      maxScrollDepth = Math.max(maxScrollDepth, currentDepth);

      SCROLL_THRESHOLDS.forEach((threshold) => {
        if (currentDepth >= threshold && !firedScrollThresholds.has(threshold)) {
          firedScrollThresholds.add(threshold);
          tracker.track(EventType.SCROLL_DEPTH, {
            depth: threshold,
            max_depth: Math.round(maxScrollDepth),
          });
        }
      });

      ticking = false;
    });
  };

  window.addEventListener('scroll', scrollListener, { passive: true });
}

export function stopScrollTracker() {
  if (typeof window === 'undefined') return;
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener);
    scrollListener = null;
  }

  if (maxScrollDepth > 0 && !firedScrollThresholds.has(100)) {
    tracker.track(EventType.SCROLL_DEPTH, {
      depth: Math.round(maxScrollDepth),
      final: true,
    });
  }
}

// ------------------------------------------------------------
// Visibility Tracking
// ------------------------------------------------------------
let visibilityListener: (() => void) | null = null;
let hiddenAtTs: number | null = null;

export function startVisibilityTracker() {
  if (typeof document === 'undefined' || visibilityListener) return;

  visibilityListener = () => {
    const state = document.visibilityState;
    const now = Date.now();

    if (state === 'hidden') {
      hiddenAtTs = now;
      tracker.track(EventType.VISIBILITY_CHANGE, {
        state: 'hidden',
      });
      return;
    }

    const hiddenDurationMs = hiddenAtTs ? now - hiddenAtTs : 0;
    hiddenAtTs = null;

    tracker.track(EventType.VISIBILITY_CHANGE, {
      state: 'visible',
      hidden_duration_ms: hiddenDurationMs,
    });
  };

  document.addEventListener('visibilitychange', visibilityListener);
}

export function stopVisibilityTracker() {
  if (typeof document === 'undefined' || !visibilityListener) return;
  document.removeEventListener('visibilitychange', visibilityListener);
  visibilityListener = null;
  hiddenAtTs = null;
}

// ------------------------------------------------------------
// Product Visibility / Dwell Tracking
// ------------------------------------------------------------
const productViewStartMap = new Map<HTMLElement, number>();
const productSeenSet = new Set<string>();
let productObserver: IntersectionObserver | null = null;

const emitProductDwell = (el: HTMLElement, explicitEndTs?: number) => {
  const productId = el.dataset.productId;
  const start = productViewStartMap.get(el);
  if (!productId || !start) return;

  const duration = Math.max(0, (explicitEndTs ?? Date.now()) - start);
  if (duration >= 750) {
    tracker.track(EventType.PRODUCT_DWELL, {
      product_id: productId,
      duration_ms: duration,
    });
  }

  productViewStartMap.delete(el);
};

export function startProductDwellTracker() {
  if (typeof window === 'undefined' || productObserver) return;

  productObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;
        const productId = el.dataset.productId;
        if (!productId) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (!productSeenSet.has(productId)) {
            productSeenSet.add(productId);
            tracker.track(EventType.PRODUCT_VIEW, {
              product_id: productId,
              visibility_ratio: Number(entry.intersectionRatio.toFixed(2)),
              source: 'intersection_observer',
            });
          }

          if (!productViewStartMap.has(el)) {
            productViewStartMap.set(el, Date.now());
          }
          return;
        }

        emitProductDwell(el, Date.now());
      });
    },
    {
      threshold: [0.25, 0.6, 0.9],
    }
  );
}

export function stopProductDwellTracker() {
  if (!productObserver) return;

  Array.from(productViewStartMap.keys()).forEach((el) => emitProductDwell(el));
  productObserver.disconnect();
  productObserver = null;
  productViewStartMap.clear();
  productSeenSet.clear();
}

export function observeProduct(el: HTMLElement) {
  if (!productObserver) startProductDwellTracker();
  productObserver?.observe(el);
}

export function unobserveProduct(el: HTMLElement) {
  productObserver?.unobserve(el);
  emitProductDwell(el);
}

// ------------------------------------------------------------
// Intent & Price-Sensitivity Trackers
// ------------------------------------------------------------
let intentClickListener: ((event: Event) => void) | null = null;
let intentFocusListener: ((event: Event) => void) | null = null;
let priceSignalListener: ((event: Event) => void) | null = null;

const signalCooldownMap = new Map<string, number>();

const shouldEmitSignal = (signalKey: string, cooldownMs = 3000): boolean => {
  const now = Date.now();
  const last = signalCooldownMap.get(signalKey) ?? 0;
  if (now - last < cooldownMs) {
    return false;
  }

  signalCooldownMap.set(signalKey, now);
  return true;
};

const getEventElement = (event: Event): HTMLElement | null => {
  const target = event.target;
  return target instanceof HTMLElement ? target : null;
};

export function trackIntentSignal(type: string, metadata: Record<string, string | number | boolean> = {}) {
  tracker.track(EventType.INTENT_SIGNAL, { signal_type: type, ...metadata });
}

export function trackPriceHesitation(productId: string, metadata: Record<string, string | number | boolean> = {}) {
  tracker.track(EventType.PRICE_HESITATION, { product_id: productId, ...metadata });
}

export function startIntentTracker() {
  if (typeof document === 'undefined') return;

  if (!intentClickListener) {
    intentClickListener = (event: Event) => {
      const el = getEventElement(event);
      if (!el) return;

      const explicitSignal = el.closest('[data-intent-signal]') as HTMLElement | null;
      if (explicitSignal) {
        const signalType = explicitSignal.dataset.intentSignal || 'custom_intent';
        if (shouldEmitSignal(`intent:${signalType}`)) {
          trackIntentSignal(signalType, {
            source: 'data-attribute',
          });
        }
        return;
      }

      const text = (el.textContent || '').toLowerCase();

      if (/(livraison|shipping|adresse)/.test(text) && shouldEmitSignal('intent:shipping_info_view')) {
        trackIntentSignal('shipping_info_view', { source: 'ui_click' });
      }

      if (/(payer|paiement|checkout|commander)/.test(text) && shouldEmitSignal('intent:checkout_interest')) {
        trackIntentSignal('checkout_interest', { source: 'ui_click' });
      }
    };

    document.addEventListener('click', intentClickListener, true);
  }

  if (!intentFocusListener) {
    intentFocusListener = (event: Event) => {
      const el = getEventElement(event);
      if (!el) return;

      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        return;
      }

      const placeholder =
        'placeholder' in el && typeof el.placeholder === 'string'
          ? el.placeholder
          : '';
      const hint = `${el.name} ${el.id} ${placeholder}`.toLowerCase();
      if (/(address|adresse|phone|telephone|email|city|ville)/.test(hint) && shouldEmitSignal('intent:checkout_form_focus')) {
        trackIntentSignal('checkout_form_focus', {
          field: el.name || el.id || 'unknown',
        });
      }
    };

    document.addEventListener('focusin', intentFocusListener, true);
  }
}

export function stopIntentTracker() {
  if (typeof document === 'undefined') return;

  if (intentClickListener) {
    document.removeEventListener('click', intentClickListener, true);
    intentClickListener = null;
  }

  if (intentFocusListener) {
    document.removeEventListener('focusin', intentFocusListener, true);
    intentFocusListener = null;
  }
}

export function startPriceSensitivityTracker() {
  if (typeof document === 'undefined' || priceSignalListener) return;

  priceSignalListener = (event: Event) => {
    const el = getEventElement(event);
    if (!el) return;

    const explicitSort = el.closest('[data-price-sort]') as HTMLElement | null;
    const explicitDiscount = el.closest('[data-discount-filter]') as HTMLElement | null;

    if (explicitSort && shouldEmitSignal('price:sort')) {
      tracker.track(EventType.PRICE_HESITATION, {
        signal: 'sort_by_price',
        value: explicitSort.dataset.priceSort || 'unknown',
      });
      return;
    }

    if (explicitDiscount && shouldEmitSignal('price:discount')) {
      tracker.track(EventType.PRICE_HESITATION, {
        signal: 'discount_filter',
        value: explicitDiscount.dataset.discountFilter || 'unknown',
      });
      return;
    }

    const text = (el.textContent || '').toLowerCase();
    if (/(prix|price|reduction|discount|promo)/.test(text) && shouldEmitSignal('price:keyword')) {
      tracker.track(EventType.PRICE_HESITATION, {
        signal: 'price_keyword_click',
      });
    }
  };

  document.addEventListener('click', priceSignalListener, true);
  document.addEventListener('change', priceSignalListener, true);
}

export function stopPriceSensitivityTracker() {
  if (typeof document === 'undefined' || !priceSignalListener) return;

  document.removeEventListener('click', priceSignalListener, true);
  document.removeEventListener('change', priceSignalListener, true);
  priceSignalListener = null;
}

// ------------------------------------------------------------
// Page-Level Events
// ------------------------------------------------------------
export function trackPageView(route: string) {
  tracker.track(EventType.PAGE_VIEW, { route });
}

export function trackTimeOnPage(route: string, durationMs: number) {
  if (durationMs < 100) return;
  tracker.track(EventType.TIME_ON_PAGE, { duration_ms: durationMs }, route);
}
