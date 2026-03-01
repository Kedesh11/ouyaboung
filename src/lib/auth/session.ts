// ==========================================
// Session Manager - Secure Session Management
// ==========================================

import { requireSupabaseClient } from '@/api/supabaseClient';
import { logger } from '@/lib/logger';
import type { AuthSession, SessionInfo, DeviceInfo } from './types';

const AUTH_SESSION_COLUMNS =
    'id,user_id,token_hash,device_info,user_agent,ip_address,is_active,last_activity,expires_at,created_at';

/**
 * Get device information from user agent
 */
function getDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;

    // Detect device type
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
    const isTablet = /iPad|Android.*Tablet/i.test(ua);

    let device_type: DeviceInfo['device_type'] = 'desktop';
    if (isTablet) device_type = 'tablet';
    else if (isMobile) device_type = 'mobile';

    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    // Detect OS
    let os = 'Unknown';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return {
        browser,
        os,
        device_type,
        device_name: `${browser} on ${os}`,
    };
}

/**
 * Create new auth session record
 */
export async function createAuthSession(userId: string, sessionToken: string): Promise<void> {
    const client = requireSupabaseClient();

    try {
        const deviceInfo = getDeviceInfo();

        // Hash the session token for storage (never store plain tokens)
        const tokenHash = await hashToken(sessionToken);

        await client
            .from('auth_sessions')
            .insert({
                user_id: userId,
                token_hash: tokenHash,
                device_info: deviceInfo,
                user_agent: navigator.userAgent,
                is_active: true,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            });

        logger.info('Auth session created', { userId, device: deviceInfo.device_name });
    } catch (error) {
        logger.error('Failed to create auth session', error, { userId });
        // Don't throw - session creation is optional
    }
}

/**
 * Update session last activity
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
    const client = requireSupabaseClient();

    try {
        await client
            .from('auth_sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('id', sessionId);
    } catch (error) {
        logger.error('Failed to update session activity', error, { sessionId });
    }
}

/**
 * Get all active sessions for a user
 */
export async function getActiveSessions(userId: string): Promise<SessionInfo[]> {
    const client = requireSupabaseClient();

    try {
        const { data, error } = await client
            .from('auth_sessions')
            .select(AUTH_SESSION_COLUMNS)
            .eq('user_id', userId)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get current session token to mark current session
        const currentSession = await client.auth.getSession();
        const currentTokenHash = currentSession.data.session
            ? await hashToken(currentSession.data.session.access_token)
            : null;

        return (data || []).map((session: any) => ({
            id: session.id,
            device: session.device_info?.device_name || 'Unknown Device',
            location: 'Unknown', // TODO: Add IP geolocation
            ip_address: session.ip_address || 'Unknown',
            is_current: session.token_hash === currentTokenHash,
            last_activity: new Date(session.last_activity),
            created_at: new Date(session.created_at),
        }));
    } catch (error) {
        logger.error('Failed to get active sessions', error, { userId });
        return [];
    }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<void> {
    const client = requireSupabaseClient();

    try {
        await client
            .from('auth_sessions')
            .update({ is_active: false })
            .eq('id', sessionId);

        logger.info('Session revoked', { sessionId });
    } catch (error) {
        logger.error('Failed to revoke session', error, { sessionId });
        throw error;
    }
}

/**
 * Revoke all sessions for a user (except current)
 */
export async function revokeAllOtherSessions(userId: string): Promise<void> {
    const client = requireSupabaseClient();

    try {
        // Get current session
        const currentSession = await client.auth.getSession();
        const currentTokenHash = currentSession.data.session
            ? await hashToken(currentSession.data.session.access_token)
            : null;

        // Revoke all except current
        await client
            .from('auth_sessions')
            .update({ is_active: false })
            .eq('user_id', userId)
            .neq('token_hash', currentTokenHash || '');

        logger.info('All other sessions revoked', { userId });
    } catch (error) {
        logger.error('Failed to revoke all other sessions', error, { userId });
        throw error;
    }
}

/**
 * Simple token hashing (for demo - use crypto.subtle.digest in production)
 */
async function hashToken(token: string): Promise<string> {
    // Simple hash for now - in production use Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if session is still valid
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
    const client = requireSupabaseClient();

    try {
        const { data } = await client
            .from('auth_sessions')
            .select('is_active, expires_at')
            .eq('id', sessionId)
            .single();

        if (!data) return false;

        return data.is_active && new Date(data.expires_at) > new Date();
    } catch {
        return false;
    }
}
