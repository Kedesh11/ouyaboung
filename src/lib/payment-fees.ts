/**
 * Calcul des frais de paiement Q-Gabon (Airtel Money)
 * 
 * IMPORTANT: Les frais sont entièrement à la charge du client
 * 
 * Structure des frais:
 * - Airtel: 3% du montant transféré
 * - PVIT: 3% du montant transféré
 * - Application: 3% du montant transféré (MODIFIABLE)
 * 
 * Total: 9% du montant de base
 */

/**
 * Structure des frais de paiement
 */
export interface PaymentFees {
    /** Montant de base (panier) en XAF */
    baseAmount: number;

    /** Frais Airtel Money (3%) en XAF */
    airtelFees: number;

    /** Frais PVIT (3%) en XAF */
    pvitFees: number;

    /** Frais Application (3% - modifiable) en XAF */
    appFees: number;

    /** Total des frais (airtel + pvit + app) en XAF */
    totalFees: number;

    /** Montant final à payer (baseAmount + totalFees) en XAF */
    finalAmount: number;
}

/**
 * Taux de frais (constantes)
 * 
 * NOTE: Seul APP_FEE_RATE peut être modifié selon les besoins métier.
 * Les taux Airtel et PVIT sont imposés par l'API Q-Gabon.
 */
const AIRTEL_FEE_RATE = 0.03;  // 3% - FIXE
const PVIT_FEE_RATE = 0.03;    // 3% - FIXE
const APP_FEE_RATE = 0.03;     // 3% - MODIFIABLE

/**
 * Calcule les frais de paiement pour une transaction Q-Gabon
 * 
 * Fonction isolée et pure pour faciliter:
 * - Les tests unitaires
 * - La modification du taux d'application
 * - L'audit et la traçabilité
 * 
 * @param baseAmount - Montant de base du panier en XAF (entier)
 * @returns Structure complète des frais avec décomposition
 * 
 * @example
 * ```typescript
 * const fees = calculatePaymentFees(1000);
 * // {
 * //   baseAmount: 1000,
 * //   airtelFees: 30,
 * //   pvitFees: 30,
 * //   appFees: 30,
 * //   totalFees: 90,
 * //   finalAmount: 1090
 * // }
 * ```
 */
export function calculatePaymentFees(baseAmount: number): PaymentFees {
    // Validation
    if (!Number.isInteger(baseAmount) || baseAmount <= 0) {
        throw new Error('Base amount must be a positive integer (XAF)');
    }

    // Calcul des frais individuels (arrondi à l'entier)
    const airtelFees = Math.round(baseAmount * AIRTEL_FEE_RATE);
    const pvitFees = Math.round(baseAmount * PVIT_FEE_RATE);
    const appFees = Math.round(baseAmount * APP_FEE_RATE);

    // Totaux
    const totalFees = airtelFees + pvitFees + appFees;
    const finalAmount = baseAmount + totalFees;

    return {
        baseAmount,
        airtelFees,
        pvitFees,
        appFees,
        totalFees,
        finalAmount
    };
}

/**
 * Retourne les taux de frais actuels (pour affichage UI)
 * 
 * @returns Objet avec les taux en pourcentage
 */
export function getFeeRates() {
    return {
        airtel: AIRTEL_FEE_RATE * 100,  // 3
        pvit: PVIT_FEE_RATE * 100,      // 3
        app: APP_FEE_RATE * 100,        // 3
        total: (AIRTEL_FEE_RATE + PVIT_FEE_RATE + APP_FEE_RATE) * 100  // 9
    };
}
