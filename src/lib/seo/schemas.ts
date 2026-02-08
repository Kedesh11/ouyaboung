// Schema.org structured data helpers for SEO

interface Organization {
  name: string;
  description: string;
  url: string;
  logo: string;
  sameAs?: string[];
  address?: {
    addressCountry: string;
    addressLocality?: string;
  };
}

interface LocalBusiness extends Organization {
  priceRange?: string;
  telephone?: string;
  openingHours?: string[];
  geo?: {
    latitude: number;
    longitude: number;
  };
}

interface Product {
  name: string;
  description: string;
  image: string[];
  sku?: string;
  brand?: { name: string };
  offers: {
    price: number;
    priceCurrency: string;
    availability: string;
    seller?: { name: string };
  };
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
}

export function generateOrganizationSchema(data: Organization) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: data.name,
    description: data.description,
    url: data.url,
    logo: data.logo,
    sameAs: data.sameAs || [],
    address: data.address
      ? {
          '@type': 'PostalAddress',
          addressCountry: data.address.addressCountry,
          addressLocality: data.address.addressLocality,
        }
      : undefined,
  };
}

export function generateLocalBusinessSchema(data: LocalBusiness) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: data.name,
    description: data.description,
    url: data.url,
    image: data.logo,
    priceRange: data.priceRange,
    telephone: data.telephone,
    address: data.address
      ? {
          '@type': 'PostalAddress',
          addressCountry: data.address.addressCountry,
          addressLocality: data.address.addressLocality,
        }
      : undefined,
    geo: data.geo
      ? {
          '@type': 'GeoCoordinates',
          latitude: data.geo.latitude,
          longitude: data.geo.longitude,
        }
      : undefined,
    openingHoursSpecification: data.openingHours?.map((hours) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: hours,
    })),
  };
}

export function generateProductSchema(data: Product) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
    description: data.description,
    image: data.image,
    sku: data.sku,
    brand: data.brand
      ? {
          '@type': 'Brand',
          name: data.brand.name,
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: data.offers.price,
      priceCurrency: data.offers.priceCurrency,
      availability: data.offers.availability, // e.g., 'https://schema.org/InStock'
      seller: data.offers.seller
        ? {
            '@type': 'Organization',
            name: data.offers.seller.name,
          }
        : undefined,
    },
    aggregateRating: data.aggregateRating
      ? {
          '@type': 'AggregateRating',
          ratingValue: data.aggregateRating.ratingValue,
          reviewCount: data.aggregateRating.reviewCount,
        }
      : undefined,
  };
}

export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function generateWebSiteSchema(url: string, searchUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${searchUrl}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

// Default organization schema for Ouyaboung
export const ouyaboungOrganizationSchema = generateOrganizationSchema({
  name: 'Ouyaboung',
  description: 'Plateforme anti-gaspillage alimentaire au Gabon',
  url: 'https://ouyaboung-eight.vercel.app',
  logo: 'https://ouyaboung-eight.vercel.app/icons/icon-512x512.png',
  sameAs: [
    // Add social media links when available
    // 'https://www.facebook.com/ouyaboung',
    // 'https://twitter.com/ouyaboung',
    // 'https://www.instagram.com/ouyaboung',
  ],
  address: {
    addressCountry: 'GA',
    addressLocality: 'Libreville',
  },
});

export const ouyaboungWebSiteSchema = generateWebSiteSchema(
  'https://ouyaboung-eight.vercel.app',
  'https://ouyaboung-eight.vercel.app/search'
);
