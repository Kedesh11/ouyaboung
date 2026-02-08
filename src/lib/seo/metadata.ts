import { Metadata } from 'next';

interface PageMetadataParams {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  type?: 'website' | 'article';
}

const siteConfig = {
  name: 'Ouyaboung',
  domain: 'https://ouyaboung-eight.vercel.app', // Update with actual domain
  description: 'Plateforme anti-gaspillage alimentaire au Gabon - Récupérez des invendus de qualité à prix réduit',
  locale: 'fr_GA',
  twitterHandle: '@ouyaboung', // Update if exists
};

export function generatePageMetadata({
  title,
  description,
  path,
  keywords = [],
  image,
  type = 'website',
}: PageMetadataParams): Metadata {
  const fullTitle = title.includes(siteConfig.name) ? title : `${title} | ${siteConfig.name}`;
  const url = `${siteConfig.domain}${path}`;
  const ogImage = image || `${siteConfig.domain}/icons/icon-512x512.png`;

  const defaultKeywords = [
    'anti-gaspillage',
    'alimentaire',
    'gabon',
    'invendus',
    'économies',
    'libreville',
    'réduction gaspillage',
    'produits qualité',
  ];

  return {
    title: fullTitle,
    description,
    keywords: [...defaultKeywords, ...keywords].join(', '),
    
    openGraph: {
      type,
      locale: siteConfig.locale,
      url,
      siteName: siteConfig.name,
      title: fullTitle,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },

    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
      creator: siteConfig.twitterHandle,
    },

    alternates: {
      canonical: url,
    },

    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

// Preset metadata for common pages
export const homepageMetadata = generatePageMetadata({
  title: 'Ouyaboung - Anti-gaspillage alimentaire au Gabon',
  description:
    'Récupérez des invendus de qualité à prix réduit près de chez vous. Ensemble, luttons contre le gaspillage alimentaire au Gabon. +1800 commerces partenaires.',
  path: '/',
  keywords: ['food waste', 'surplus alimentaire', 'libreville', 'port-gentil', 'franceville'],
});

export const searchMetadata = generatePageMetadata({
  title: 'Rechercher des produits disponibles',
  description:
    'Découvrez les invendus disponibles près de chez vous : pâtisseries, plats préparés, fruits et légumes, produits frais à prix réduits.',
  path: '/search',
  keywords: ['recherche produits', 'invendus disponibles', 'près de moi', 'réduction'],
});

export const aboutMetadata = generatePageMetadata({
  title: 'À propos - Notre mission',
  description:
    "Découvrez comment Ouyaboung lutte contre le gaspillage alimentaire au Gabon en connectant commerçants et consommateurs pour sauver la nourriture tout en économisant de l'argent.",
  path: '/about',
  keywords: ['mission', 'impact environnemental', 'durabilité', 'économie circulaire'],
});

export const conceptMetadata = generatePageMetadata({
  title: 'Comment ça marche - Le concept',
  description:
    'Comprenez le fonctionnement de notre plateforme : comment les commerçants proposent leurs invendus et comment vous pouvez les récupérer à prix réduit.',
  path: '/concept',
  keywords: ['fonctionnement', 'guide', 'tutoriel', 'mode emploi'],
});

export const merchantDashboardMetadata = generatePageMetadata({
  title: 'Dashboard Commerçant',
  description:
    'Gérez vos produits, suivez vos ventes et votre impact environnemental. Tableau de bord complet pour les partenaires commerçants.',
  path: '/merchant',
  keywords: ['gestion produits', 'dashboard commerçant', 'statistiques ventes'],
});

export const userDashboardMetadata = generatePageMetadata({
  title: 'Mon compte',
  description:
    'Gérez vos réservations, consultez vos économies et votre impact environnemental. Votre espace personnel Ouyaboung.',
  path: '/user',
  keywords: ['compte utilisateur', 'réservations', 'économies', 'impact'],
});
