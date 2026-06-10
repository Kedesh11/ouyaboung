// ============================================
// useProfile Hook - User Profile Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabaseClient } from '@/api/supabaseClient';
import type { UserProfile } from '@/types';

const PROFILE_COLUMNS =
  'id,user_id,email,phone,full_name,first_name,last_name,avatar_url,role,address,city,quartier,preferences,created_at,updated_at';

export const useProfile = () => {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    if (!supabaseClient) {
      setError('Supabase client indisponible');
      setLoading(false);
      return;
    }
    const client = supabaseClient;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // First, try to get existing profile
        const { data: existingProfile, error: fetchError } = await client
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('user_id', user.id)
          .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
          throw fetchError;
        }

        if (existingProfile) {
          setProfile(existingProfile);
          return;
        }

        // If no profile exists, create one
        const newProfile = {
          user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
          phone: user.user_metadata?.phone || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          role: user.user_metadata?.role || user.app_metadata?.role || 'user',
        };

        const { data: createdProfile, error: createError } = await client
          .from('profiles')
          .insert(newProfile)
          .select(PROFILE_COLUMNS)
          .single();

        if (createError) {
          throw createError;
        }

        setProfile(createdProfile);
      } catch (err) {
        console.error('Error fetching/creating profile:', err);
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, isAuthenticated]);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile || !user) return { success: false, error: 'No profile or user' };
    if (!supabaseClient) return { success: false, error: 'Supabase client indisponible' };
    const client = supabaseClient;

    try {
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select(PROFILE_COLUMNS)
        .maybeSingle();

      if (error) throw error;

      setProfile(data);
      return { success: true };
    } catch (err) {
      console.error('Error updating profile:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur lors de la mise à jour'
      };
    }
  };

  return {
    profile,
    loading,
    error,
    updateProfile,
  };
};
