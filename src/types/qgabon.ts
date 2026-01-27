/**
 * Types pour l'intégration API Q-Gabon (Airtel Money)
 * 
 * Documentation API: https://payment.q-gabon.com
 * Structure basée sur les réponses réelles de l'API
 */

// ============================================
// REQUEST TYPES
// ============================================

/**
 * Payload pour initier un paiement Q-Gabon
 */
export interface QGabonPaymentRequest {
    phone: string;          // Numéro Airtel (9 chiffres)
    accountCode: string;    // Code compte
    product: string;        // "paiement"
    amount: number;         // Montant TOTAL (panier + frais)
    agent: string;          // Agent
}

// ============================================
// RESPONSE TYPES
// ============================================

/**
 * Réponse complète de l'API Q-Gabon après initiation de paiement
 * Structure basée sur l'image 2 de la documentation
 */
export interface QGabonPaymentResponse {
    success: boolean;
    data: {
        transactionId: string;                  // "PAY2601267032 79"
        merchantReferenceId: string;            // "ABM1769451468654"
        merchant_reference_id: string;          // Duplication (API response)
        customerID: string;                     // "077172820"
        accountOperationCode: string;           // "ACC_697776491E40C"
        amount: number;                         // 150 (montant base)
        amountCredited: number;                 // 150
        chargeOwner: string;                    // "CUSTOMER"
        code: number;                           // 200
        fees: number;                           // 3.75
        operator: string;                       // "AIRTEL_MONEY"
        operatorFees: number;                   // 1.5375
        operatorOwnerCharge: string;            // "CUSTOMER"
        status: string;                         // "SUCCESS" | "PENDING" | "FAILED"
        status_code: string;                    // "200"
        totalAmount: number;                    // 153.75
        transactionOperation: string;           // "PAYMENT"
        message?: string;                       // Message optionnel
    };
    reference: string;                        // ID unique de référence
}

/**
 * Payload de callback reçu du webhook Q-Gabon
 * Structure basée sur l'image 1 de la documentation
 */
export interface QGabonCallbackPayload {
    success: boolean;
    data: {
        status: string;                             // "PENDING" | "SUCCESS" | "FAILED"
        status_code: string;                        // "200"
        operator: string;                           // "AIRTEL_MONEY"
        reference_id: string;                       // ID transaction Q-Gabon
        merchant_reference_id: string;              // "NcV1769443469539"
        merchant_operation_account_code: string;    // "ACC_6907F2391DB4"
        message: string;                            // Message descriptif
    };
    reference: string;                            // "NcV1769443469539"
}

/**
 * Erreur de l'API Q-Gabon
 */
export interface QGabonError {
    success: false;
    error: {
        code: string;
        message: string;
        details?: any;
    };
}

// ============================================
// TRANSACTION STATUS
// ============================================

/**
 * Statuts possibles d'une transaction Q-Gabon
 */
export type QGabonTransactionStatus =
    | 'PENDING'      // En attente de confirmation
    | 'SUCCESS'      // Paiement réussi
    | 'FAILED'       // Paiement échoué
    | 'CANCELLED'    // Annulé par l'utilisateur
    | 'TIMEOUT';     // Timeout (pas de réponse USSD)

/**
 * Opérateurs supportés
 */
export type QGabonOperator = 'AIRTEL_MONEY';

/**
 * Charge owner (qui paie les frais)
 */
export type QGabonChargeOwner = 'CUSTOMER' | 'MERCHANT';

// ============================================
// INTERNAL TYPES
// ============================================

/**
 * Transaction interne avec toutes les informations
 */
export interface Transaction {
    id: string;
    orderId: string;
    merchantId: string;
    userId: string;

    // Paiement
    phone: string;
    amount: number;
    airtelFees: number;
    pvitFees: number;
    appFees: number;
    totalAmount: number;

    // Q-Gabon
    transactionId?: string;
    merchantReferenceId?: string;
    reference?: string;
    operator?: QGabonOperator;
    operatorFees?: number;

    // Status
    status: QGabonTransactionStatus;
    statusCode?: string;
    message?: string;

    // Tracking
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}
