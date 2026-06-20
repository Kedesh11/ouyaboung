/**
 * Validation des numeros Mobile Money Gabon.
 *
 * Les utilisateurs peuvent saisir le format local court (8 chiffres) ou le
 * format local avec zero (9 chiffres). Le stockage et les appels API utilisent
 * toujours le format normalise a 9 chiffres.
 */

const VALID_AIRTEL_LOCAL_PREFIXES = ['74', '77', '76'] as const;
const VALID_MOOV_LOCAL_PREFIXES = ['66', '62', '65'] as const;

const normalizeGabonDigits = (phone: string): string => {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('241') && cleaned.length === 11) {
        cleaned = `0${cleaned.slice(3)}`;
    }

    if (cleaned.length === 8) {
        cleaned = `0${cleaned}`;
    }

    return cleaned;
};

const hasLocalPrefix = (normalizedPhone: string, prefixes: readonly string[]): boolean => {
    const localNumber = normalizedPhone.startsWith('0')
        ? normalizedPhone.slice(1)
        : normalizedPhone;

    return prefixes.some(prefix => localNumber.startsWith(prefix));
};

const formatAllowedPrefixes = (prefixes: readonly string[]) =>
    prefixes.map(prefix => `${prefix} ou 0${prefix}`).join(', ');

/**
 * Valide un numéro de téléphone Airtel Gabon
 * 
 * @param phone - Numéro de téléphone
 * @returns true si le numéro est valide (8 ou 9 chiffres), false sinon
 */
export function validateAirtelPhone(phone: string): boolean {
    const normalized = normalizeGabonDigits(phone);
    if (!/^0\d{8}$/.test(normalized)) return false;

    return hasLocalPrefix(normalized, VALID_AIRTEL_LOCAL_PREFIXES);
}

/**
 * Valide un numéro de téléphone Moov Gabon
 * 
 * @param phone - Numéro de téléphone
 * @returns true si le numéro est valide (8 ou 9 chiffres), false sinon
 */
export function validateMoovPhone(phone: string): boolean {
    const normalized = normalizeGabonDigits(phone);
    if (!/^0\d{8}$/.test(normalized)) return false;

    return hasLocalPrefix(normalized, VALID_MOOV_LOCAL_PREFIXES);
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
    const normalized = normalizeGabonDigits(phone);
    
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
    const normalized = normalizeGabonDigits(phone);

    if (!/^0\d{8}$/.test(normalized)) return null;

    if (validateAirtelPhone(normalized) || validateMoovPhone(normalized)) {
        return normalized;
    }
    return null;
}

/**
 * Retourne un message d'erreur descriptif pour un numéro Airtel
 */
export function getAirtelPhoneError(phone: string): string | null {
    const cleaned = phone.replace(/\D/g, '');
    const normalized = normalizeGabonDigits(phone);
    if (!cleaned) return 'Le numéro de téléphone est requis';
    if (/[^\d\s()+.-]/.test(phone)) return 'Le numéro ne doit contenir que des chiffres';

    if (!/^0\d{8}$/.test(normalized)) {
        return `Le numéro doit contenir 8 chiffres locaux ou 9 chiffres avec zero initial`;
    }

    if (!hasLocalPrefix(normalized, VALID_AIRTEL_LOCAL_PREFIXES)) {
        return `Le numéro Airtel doit commencer par ${formatAllowedPrefixes(VALID_AIRTEL_LOCAL_PREFIXES)}`;
    }
    return null;
}

/**
 * Retourne un message d'erreur descriptif pour un numéro Moov
 */
export function getMoovPhoneError(phone: string): string | null {
    const cleaned = phone.replace(/\D/g, '');
    const normalized = normalizeGabonDigits(phone);
    if (!cleaned) return 'Le numéro de téléphone est requis';
    if (/[^\d\s()+.-]/.test(phone)) return 'Le numéro ne doit contenir que des chiffres';

    if (!/^0\d{8}$/.test(normalized)) {
        return `Le numéro doit contenir 8 chiffres locaux ou 9 chiffres avec zero initial`;
    }

    if (!hasLocalPrefix(normalized, VALID_MOOV_LOCAL_PREFIXES)) {
        return `Le numéro Libertis/Moov doit commencer par ${formatAllowedPrefixes(VALID_MOOV_LOCAL_PREFIXES)}`;
    }
    return null;
}
