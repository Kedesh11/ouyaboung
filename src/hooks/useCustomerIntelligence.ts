// ============================================================
// Tracking System – Customer Intelligence Hook
// src/hooks/useCustomerIntelligence.ts
// ============================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseClient } from '@/api/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface UserIntelligence {
  user_id?: string;
  intent_score: number;
  engagement_score: number;
  price_sensitivity_score: number;
  churn_risk_score: number;
  dynamic_segment: string;
  source?: string;
  updated_at?: string;
}

export type IntelligenceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface IntelligenceApiResponse {
  success: boolean;
  intelligence?: UserIntelligence;
  error?: {
    code: string;
    message: string;
  };
}

const EMPTY_INTELLIGENCE: UserIntelligence = {
  intent_score: 0,
  engagement_score: 0,
  price_sensitivity_score: 0,
  churn_risk_score: 0,
  dynamic_segment: 'Regular',
};

const deriveRecommendation = (intel: UserIntelligence | null) => {
  if (!intel) {
    return {
      banner: 'default',
      message: 'Découvrez les meilleures offres près de chez vous.',
    };
  }

  if (intel.price_sensitivity_score >= 60) {
    return {
      banner: 'discount_focus',
      message: 'Mettez en avant les paniers les plus remisés.',
    };
  }

  if (intel.intent_score >= 65 && intel.churn_risk_score < 40) {
    return {
      banner: 'high_intent',
      message: 'Proposez une recommandation produit immédiate.',
    };
  }

  if (intel.churn_risk_score >= 70) {
    return {
      banner: 'retention',
      message: 'Afficher un incentive de retour (code promo ou panier vedette).',
    };
  }

  return {
    banner: 'exploration',
    message: 'Continuer à enrichir le catalogue personnalisé.',
  };
};

export function useCustomerIntelligence() {
  const { user, session, loading: authLoading, isAuthenticated } = useAuth();

  const [intelligence, setIntelligence] = useState<UserIntelligence | null>(null);
  const [status, setStatus] = useState<IntelligenceStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchIntelligence = useCallback(async () => {
    if (authLoading) {
      setStatus('idle');
      return;
    }

    if (!isAuthenticated || !user) {
      setIntelligence(null);
      setError(null);
      setStatus('idle');
      return;
    }

    const accessToken = session?.access_token;
    if (!accessToken) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const response = await fetch('/api/analytics/intelligence', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401) {
        setStatus('idle');
        setError(null);
        return;
      }

      if (!response.ok) {
        const fallback = await response.json().catch(() => null) as IntelligenceApiResponse | null;
        throw new Error(fallback?.error?.message || 'Failed to load intelligence profile');
      }

      const payload = (await response.json()) as IntelligenceApiResponse;
      if (payload.success && payload.intelligence) {
        setIntelligence(payload.intelligence);
      } else {
        setIntelligence(EMPTY_INTELLIGENCE);
      }

      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown intelligence error');

      // Fallback: use RPC if API route fails but session is valid.
      try {
        if (!supabaseClient) return;
        const { data } = await supabaseClient.rpc('get_my_intelligence').maybeSingle();
        if (data) {
          const fallbackData = data as Partial<UserIntelligence>;
          setIntelligence({
            ...EMPTY_INTELLIGENCE,
            ...fallbackData,
          });
          setStatus('ready');
          setError(null);
        }
      } catch {
        // Silent fallback failure.
      }
    }
  }, [authLoading, isAuthenticated, session?.access_token, user]);

  useEffect(() => {
    void fetchIntelligence();
  }, [fetchIntelligence]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user || !session?.access_token) return;

    const pollId = window.setInterval(() => {
      void fetchIntelligence();
    }, 60_000);

    return () => {
      window.clearInterval(pollId);
    };
  }, [authLoading, fetchIntelligence, isAuthenticated, session?.access_token, user]);

  const recommendation = useMemo(() => deriveRecommendation(intelligence), [intelligence]);

  return {
    intelligence,
    status,
    loading: status === 'loading',
    error,
    recommendation,
    refresh: fetchIntelligence,
  };
}
