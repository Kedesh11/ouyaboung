/**
 * Service de paiement - Airtel Money via Q-Gabon
 * 
 * Architecture:
 * 1. Validation téléphone stricte (9 chiffres, préfixes Airtel)
 * 2. Calcul des frais (3% + 3% + 3% = 9%)
 * 3. Appel Edge Function avec auth token
 * 4. Edge Function → API Q-Gabon → Callback webhook
 * 5. Mise à jour table transactions
 */

import { ApiResponse } from '@/types';
import { supabaseClient } from '@/api/supabaseClient';
import { calculatePaymentFees, getFeeRates, PaymentFees } from '@/lib/payment-fees';
import {
    validateAirtelPhone,
    validateMoovPhone,
    normalizePhone,
    getAirtelPhoneError,
    getMoovPhoneError,
    detectOperator
} from '@/lib/phone-validation';
import type { QGabonPaymentResponse } from '@/types/qgabon';

const SUPABASE_FUNCTIONS_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/functions/v1`
    : null;

const getFunctionUrl = (name: string): string | null => {
    if (!SUPABASE_FUNCTIONS_BASE_URL) return null;
    return `${SUPABASE_FUNCTIONS_BASE_URL}/${name}`;
};

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface PaymentInitiationRequest {
    phone: string;          // Numéro Airtel (sera validé)
    orderId: string;        // ID de la commande
    baseAmount: number;     // Montant de base (panier)
}

export interface PaymentInitiationResponse {
    transactionId: string;  // ID de notre transaction interne
    qGabonReference: string; // Référence Q-Gabon
    totalAmount: number;    // Montant total avec frais
    fees: {
        airtel: number;
        pvit: number;
        app: number;
        total: number;
    };
    status: string;
    message: string;
    transaction: any; // Full transaction object for flexibility
}

//============================================
// EXPORTS DES UTILITAIRES
// ============================================

export { calculatePaymentFees, validateAirtelPhone, getFeeRates };
export type { PaymentFees };

// ============================================
// SERVICE PUBLIC
// ============================================

/**
 * Initie un paiement Airtel Money via Q-Gabon
 * 
 * Processus:
 * 1. Validation du numéro de téléphone
 * 2. Calcul automatique des frais
 * 3. Récupération du token d'authentification
 * 4. Appel à l'Edge Function
 * 5. Edge Function crée la transaction et appelle Q-Gabon
 * 
 * @param request - Détails du paiement
 * @returns Réponse avec ID transaction et détails frais
 */
export const initiateAirtelPayment = async (
    request: PaymentInitiationRequest
): Promise<ApiResponse<PaymentInitiationResponse>> => {
    if (!supabaseClient) {
        return {
            success: false,
            data: null,
            error: {
                message: 'Supabase non configure.',
                code: 'NOT_CONFIGURED',
                details: null
            }
        };
    }

    console.log('[Payment Service] Initiating payment:', {
        orderId: request.orderId,
        baseAmount: request.baseAmount,
        phone: request.phone.slice(0, 3) + '****' // Masquer le numéro
    });

    try {
        // === 1. VALIDATION DU TÉLÉPHONE ===
        const phoneError = getAirtelPhoneError(request.phone);
        if (phoneError) {
            console.warn('[Payment Service] Invalid phone number:', phoneError);
            return {
                success: false,
                data: null,
                error: {
                    message: phoneError,
                    code: 'INVALID_PHONE',
                    details: null
                }
            };
        }

        const normalizedPhone = normalizePhone(request.phone);
        if (!normalizedPhone) {
            return {
                success: false,
                data: null,
                error: {
                    message: 'Impossible de normaliser le numéro de téléphone',
                    code: 'PHONE_NORMALIZATION_ERROR',
                    details: null
                }
            };
        }

        console.log('[Payment Service] Phone validated successfully');

        // === 2. CALCUL DES FRAIS ===
        const fees = calculatePaymentFees(request.baseAmount);
        console.log('[Payment Service] Fees calculated:', {
            base: fees.baseAmount,
            airtel: fees.airtelFees,
            pvit: fees.pvitFees,
            app: fees.appFees,
            total: fees.finalAmount
        });

        // === 3. RÉCUPÉRATION DU TOKEN D'AUTHENTIFICATION ===
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            console.error('[Payment Service] No active session found');
            return {
                success: false,
                data: null,
                error: {
                    message: 'Session expirée. Veuillez vous reconnecter.',
                    code: 'NO_SESSION',
                    details: null
                }
            };
        }

        // === 4. APPEL À L'EDGE FUNCTION ===
        const payload = {
            phone: normalizedPhone,
            orderId: request.orderId,
            baseAmount: request.baseAmount
        };

        console.log('[Payment Service] Calling Edge Function: initiate-airtel (via fetch)...');

        const functionUrl = getFunctionUrl('initiate-airtel');
        if (!functionUrl) {
            return {
                success: false,
                data: null,
                error: {
                    message: "URL d'Edge Function non configuree.",
                    code: 'NOT_CONFIGURED',
                    details: null
                }
            };
        }
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload)
        });

        console.log('[Payment Service] Airtel Fetch status:', response.status);

        const data = await response.json();

        if (!response.ok) {
            console.error('[Payment Service] Airtel Edge Function Error Body:', data);
            return {
                success: false,
                data: null,
                error: {
                    message: data?.error?.message || 'Erreur Edge Function (Airtel)',
                    code: data?.error?.code || 'EDGE_ERROR',
                    details: data
                }
            };
        }

        if (!data || !data.success) {
            return {
                success: false,
                data: null,
                error: {
                    message: data?.error?.message || 'Échec du paiement Airtel',
                    code: 'PAYMENT_FAILED',
                    details: data?.error?.details || null
                }
            };
        }

        // === 5. RETOUR DU SUCCÈS ===
        console.log('[Payment Service] Payment initiated successfully');

        return {
            success: true,
            data: {
                transactionId: data.data.transactionId,
                qGabonReference: data.data.qGabonReference,
                totalAmount: data.data.totalAmount,
                fees: data.data.fees,
                status: data.data.status || 'PENDING',
                message: data.data.message || 'Paiement initié avec succès',
                transaction: data.data.transaction // Pass full object
            },
            error: null
        };

    } catch (error) {
        console.error('[Payment Service] Unexpected error:', error);
        return {
            success: false,
            data: null,
            error: {
                message: error instanceof Error ? error.message : 'Erreur inconnue',
                code: 'UNEXPECTED_ERROR',
                details: error as Record<string, unknown>
            }
        };
    }
};

/**
 * Initie un paiement Moov Money via Q-Gabon
 * 
 * @param request - Détails du paiement
 * @returns Réponse avec ID transaction et détails frais
 */
export const initiateMoovPayment = async (
    request: PaymentInitiationRequest
): Promise<ApiResponse<PaymentInitiationResponse>> => {
    if (!supabaseClient) {
        return {
            success: false,
            data: null,
            error: {
                message: 'Supabase non configure.',
                code: 'NOT_CONFIGURED',
                details: null
            }
        };
    }

    console.log('[Payment Service] Initiating Moov payment:', {
        orderId: request.orderId,
        baseAmount: request.baseAmount,
        phone: request.phone.slice(0, 3) + '****'
    });

    try {
        // === 1. VALIDATION DU TÉLÉPHONE ===
        const phoneError = getMoovPhoneError(request.phone);
        if (phoneError) {
            return {
                success: false,
                data: null,
                error: {
                    message: phoneError,
                    code: 'INVALID_PHONE',
                    details: null
                }
            };
        }

        const normalizedPhone = normalizePhone(request.phone);
        if (!normalizedPhone) {
            return {
                success: false,
                data: null,
                error: {
                    message: 'Impossible de normaliser le numéro de téléphone',
                    code: 'PHONE_NORMALIZATION_ERROR',
                    details: null
                }
            };
        }

        // === 2. CALCUL DES FRAIS ===
        const fees = calculatePaymentFees(request.baseAmount);

        // === 3. RÉCUPÉRATION DU TOKEN D'AUTHENTIFICATION ===
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            return {
                success: false,
                data: null,
                error: {
                    message: 'Session expirée. Veuillez vous reconnecter.',
                    code: 'NO_SESSION',
                    details: null
                }
            };
        }

        // === 4. APPEL À L'EDGE FUNCTION ===
        const payload = {
            phone: normalizedPhone,
            orderId: request.orderId,
            baseAmount: request.baseAmount
        };

        console.log('[Payment Service] Calling Edge Function: initiate-moov (via fetch)...');

        const functionUrl = getFunctionUrl('initiate-moov');
        if (!functionUrl) {
            return {
                success: false,
                data: null,
                error: {
                    message: "URL d'Edge Function non configuree.",
                    code: 'NOT_CONFIGURED',
                    details: null
                }
            };
        }
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload)
        });

        console.log('[Payment Service] Moov Fetch status:', response.status);

        const data = await response.json();

        if (!response.ok) {
            console.error('[Payment Service] Moov Edge Function Error Body:', data);
            return {
                success: false,
                data: null,
                error: {
                    message: data?.error?.message || 'Erreur Edge Function (Moov)',
                    code: data?.error?.code || 'EDGE_ERROR',
                    details: data
                }
            };
        }

        if (!data || !data.success) {
            return {
                success: false,
                data: null,
                error: {
                    message: data?.error?.message || 'Échec du paiement Moov',
                    code: 'PAYMENT_FAILED',
                    details: data?.error || null
                }
            };
        }

        return {
            success: true,
            data: {
                transactionId: data.data.transactionId,
                qGabonReference: data.data.qGabonReference,
                totalAmount: data.data.totalAmount,
                fees: data.data.fees,
                status: data.data.status || 'PENDING',
                message: data.data.message || 'Paiement Moov initié',
                transaction: data.data.transaction
            },
            error: null
        };

    } catch (error) {
        return {
            success: false,
            data: null,
            error: {
                message: error instanceof Error ? error.message : 'Erreur inconnue',
                code: 'UNEXPECTED_ERROR',
                details: error as Record<string, unknown>
            }
        };
    }
};
