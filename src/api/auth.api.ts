// ============================================
// Auth API - Authentication Operations
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import type { AuthCredentials, SignUpData, ApiResponse, User } from '@/types';

const isDev = process.env.NODE_ENV !== 'production';

const debugLog = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};

const getBaseAppUrl = (): string | null => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      return configuredUrl.replace(/\/+$/, '');
    }
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return null;
};

const buildRedirectUrl = (path: string): string | undefined => {
  const baseUrl = getBaseAppUrl();
  return baseUrl ? `${baseUrl}${path}` : undefined;
};

const isRedirectRelatedError = (message?: string): boolean => {
  if (!message) return false;
  return /redirect|redirect_to|allowed|invalid.*url|site url/i.test(message);
};

const isExpectedSignInError = (message?: string): boolean => {
  if (!message) return false;
  return /invalid login credentials|email not confirmed|invalid email/i.test(message);
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (
  credentials: AuthCredentials
): Promise<ApiResponse<{ user: User; session: unknown }>> => {
  const normalizedEmail = credentials.email.trim().toLowerCase();
  debugLog('=== AUTH.API SIGNINWITHEMAIL ===');
  debugLog('Credentials:', { email: normalizedEmail, password: '***' });

  if (!isSupabaseConfigured()) {
    console.error('Supabase non configuré');
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  try {
    const client = requireSupabaseClient();
    debugLog('Client Supabase obtenu, tentative de connexion...');

    // Wrapper pour ajouter un timeout
    const signInPromise = client.auth.signInWithPassword({
      email: normalizedEmail,
      password: credentials.password,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: Supabase ne répond pas après 10s')), 10000)
    );

    const { data, error } = await Promise.race([signInPromise, timeoutPromise]) as any;
    debugLog('Réponse Supabase reçue:', { data: !!data, error: error?.message });

    if (error) {
      if (isExpectedSignInError(error.message)) {
        debugLog('Erreur Supabase attendue:', error.message);
      } else {
        console.error('Erreur Supabase:', error);
      }
      return {
        data: null,
        error: { code: error.name, message: error.message },
        success: false,
      };
    }

    debugLog('Connexion réussie, utilisateur:', data.user?.email);
    return {
      data: {
        user: data.user as unknown as User,
        session: data.session,
      },
      error: null,
      success: true,
    };
  } catch (error) {
    console.error('Exception dans signInWithEmail:', error);
    return {
      data: null,
      error: { code: 'EXCEPTION', message: (error as Error).message },
      success: false,
    };
  }
};

/**
 * Sign up with email, password, and additional data
 */
export const signUpWithEmail = async (
  signUpData: SignUpData
): Promise<ApiResponse<{ user: User; session: unknown }>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const normalizedEmail = signUpData.email.trim().toLowerCase();
  const client = requireSupabaseClient();
  const redirectUrl = buildRedirectUrl('/auth');
  const safeRole = signUpData.role === 'merchant' ? 'merchant' : 'user';

  try {
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password: signUpData.password,
      options: {
        ...(redirectUrl ? { emailRedirectTo: redirectUrl } : {}),
        data: {
          full_name: signUpData.full_name,
          phone: signUpData.phone,
          role: safeRole,
          business_name: signUpData.business_name,
          ...signUpData.metadata,
        },
      },
    });

    if (error) {
      return {
        data: null,
        error: { code: error.name, message: error.message },
        success: false,
      };
    }

    // Si l'email nécessite une confirmation, data.session sera null
    // mais data.user existe quand même
    return {
      data: {
        user: data.user as unknown as User,
        session: data.session,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    // Gestion des erreurs réseau ou autres erreurs inattendues
    const errorMessage = err instanceof Error ? err.message : 'Une erreur réseau est survenue';
    return {
      data: null,
      error: { code: 'NETWORK_ERROR', message: errorMessage },
      success: false,
    };
  }
};

/**
 * Sign out the current user
 */
export const signOut = async (): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();

  if (error) {
    return {
      data: null,
      error: { code: error.name, message: error.message },
      success: false,
    };
  }

  return { data: null, error: null, success: true };
};

/**
 * Get current session
 */
export const getSession = async () => {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null };
  }

  const client = requireSupabaseClient();
  return client.auth.getSession();
};

/**
 * Get current user
 */
export const getCurrentUser = async () => {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null };
  }

  const client = requireSupabaseClient();
  return client.auth.getUser();
};

/**
 * Reset password
 */
export const resetPassword = async (
  email: string
): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const normalizedEmail = email.trim().toLowerCase();
  const redirectUrl = buildRedirectUrl('/auth/reset');
  const resetOptions = redirectUrl ? { redirectTo: redirectUrl } : undefined;

  let { error } = await client.auth.resetPasswordForEmail(normalizedEmail, resetOptions);

  const errorStatus = (error as { status?: number } | null)?.status;
  const shouldRetryWithoutRedirect = !!error && !!redirectUrl && (
    isRedirectRelatedError(error.message) || errorStatus === 500
  );

  if (shouldRetryWithoutRedirect) {
    const fallbackResult = await client.auth.resetPasswordForEmail(normalizedEmail);
    error = fallbackResult.error;
  }

  if (error) {
    const status = (error as { status?: number }).status;
    let message = error.message;

    if (isRedirectRelatedError(message)) {
      message = "Configuration de redirection invalide. Vérifiez NEXT_PUBLIC_APP_URL et les Redirect URLs autorisées dans Supabase.";
    } else if (status === 500) {
      message = "Le service de réinitialisation est temporairement indisponible. Réessayez dans quelques instants.";
    }

    return {
      data: null,
      error: { code: error.name, message },
      success: false,
    };
  }

  return { data: null, error: null, success: true };
};

/**
 * Update password
 */
export const updatePassword = async (
  newPassword: string
): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { error } = await client.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return {
      data: null,
      error: { code: error.name, message: error.message },
      success: false,
    };
  }

  return { data: null, error: null, success: true };
};

/**
 * Subscribe to auth state changes
 */
export const onAuthStateChange = (
  callback: (event: string, session: unknown) => void
) => {
  if (!isSupabaseConfigured()) {
    return { data: { subscription: { unsubscribe: () => { } } } };
  }

  const client = requireSupabaseClient();
  return client.auth.onAuthStateChange(callback);
};

/**
 * Sign in with OTP (phone or email)
 */
export const signInWithOtp = async (
  identifier: string,
  type: 'email' | 'phone' = 'email'
): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const options = type === 'email'
    ? { email: identifier }
    : { phone: identifier };

  const { error } = await client.auth.signInWithOtp(options);

  if (error) {
    return {
      data: null,
      error: { code: error.name, message: error.message },
      success: false,
    };
  }

  return { data: null, error: null, success: true };
};

/**
 * Verify OTP
 */
export const verifyOtp = async (
  identifier: string,
  token: string,
  type: 'email' | 'phone' = 'email'
): Promise<ApiResponse<{ user: User; session: unknown }>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // For email OTP codes, the type in Supabase is usually 'magiclink' or 'signup'
  // For phone, it's 'sms'
  const verifyType = type === 'email' ? 'magiclink' : 'sms';

  const options = type === 'email'
    ? { email: identifier, token, type: verifyType as any }
    : { phone: identifier, token, type: 'sms' as const };

  const { data, error } = await client.auth.verifyOtp(options);

  if (error) {
    return {
      data: null,
      error: { code: error.name, message: error.message },
      success: false,
    };
  }

  return {
    data: {
      user: data.user as unknown as User,
      session: data.session,
    },
    error: null,
    success: true,
  };
};

/**
 * Update user attributes (metadata, email, password, etc.)
 */
export const updateUser = async (
  attributes: {
    email?: string;
    password?: string;
    data?: object; // user_metadata
  }
): Promise<ApiResponse<{ user: User | null }>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client.auth.updateUser(attributes);

  if (error) {
    return {
      data: null,
      error: { code: error.name, message: error.message },
      success: false,
    };
  }

  return {
    data: { user: data.user as unknown as User },
    error: null,
    success: true,
  };
};
