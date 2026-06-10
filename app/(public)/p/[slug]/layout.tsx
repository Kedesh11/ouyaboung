import type { Metadata } from "next";
import { getCachedProductBySlug } from "@/lib/data/public.server";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ouyaboung-eight.vercel.app";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCachedProductBySlug(slug);
  const productTitle = product?.name || "Produit";
  const description =
    product?.description ||
    `Découvrez ${productTitle} sur Ouyaboung et réservez en quelques secondes.`;
  const canonicalPath = `/p/${slug}`;

  return {
    title: `${productTitle} | Ouyaboung`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: `${APP_BASE_URL}${canonicalPath}`,
      title: `${productTitle} | Ouyaboung`,
      description,
      images: product?.image_url ? [{ url: product.image_url }] : undefined,
    },
  };
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
