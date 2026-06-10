import type { Metadata } from "next";
import { getCachedMerchantBySlug } from "@/lib/data/public.server";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ouyaboung-eight.vercel.app";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const merchant = await getCachedMerchantBySlug(slug);
  const merchantTitle = merchant?.business_name || "Commerce";
  const description =
    merchant?.description ||
    `Consultez la vitrine de ${merchantTitle} sur Ouyaboung.`;
  const canonicalPath = `/m/${slug}`;

  return {
    title: `${merchantTitle} | Ouyaboung`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: `${APP_BASE_URL}${canonicalPath}`,
      title: `${merchantTitle} | Ouyaboung`,
      description,
      images: merchant?.logo_url ? [{ url: merchant.logo_url }] : undefined,
    },
  };
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
