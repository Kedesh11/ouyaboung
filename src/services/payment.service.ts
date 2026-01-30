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
import { validateAirtelPhone, normalizeAirtelPhone, getAirtelPhoneError } from '@/lib/phone-validation';
import type { QGabonPaymentResponse } from '@/types/qgabon';

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

        const normalizedPhone = normalizeAirtelPhone(request.phone);
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

        console.log('[Payment Service] Calling Edge Function...');

        const { data, error } = await supabaseClient.functions.invoke('initiate-payment', {
            body: payload,
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        console.log('[Payment Service] Edge Function response:', {
            hasData: !!data,
            hasError: !!error,
            success: data?.success
        });

        if (error) {
            console.error('[Payment Service] Edge Function Error:', error);
            return {
                success: false,
                data: null,
                error: {
                    message: error.message || 'Erreur lors de l\'initiation du paiement',
                    code: 'EDGE_FUNCTION_ERROR',
                    details: error
                }
            };
        }

        if (!data || !data.success) {
            console.error('[Payment Service] Payment failed:', data);
            return {
                success: false,
                data: null,
                error: {
                    message: data?.error?.message || 'Échec du paiement',
                    code: data?.error?.code || 'PAYMENT_FAILED',
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
                message: data.data.message || 'Paiement initié avec succès'
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
