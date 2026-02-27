"use client";

// ============================================
// Auth Context - Global Authentication State Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabaseClient } from '@/api/supabaseClient';
import type { UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  userRole: UserRole | null;
  isAdmin: boolean;
  isMerchant: boolean;
  isUser: boolean;
  isVerifiedMerchant: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };
export type { AuthContextType };

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  };
  const debugWarn = (...args: unknown[]) => {
    if (isDev) {
      console.warn(...args);
    }
  };

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isVerifiedMerchant, setIsVerifiedMerchant] = useState(false);

  const isInvalidRefreshTokenError = (error: unknown): boolean => {
    const message = (error as { message?: string } | null)?.message || '';
    return /invalid refresh token|refresh token not found/i.test(message);
  };

  const clearStoredSupabaseSession = () => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem('supabase.auth.token');

      Object.keys(localStorage).forEach((key) => {
        // Supabase JS v2 storage key format: sb-<project-ref>-auth-token
        if (/^sb-.*-auth-token$/.test(key)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      debugWarn('[AuthContext] Failed to clear local auth storage', error);
    }
  };

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    let safetyTimeout: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        if (isDev) {
          console.log('=== INITIALISATION AUTH CONTEXT ===');
          console.time('Auth Init Total');
        }

        if (!supabaseClient) {
          console.error('Client Supabase non disponible');
          if (mounted) setLoading(false);
          return;
        }

        debugLog('Fetching session...');
        const { data: { session: initialSession }, error } = await supabaseClient.auth.getSession();
        debugLog('Session fetched:', !!initialSession);

        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            debugWarn('[AuthContext] Invalid refresh token detected, cleaning local session...');
            clearStoredSupabaseSession();
            await supabaseClient.auth.signOut({ scope: 'local' });
          } else {
            console.error('Error getting session:', error);
          }
        }

        if (mounted && initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);

          // Fetch user profile from database
          debugLog('[AuthContext] Fetching profile for user:', initialSession.user.id);
          const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('user_id', initialSession.user.id)
            .single();

          debugLog('[AuthContext] Profile fetch result:', {
            profile,
            profileError,
            hasProfile: !!profile,
            role: profile?.role
          });

          if (profileError) {
            console.error('[AuthContext] Error fetching user profile:', profileError);
            // Fallback to metadata
            const role = initialSession.user.user_metadata?.role ||
              initialSession.user.app_metadata?.role ||
              'user';
            debugLog('[AuthContext] Using fallback role from metadata:', role);
            setUserRole(role as UserRole);
          } else if (profile) {
            debugLog('[AuthContext] Setting role from profile:', profile.role);
            setUserRole(profile.role as UserRole);

            // If merchant, check verification status
            if (profile.role === 'merchant') {
              const { data: merchant } = await supabaseClient
                .from('merchants')
                .select('is_verified')
                .eq('user_id', initialSession.user.id)
                .maybeSingle();
              setIsVerifiedMerchant(!!merchant?.is_verified);
            }
          } else {
            // No profile found, use metadata as fallback
            const role = initialSession.user.user_metadata?.role ||
              initialSession.user.app_metadata?.role ||
              'user';
            debugLog('[AuthContext] No profile found, using metadata role:', role);
            setUserRole(role as UserRole);
          }
        }
      } catch (error: any) {
        // Ignore AbortError which is expected during cleanup/fast refresh
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          return;
        }
        console.error('Error initializing auth:', error);
      } finally {
        if (mounted) {
          clearTimeout(safetyTimeout);
          if (isDev) {
            console.timeEnd('Auth Init Total');
          }
          debugLog('Auth initialization complete, setting loading=false');
          setLoading(false);
        }
      }
    };

    // Set safety timeout before initialization
    safetyTimeout = setTimeout(() => {
      if (mounted) {
        debugWarn('SAFETY TIMEOUT REACHED - Force setting loading=false');
        setLoading(false);
      }
    }, 5000); // Increased back to 5000ms to avoid race conditions on slower connections

    initializeAuth();

    if (supabaseClient) {
      const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
        async (event, session) => {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            debugLog('[AuthContext] Auth state change: fetching profile for', session.user.id);
            const { data: profile, error: profileError } = await supabaseClient
              .from('profiles')
              .select('role')
              .eq('user_id', session.user.id)
              .single();

            if (profileError) {
              debugWarn('[AuthContext] Error fetching profile on auth change:', profileError);
              const role = session.user.user_metadata?.role ||
                session.user.app_metadata?.role ||
                'user';
              debugLog('[AuthContext] Using fallback role:', role);
              setUserRole(role as UserRole);
            } else if (profile) {
              debugLog('[AuthContext] Role updated from profile:', profile.role);
              setUserRole(profile.role as UserRole);
            } else {
              const role = session.user.user_metadata?.role ||
                session.user.app_metadata?.role ||
                'user';
              debugLog('[AuthContext] No profile found on auth change, using fallback:', role);
              setUserRole(role as UserRole);
            }

            // Check merchant status
            const roleToCheck = profile?.role || session.user.user_metadata?.role;
            if (roleToCheck === 'merchant') {
              const { data: merchant } = await supabaseClient
                .from('merchants')
                .select('is_verified')
                .eq('user_id', session.user.id)
                .maybeSingle();
              setIsVerifiedMerchant(!!merchant?.is_verified);
            } else {
              setIsVerifiedMerchant(false);
            }
          } else {
            setUserRole(null);
            setIsVerifiedMerchant(false);
          }

          setLoading(false);
        }
      );

      return () => {
        mounted = false;
        clearTimeout(safetyTimeout);
        subscription?.unsubscribe();
      };
    }

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
    };
  }, []);

  const signOut = async () => {
    try {
      debugLog('[AuthContext] Starting sign out process...');

      // Clear local state immediately for better UX
      setUser(null);
      setSession(null);
      setUserRole(null);
      setIsVerifiedMerchant(false);
      clearStoredSupabaseSession();

      if (!supabaseClient) return;

      // Use a race to avoid hanging on remote sign out
      const signOutPromise = supabaseClient.auth.signOut();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign out timed out')), 3000)
      );

      try {
        await Promise.race([signOutPromise, timeoutPromise]);
        debugLog('[AuthContext] Remote sign out successful');
      } catch (timeoutError) {
        debugWarn('[AuthContext] Remote sign out timed out or failed, but local state cleared:', timeoutError);
      }
    } catch (error) {
      console.error('[AuthContext] Error in signOut function:', error);
      // Even if everything fails, make sure we stop loading and clear user
      setUser(null);
      setSession(null);
    }
  };

  const refreshUser = async () => {
    try {
      const { data: { user: refreshedUser } } = await supabaseClient?.auth.getUser() || { data: {} };
      if (refreshedUser) {
        setUser(refreshedUser);

        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role')
          .eq('user_id', refreshedUser.id)
          .single();

        if (profile) {
          setUserRole(profile.role as UserRole);
        } else {
          const role = refreshedUser.user_metadata?.role ||
            refreshedUser.app_metadata?.role ||
            'user';
          setUserRole(role as UserRole);
        }

        // Refresh merchant status
        const roleToCheck = profile?.role || refreshedUser.user_metadata?.role;
        if (roleToCheck === 'merchant') {
          const { data: merchant } = await supabaseClient
            .from('merchants')
            .select('is_verified')
            .eq('user_id', refreshedUser.id)
            .maybeSingle();
          setIsVerifiedMerchant(!!merchant?.is_verified);
        } else {
          setIsVerifiedMerchant(false);
        }
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signOut,
    refreshUser,
    isAuthenticated: !!user,
    userRole,
    isAdmin: userRole === 'admin',
    isMerchant: userRole === 'merchant',
    isUser: userRole === 'user',
    isVerifiedMerchant,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
