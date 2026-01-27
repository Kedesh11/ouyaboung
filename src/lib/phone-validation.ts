/**
 * Validation des numéros de téléphone Airtel Gabon
 * 
 * Contraintes API Q-Gabon:
 * - Exactement 9 chiffres
 * - Préfixes autorisés: 074, 076, 077, 77, 74, 76
 */

/**
 * Préfixes valides pour Airtel Gabon
 */
const VALID_AIRTEL_PREFIXES = ['074', '076', '077', '74', '76', '77'] as const;

/**
 * Expression régulière pour numéros à 9 chiffres
 */
const NINE_DIGITS_REGEX = /^\d{9}$/;

/**
 * Valide un numéro de téléphone Airtel Gabon
 * 
 * Règles strictes:
 * 1. Doit contenir exactement 9 chiffres (après nettoyage)
 * 2. Doit commencer par un préfixe Airtel valide
 * 
 * @param phone - Numéro de téléphone (peut contenir des espaces)
 * @returns true si le numéro est valide, false sinon
 * 
 * @example
 * ```typescript
 * validateAirtelPhone('074 12 34 56')  // true
 * validateAirtelPhone('077157904')     // true
 * validateAirtelPhone('77157904')      // true
 * validateAirtelPhone('071234567')     // false (prefix invalide)
 * validateAirtelPhone('0741234')       // false (trop court)
 * ```
 */
export function validateAirtelPhone(phone: string): boolean {
    // Nettoyage: suppression de tous les espaces
    const cleaned = phone.replace(/\s+/g, '');

    // Vérification 1: Exactement 9 chiffres
    if (!NINE_DIGITS_REGEX.test(cleaned)) {
        return false;
    }

    // Vérification 2: Préfixe valide
    return VALID_AIRTEL_PREFIXES.some(prefix => cleaned.startsWith(prefix));
}

/**
 * Formate un numéro de téléphone pour affichage
 * 
 * Format: XXX XX XX XX
 * 
 * @param phone - Numéro de téléphone brut (9 chiffres)
 * @returns Numéro formaté ou chaîne vide si invalide
 * 
 * @example
 * ```typescript
 * formatAirtelPhone('074123456')  // '074 12 34 56'
 * formatAirtelPhone('77157904')   // '77 15 79 04'
 * ```
 */
export function formatAirtelPhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, '');

    if (!NINE_DIGITS_REGEX.test(cleaned)) {
        return '';
    }

    // Format en groupes: 074 12 34 56 ou 77 15 79 04
    if (cleaned.startsWith('0')) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 7)} ${cleaned.slice(7, 9)}`;
    } else {
        return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8, 9)}`;
    }
}

/**
 * Normalise un numéro de téléphone pour l'API Q-Gabon
 * 
 * Supprime tous les espaces et caractères non-numériques
 * 
 * @param phone - Numéro de téléphone
 * @returns Numéro normalisé (9 chiffres) ou null si invalide
 * 
 * @example
 * ```typescript
 * normalizeAirtelPhone('074 12 34 56')  // '074123456'
 * normalizeAirtelPhone('077-15-79-04')  // '077157904'
 * normalizeAirtelPhone('invalid')       // null
 * ```
 */
export function normalizeAirtelPhone(phone: string): string | null {
    const cleaned = phone.replace(/\D/g, '');

    if (validateAirtelPhone(cleaned)) {
        return cleaned;
    }

    return null;
}

/**
 * Retourne un message d'erreur descriptif pour un numéro invalide
 * 
 * @param phone - Numéro de téléphone
 * @returns Message d'erreur ou null si valide
 */
export function getAirtelPhoneError(phone: string): string | null {
    const cleaned = phone.replace(/\s+/g, '');

    if (!cleaned) {
        return 'Le numéro de téléphone est requis';
    }

    if (!/^\d+$/.test(cleaned)) {
        return 'Le numéro ne doit contenir que des chiffres';
    }

    if (cleaned.length !== 9) {
        return `Le numéro doit contenir exactement 9 chiffres (actuellement ${cleaned.length})`;
    }

    if (!VALID_AIRTEL_PREFIXES.some(prefix => cleaned.startsWith(prefix))) {
        return `Le numéro doit commencer par ${VALID_AIRTEL_PREFIXES.join(', ')}`;
    }

    return null;
}
