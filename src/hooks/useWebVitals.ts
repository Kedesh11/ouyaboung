// Web Vitals monitoring hook
'use client';

import { useEffect } from 'react';
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
import type { Metric } from 'web-vitals';

// Send metrics to analytics endpoint
const sendToAnalytics = (metric: Metric) => {
  // Only send in production
  if (process.env.NODE_ENV !== 'production') return;

  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.pathname : '',
  });

  // Use sendBeacon for reliability (survives page unload)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/vitals', body);
  } else if (typeof fetch !== 'undefined') {
    // Fallback to fetch
    fetch('/api/analytics/vitals', {
      body,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(console.error);
  }
};

const reportMetric = (metric: Metric) => {
  // Log in development
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_WEB_VITALS_DEBUG === 'true') {
    console.log(`[Web Vitals] ${metric.name}:`, {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
    });
  }
  
  // Send to analytics in production
  sendToAnalytics(metric);
};

export function useWebVitals() {
  useEffect(() => {
    // Core Web Vitals
    onCLS(reportMetric); // Cumulative Layout Shift
    onINP(reportMetric); // Interaction to Next Paint (replaces FID)
    onLCP(reportMetric); // Largest Contentful Paint

    // Other metrics
    onFCP(reportMetric); // First Contentful Paint
    onTTFB(reportMetric); // Time to First Byte
  }, []);
}
