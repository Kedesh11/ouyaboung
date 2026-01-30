/**
 * Validation des numéros de téléphone Airtel Gabon
 * 
 * Contraintes API Q-Gabon:
 * - Exactement 9 chiffres après normalisation
 * - Préfixes autorisés: 074, 076, 077, 77, 74, 76
 */

/**
 * Préfixes valides pour Airtel Gabon (avec et sans 0)
 */
const VALID_AIRTEL_PREFIXES = ['074', '076', '077', '74', '76', '77'] as const;

/**
 * Préfixes valides pour Moov Gabon (avec et sans 0)
 */
const VALID_MOOV_PREFIXES = ['066', '062', '065', '66', '62', '65'] as const;

/**
 * Expression régulière pour numéros à 8 ou 9 chiffres
 */
const PHONE_REGEX = /^(0|[67])\d{7,8}$/;

/**
 * Valide un numéro de téléphone Airtel Gabon
 * 
 * @param phone - Numéro de téléphone
 * @returns true si le numéro est valide (8 ou 9 chiffres), false sinon
 */
export function validateAirtelPhone(phone: string): boolean {
    const cleaned = phone.replace(/\s+/g, '');
    // Vérifier longueur (8 ou 9) et caractères numériques
    if (!/^\d{8,9}$/.test(cleaned)) return false;
    
    // Si 9 chiffres, doit commencer par 0
    if (cleaned.length === 9 && !cleaned.startsWith('0')) return false;

    return VALID_AIRTEL_PREFIXES.some(prefix => cleaned.startsWith(prefix));
}

/**
 * Valide un numéro de téléphone Moov Gabon
 * 
 * @param phone - Numéro de téléphone
 * @returns true si le numéro est valide (8 ou 9 chiffres), false sinon
 */
export function validateMoovPhone(phone: string): boolean {
    const cleaned = phone.replace(/\s+/g, '');
    // Vérifier longueur (8 ou 9) et caractères numériques
    if (!/^\d{8,9}$/.test(cleaned)) return false;

    // Si 9 chiffres, doit commencer par 0
    if (cleaned.length === 9 && !cleaned.startsWith('0')) return false;

    return VALID_MOOV_PREFIXES.some(prefix => cleaned.startsWith(prefix));
}

/**
 * Détecte l'opérateur basé sur le numéro
 * 
 * @param phone - Numéro de téléphone
 * @returns 'AIRTEL' | 'MOOV' | null
 */
export function detectOperator(phone: string): 'AIRTEL' | 'MOOV' | null {
    if (validateAirtelPhone(phone)) return 'AIRTEL';
    if (validateMoovPhone(phone)) return 'MOOV';
    return null;
}

/**
 * Formate un numéro de téléphone pour affichage
 * 
 * @param phone - Numéro de téléphone brut
 * @returns Numéro formaté
 */
export function formatPhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, '');
    const normalized = cleaned.length === 8 ? '0' + cleaned : cleaned;
    
    if (!/^\d{9}$/.test(normalized)) return phone;

    return `${normalized.slice(0, 3)} ${normalized.slice(3, 5)} ${normalized.slice(5, 7)} ${normalized.slice(7, 9)}`;
}

/**
 * Normalise un numéro de téléphone (ajoute le 0 si nécessaire)
 * 
 * @param phone - Numéro de téléphone
 * @returns Numéro normalisé (9 chiffres) ou null si invalide
 */
export function normalizePhone(phone: string): string | null {
    let cleaned = phone.replace(/\D/g, '');
    
    // Support des numéros à 8 chiffres (ajout du 0)
    if (cleaned.length === 8) {
        cleaned = '0' + cleaned;
    }

    // Doit faire 9 chiffres maintenant
    if (!/^\d{9}$/.test(cleaned)) return null;

    // Doit être un numéro valide (Airtel ou Moov)
    // Note: on utilise les fonctions de validation qui acceptent maintenant le format 9 chiffres
    if (validateAirtelPhone(cleaned) || validateMoovPhone(cleaned)) {
        return cleaned;
    }
    return null;
}

/**
 * Retourne un message d'erreur descriptif pour un numéro Airtel
 */
export function getAirtelPhoneError(phone: string): string | null {
    const cleaned = phone.replace(/\s+/g, '');
    if (!cleaned) return 'Le numéro de téléphone est requis';
    if (!/^\d+$/.test(cleaned)) return 'Le numéro ne doit contenir que des chiffres';
    
    if (cleaned.length !== 8 && cleaned.length !== 9) {
        return `Le numéro doit contenir 8 ou 9 chiffres (actuellement ${cleaned.length})`;
    }
    
    if (!VALID_AIRTEL_PREFIXES.some(prefix => cleaned.startsWith(prefix))) {
        return `Le numéro doit commencer par ${VALID_AIRTEL_PREFIXES.join(', ')}`;
    }
    return null;
}

/**
 * Retourne un message d'erreur descriptif pour un numéro Moov
 */
export function getMoovPhoneError(phone: string): string | null {
    const cleaned = phone.replace(/\s+/g, '');
    if (!cleaned) return 'Le numéro de téléphone est requis';
    if (!/^\d+$/.test(cleaned)) return 'Le numéro ne doit contenir que des chiffres';
    
    if (cleaned.length !== 8 && cleaned.length !== 9) {
        return `Le numéro doit contenir 8 ou 9 chiffres (actuellement ${cleaned.length})`;
    }
    
    if (!VALID_MOOV_PREFIXES.some(prefix => cleaned.startsWith(prefix))) {
        return `Le numéro doit commencer par ${VALID_MOOV_PREFIXES.join(', ')}`;
    }
    return null;
}
