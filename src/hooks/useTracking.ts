// ============================================================
// Tracking System – Convenience Hook
// src/hooks/useTracking.ts
// ============================================================

import { useContext } from 'react';
import { TrackingContext } from '@/contexts/TrackingContext';

export function useTracking() {
  const context = useContext(TrackingContext);
  if (context === undefined) {
    throw new Error('useTracking must be used within a TrackingProvider');
  }
  return context;
}
