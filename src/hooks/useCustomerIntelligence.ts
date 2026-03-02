// ============================================================
// Tracking System – Customer Intelligence Hook
// src/hooks/useCustomerIntelligence.ts
// ============================================================
"use client";

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/api/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface UserIntelligence {
  intent_score: number;
  engagement_score: number;
  price_sensitivity_score: number;
  churn_risk_score: number;
  dynamic_segment: string;
}

/**
 * Hook to fetch the real-time scoring and segmentation for the current user.
 * Allows UI components to personalize themselves.
 */
export function useCustomerIntelligence() {
  const { user, isAuthenticated } = useAuth();
  const [intelligence, setIntelligence] = useState<UserIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIntelligence() {
      if (!isAuthenticated || !user) {
        setIntelligence(null);
        setLoading(false);
        return;
      }

      try {
        if (!supabaseClient) return;

        const { data, error } = await supabaseClient
          .rpc('get_my_intelligence')
          .maybeSingle();

        if (error) {
          console.error('[Intelligence Hook] Error fetching data:', error);
        } else if (data) {
          setIntelligence(data as UserIntelligence);
        }
      } catch (err) {
        console.error('[Intelligence Hook] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchIntelligence();
  }, [user?.id, isAuthenticated]);

  return { intelligence, loading };
}
