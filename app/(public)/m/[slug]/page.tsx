import { notFound } from "next/navigation";
import {
  fetchMerchantItems,
  getCachedMerchantBySlug,
} from "@/lib/data/public.server";
import MerchantPublicClient from "./MerchantPublicClient";

export const revalidate = 600;

interface MerchantPageProps {
  params: Promise<{ slug: string }>;
}

export default async function MerchantPage({ params }: MerchantPageProps) {
  const { slug } = await params;
  const merchant = await getCachedMerchantBySlug(slug);

  if (!merchant) {
    notFound();
  }

  const items = await fetchMerchantItems(merchant.id);

  return <MerchantPublicClient merchant={merchant} items={items} />;
}
