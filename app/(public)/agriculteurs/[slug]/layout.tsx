import type { Metadata } from "next";
import { getCachedFarmerBySlug } from "@/lib/data/public.server";


import { APP_BASE_URL } from "@/lib/config";
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const farmer = await getCachedFarmerBySlug(slug);
  const farmerTitle = farmer?.farm_name || "Agriculteur";
  const description =
    farmer?.description ||
    `Découvrez les produits de ${farmerTitle} sur Ouyaboung.`;
  const canonicalPath = `/agriculteurs/${slug}`;

  return {
    title: `${farmerTitle} | Ouyaboung`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: `${APP_BASE_URL}${canonicalPath}`,
      title: `${farmerTitle} | Ouyaboung`,
      description,
      images: farmer?.logo_url ? [{ url: farmer.logo_url }] : undefined,
    },
  };
}

export default function FarmerDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
