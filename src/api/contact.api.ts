
// ============================================
// Contact API - Help & Support
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import type { ApiResponse } from '@/types';

export interface ContactMessageParams {
    user_id: string;
    subject: string;
    message: string;
}

/**
 * Send a contact message
 */
export const sendContactMessage = async (
    params: ContactMessageParams
): Promise<ApiResponse<null>> => {
    if (!isSupabaseConfigured()) {
        console.log('[MOCK] Contact message sent:', params);
        return { data: null, error: null, success: true };
    }

    const client = requireSupabaseClient();

    try {
        const { error } = await client
            .from(DB_TABLES.CONTACT_MESSAGES)
            .insert({
                user_id: params.user_id,
                subject: params.subject,
                message: params.message,
            });

        if (error) throw error;

        return { data: null, error: null, success: true };
    } catch (error: any) {
        return {
            data: null,
            error: { code: 'INSERT_ERROR', message: error.message },
            success: false,
        };
    }
};
