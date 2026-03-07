// ============================================================
// Tracking System – Product Observation Hook
// src/hooks/useProductTracking.ts
// ============================================================
"use client";

import { useEffect, useRef } from 'react';
import { observeProduct, unobserveProduct } from '@/lib/tracking/auto-trackers';

/**
 * Hook to observe a product card and track its dwell time.
 * Usage:
 *   const ref = useProductTracking(product.id);
 *   return <div ref={ref} data-product-id={product.id}>...</div>
 */
export function useProductTracking(productId: string | number) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.dataset.productId = String(productId);
    observeProduct(element);

    return () => {
      unobserveProduct(element);
    };
  }, [productId]);

  return ref;
}
