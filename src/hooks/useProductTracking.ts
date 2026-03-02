// ============================================================
// Tracking System – Product Observation Hook
// src/hooks/useProductTracking.ts
// ============================================================
"use client";

import { useEffect, useRef } from 'react';
import { observeProduct } from '@/lib/tracking/auto-trackers';

/**
 * Hook to observe a product card and track its dwell time.
 * Usage:
 *   const ref = useProductTracking(product.id);
 *   return <div ref={ref} data-product-id={product.id}>...</div>
 */
export function useProductTracking(productId: string | number) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      observeProduct(ref.current);
    }
  }, [productId]);

  return ref;
}
