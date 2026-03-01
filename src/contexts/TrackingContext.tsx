// ============================================================
// Tracking System – React Context Provider
// src/contexts/TrackingContext.tsx
// ============================================================
"use client";

import React, { createContext, useEffect, ReactNode } from 'react';
import { tracker } from '@/lib/tracking/tracker';
import { useAuth } from './AuthContext';
import { type EventType, type EventMetadata } from '@/lib/tracking/types';

interface TrackingContextType {
  /**
   * Manually track a business event.
   * Route, session, device info, and user_id are automatically attached.
   */
  track: (eventType: EventType, metadata?: EventMetadata, routeOverride?: string) => void;
}

export const TrackingContext = createContext<TrackingContextType | undefined>(undefined);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    // Initialize the singleton once
    tracker.init(user?.id || null);

    return () => {
      tracker.teardown();
    };
  }, []); // Only run once on mount

  // Keep the user ID in sync without tearing down the whole tracker
  useEffect(() => {
    tracker.setUserId(user?.id || null);
  }, [user?.id]);

  const value: TrackingContextType = {
    track: (eventType, metadata, routeOverride) => tracker.track(eventType, metadata, routeOverride),
  };

  return (
    <TrackingContext.Provider value={value}>
      {children}
    </TrackingContext.Provider>
  );
}
