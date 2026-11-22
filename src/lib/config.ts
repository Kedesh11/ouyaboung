/**
 * Configuration applicative lue dans l'environnement.
 *
 * Source unique pour les valeurs qui etaient dupliquees en dur dans le code
 * (URL du site, adresses de contact). Les variables NEXT_PUBLIC_* sont inlinees
 * au build et disponibles cote client.
 */

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/**
 * URL publique du site (SEO, liens absolus, emails).
 * NEXT_PUBLIC_APP_URL est requise en production; sur Vercel, VERCEL_URL sert de
 * repli cote serveur; en local, http://localhost:3000.
 */
export const APP_BASE_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
);

/** Adresse du support (aide, mentions legales, parametres plateforme). */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@ouyaboung.ga';

/** Adresse de contact general (pied de page, page de maintenance, emails). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'oyaboug@gmail.com';
