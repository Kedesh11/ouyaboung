import type { Metadata } from "next";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ouyaboung-eight.vercel.app";

const slugToTitle = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const productTitle = slugToTitle(slug) || "Produit";
  const canonicalPath = `/p/${slug}`;

  return {
    title: `${productTitle} | Ouyaboung`,
    description: `Découvrez ${productTitle} sur Ouyaboung et réservez en quelques secondes.`,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: `${APP_BASE_URL}${canonicalPath}`,
      title: `${productTitle} | Ouyaboung`,
      description: `Découvrez ${productTitle} sur Ouyaboung et réservez en quelques secondes.`,
    },
  };
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
