// ============================================
// Auth Service - Authentication Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  signInWithEmail,
  signUpWithEmail,
  signOut as apiSignOut,
  getSession,
  getCurrentUser as apiGetCurrentUser,
  resetPassword as apiResetPassword,
  updatePassword as apiUpdatePassword,
  onAuthStateChange,
  signInWithOtp,
  verifyOtp,
  updateUser,
} from '@/api';
import type { AuthCredentials, SignUpData, User, UserRole, ApiResponse } from '@/types';

/**
 * Login with email and password
 */
export const login = async (
  email: string,
  password: string
): Promise<ApiResponse<{ user: User; session: unknown }>> => {
  const credentials: AuthCredentials = { email: email.trim().toLowerCase(), password };
  return signInWithEmail(credentials);
};

/**
 * Register a new user
 */
export const register = async (
  email: string,
  password: string,
  options: {
    fullName?: string;
    phone?: string;
    role?: UserRole;
    businessName?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<ApiResponse<{ user: User; session: unknown }>> => {
  const signUpData: SignUpData = {
    email: email.trim().toLowerCase(),
    password,
    full_name: options.fullName,
    phone: options.phone,
    role: options.role || 'user',
    business_name: options.businessName,
    metadata: options.metadata,
  };
  return signUpWithEmail(signUpData);
};

/**
 * Logout current user
 */
export const logout = async (): Promise<ApiResponse<null>> => {
  return apiSignOut();
};

/**
 * Get current authenticated session
 */
export const getAuthSession = async () => {
  return getSession();
};

/**
 * Get current authenticated user
 */
export const getAuthUser = async () => {
  return apiGetCurrentUser();
};

/**
 * Get current user (re-exported from API for backward compatibility)
 */
export const getCurrentUser = apiGetCurrentUser;

/**
 * Request password reset
 */
export const requestPasswordReset = async (
  email: string
): Promise<ApiResponse<null>> => {
  return apiResetPassword(email.trim().toLowerCase());
};

/**
 * Update password (when authenticated)
 */
export const changePassword = async (
  newPassword: string
): Promise<ApiResponse<null>> => {
  return apiUpdatePassword(newPassword);
};

/**
 * Subscribe to authentication state changes
 */
export const subscribeToAuthChanges = (
  callback: (event: string, session: unknown) => void
) => {
  return onAuthStateChange(callback);
};

/**
 * Login with OTP (phone or email)
 */
export const loginWithOtp = async (
  identifier: string,
  type: 'email' | 'phone' = 'email'
): Promise<ApiResponse<null>> => {
  return signInWithOtp(identifier, type);
};

/**
 * Verify OTP code
 */
export const verifyOtpCode = async (
  identifier: string,
  token: string,
  type: 'email' | 'phone' = 'email'
): Promise<ApiResponse<{ user: User; session: unknown }>> => {
  return verifyOtp(identifier, token, type);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const { data } = await getSession();
  return !!data?.session;
};

/**
 * Get user role from session
 */
export const getUserRole = async (): Promise<UserRole | null> => {
  const { data } = await apiGetCurrentUser();
  return (data?.user?.user_metadata?.role as UserRole) || null;
};

/**
 * Update user profile (metadata)
 */
export const updateProfile = async (
  metadata: object
): Promise<ApiResponse<{ user: User | null }>> => {
  return updateUser({ data: metadata });
};
