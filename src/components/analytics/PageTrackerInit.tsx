"use client";

import { usePageTracking } from '@/hooks/usePageTracking';

/**
 * Empty wrapper to run the usePageTracking hook at the root of the app.
 * Must be rendered inside TrackingProvider.
 */
export function PageTrackerInit() {
  usePageTracking();
  return null;
}
