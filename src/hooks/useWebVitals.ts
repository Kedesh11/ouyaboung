// Web Vitals monitoring hook
'use client';

import { useEffect } from 'react';
import { onCLS, onINP, onLCP, onFCP, onTTFB, Metric } from 'web-vitals';

function sendToAnalytics(metric: Metric) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vitals] ${metric.name}:`, {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
    });
  }

  // In production, you could send to your analytics endpoint
  // fetch('/api/analytics', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(metric),
  // });
}

export function useWebVitals() {
  useEffect(() => {
    // Core Web Vitals
    onCLS(sendToAnalytics); // Cumulative Layout Shift
    onINP(sendToAnalytics); // Interaction to Next Paint (replaces FID)
    onLCP(sendToAnalytics); // Largest Contentful Paint

    // Other metrics
    onFCP(sendToAnalytics); // First Contentful Paint
    onTTFB(sendToAnalytics); // Time to First Byte
  }, []);
}
