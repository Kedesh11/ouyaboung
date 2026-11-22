import { MetadataRoute } from 'next';

import { APP_BASE_URL } from "@/lib/config";
export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();

  // Static pages with high priority
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: APP_BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${APP_BASE_URL}/search`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${APP_BASE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${APP_BASE_URL}/concept`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${APP_BASE_URL}/auth`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${APP_BASE_URL}/merchant/register`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${APP_BASE_URL}/legal/cgu`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${APP_BASE_URL}/legal/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${APP_BASE_URL}/legal/help`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  // TODO: Add dynamic product and merchant pages
  // This requires fetching from database when build/regeneration occurs
  // Example:
  // const products = await getPublicProducts();
  // const productPages = products.map((product) => ({
  //   url: `${APP_BASE_URL}/p/${product.slug}`,
  //   lastModified: product.updated_at,
  //   changeFrequency: 'daily' as const,
  //   priority: 0.8,
  // }));

  return [...staticPages];
}
