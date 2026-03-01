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
  const merchantTitle = slugToTitle(slug) || "Commerce";
  const canonicalPath = `/m/${slug}`;

  return {
    title: `${merchantTitle} | Ouyaboung`,
    description: `Consultez la vitrine de ${merchantTitle} sur Ouyaboung.`,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: `${APP_BASE_URL}${canonicalPath}`,
      title: `${merchantTitle} | Ouyaboung`,
      description: `Consultez la vitrine de ${merchantTitle} sur Ouyaboung.`,
    },
  };
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
