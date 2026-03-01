// ============================================================
// Tracking System – Session & Device Utilities
// src/lib/tracking/session.ts
// ============================================================

import type { DeviceType } from './types';

const SESSION_KEY = 'ouyaboung_tracking_sid';

/**
 * Returns the current tab-scoped session ID, creating one if missing.
 * Uses sessionStorage so each browser tab gets a fresh session on open.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';

  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // sessionStorage may be blocked (e.g. Safari private mode strict)
    return crypto.randomUUID();
  }
}

/**
 * Buckets screen width into a device category.
 * Thresholds: mobile < 768, tablet < 1024, desktop >= 1024.
 */
export function getDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  if (w < 768)  return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export interface DeviceInfo {
  device_type: DeviceType;
  user_agent:  string;
  referrer:    string;
}

/**
 * Collects static device info once per session.
 * Kept as a plain function (not hook) so it can run outside React.
 */
export function collectDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { device_type: 'unknown', user_agent: '', referrer: '' };
  }

  return {
    device_type: getDeviceType(),
    user_agent:  navigator.userAgent.slice(0, 512), // cap size
    referrer:    document.referrer.slice(0, 512),
  };
}

/**
 * Returns the current pathname (works SSR → returns '').
 */
export function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname + window.location.search;
}
