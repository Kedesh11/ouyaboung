import { notFound } from "next/navigation";
import {
  fetchFarmerProducts,
  getCachedFarmerBySlug,
} from "@/lib/data/public.server";
import FarmerPublicClient from "./FarmerPublicClient";

export const revalidate = 600;

interface FarmerPageProps {
  params: Promise<{ slug: string }>;
}

export default async function FarmerPage({ params }: FarmerPageProps) {
  const { slug } = await params;
  const farmer = await getCachedFarmerBySlug(slug);

  if (!farmer) {
    notFound();
  }

  const products = await fetchFarmerProducts(farmer.id);

  return <FarmerPublicClient farmer={farmer} products={products} />;
}
