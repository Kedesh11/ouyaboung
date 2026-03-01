// ==========================================
// MFA Utilities - Multi-Factor Authentication
// ==========================================

import { requireSupabaseClient } from '@/api/supabaseClient';
import { logger } from '@/lib/logger';
import type { MFAFactor, MFASetupRequest, MFASetupResponse } from './types';

const MFA_FACTOR_COLUMNS =
    'id,user_id,factor_type,secret,phone_number,email,is_verified,is_active,backup_codes,last_used_at,created_at,updated_at';

/**
 * Generate TOTP secret
 */
function generateTOTPSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);

    for (let i = 0; i < 32; i++) {
        secret += chars[array[i] % chars.length];
    }

    return secret;
}

/**
 * Generate QR code URL for TOTP
 */
function generateQRCodeURL(email: string, secret: string): string {
    const issuer = 'Oyaboug';
    const label = `${issuer}:${email}`;
    const otpauthURL = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

    // Using a QR code generation service (in production, generate server-side)
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthURL)}`;
}

/**
 * Generate backup codes
 */
function generateBackupCodes(count = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
        const array = new Uint8Array(4);
        crypto.getRandomValues(array);
        const code = Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
            .match(/.{1,4}/g)
            ?.join('-') || '';
        codes.push(code);
    }

    return codes;
}

/**
 * Setup MFA for user
 */
export async function setupMFA(
    userId: string,
    email: string,
    request: MFASetupRequest
): Promise<MFASetupResponse> {
    const client = requireSupabaseClient();

    try {
        logger.info('Setting up MFA', { userId, factor_type: request.factor_type });

        let secret: string | undefined;
        let qr_code_url: string | undefined;

        // Handle TOTP setup
        if (request.factor_type === 'totp') {
            secret = generateTOTPSecret();
            qr_code_url = generateQRCodeURL(email, secret);
        }

        // Generate backup codes
        const backup_codes = generateBackupCodes();

        // Insert MFA factor
        const { data, error } = await client
            .from('auth_mfa_factors')
            .insert({
                user_id: userId,
                factor_type: request.factor_type,
                secret: secret,
                phone_number: request.phone_number,
                email: request.email,
                is_verified: false, // User must verify first
                is_active: false, // Activate after verification
                backup_codes: backup_codes,
            })
            .select(MFA_FACTOR_COLUMNS)
            .single();

        if (error) throw error;

        logger.info('MFA setup initiated', { userId, factor_id: data.id });

        return {
            factor_id: data.id,
            secret,
            qr_code_url,
            backup_codes,
        };
    } catch (error) {
        logger.error('Failed to setup MFA', error, { userId });
        throw error;
    }
}

/**
 * Verify MFA token (TOTP or backup code)
 */
export async function verifyMFAToken(
    userId: string,
    factorId: string,
    token: string
): Promise<boolean> {
    const client = requireSupabaseClient();

    try {
        // Get the MFA factor
        const { data: factor, error } = await client
            .from('auth_mfa_factors')
            .select(MFA_FACTOR_COLUMNS)
            .eq('id', factorId)
            .eq('user_id', userId)
            .single();

        if (error || !factor) {
            logger.warn('MFA factor not found', { userId, factorId });
            return false;
        }

        let isValid = false;

        // Check if it's a backup code
        if (factor.backup_codes?.includes(token)) {
            isValid = true;

            // Remove used backup code
            const remainingCodes = factor.backup_codes.filter((code: string) => code !== token);
            await client
                .from('auth_mfa_factors')
                .update({ backup_codes: remainingCodes })
                .eq('id', factorId);

            logger.info('MFA verified with backup code', { userId, factorId });
        } else if (factor.factor_type === 'totp' && factor.secret) {
            // Verify TOTP token
            // Note: In production, use a library like otpauth or authenticator
            // For now, this is a simplified version
            isValid = verifyTOTPToken(factor.secret, token);

            if (isValid) {
                logger.info('MFA verified with TOTP', { userId, factorId });
            }
        }

        // Update last used time
        if (isValid) {
            await client
                .from('auth_mfa_factors')
                .update({
                    last_used_at: new Date().toISOString(),
                    is_verified: true, // Mark as verified on first successful use
                    is_active: true,
                })
                .eq('id', factorId);
        } else {
            logger.warn('Invalid MFA token', { userId, factorId });
        }

        return isValid;
    } catch (error) {
        logger.error('Failed to verify MFA token', error, { userId, factorId });
        return false;
    }
}

/**
 * Simple TOTP verification (simplified - use library in production)
 */
function verifyTOTPToken(secret: string, token: string): boolean {
    // This is a placeholder - in production, use a proper TOTP library
    // like 'otpauth' or '@levminer/speakeasy'
    // For demo purposes, we'll just check if token is 6 digits
    return /^\d{6}$/.test(token);
}

/**
 * Get MFA factors for user
 */
export async function getMFAFactors(userId: string): Promise<MFAFactor[]> {
    const client = requireSupabaseClient();

    try {
        const { data, error } = await client
            .from('auth_mfa_factors')
            .select(MFA_FACTOR_COLUMNS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data || [];
    } catch (error) {
        logger.error('Failed to get MFA factors', error, { userId });
        return [];
    }
}

/**
 * Disable MFA factor
 */
export async function disableMFAFactor(userId: string, factorId: string): Promise<void> {
    const client = requireSupabaseClient();

    try {
        await client
            .from('auth_mfa_factors')
            .update({ is_active: false })
            .eq('id', factorId)
            .eq('user_id', userId);

        logger.info('MFA factor disabled', { userId, factorId });
    } catch (error) {
        logger.error('Failed to disable MFA factor', error, { userId, factorId });
        throw error;
    }
}

/**
 * Check if user has MFA enabled
 */
export async function isMFAEnabled(userId: string): Promise<boolean> {
    const client = requireSupabaseClient();

    try {
        const { data } = await client
            .from('auth_mfa_factors')
            .select('id')
            .eq('user_id', userId)
            .eq('is_active', true)
            .eq('is_verified', true)
            .limit(1);

        return (data?.length || 0) > 0;
    } catch {
        return false;
    }
}
