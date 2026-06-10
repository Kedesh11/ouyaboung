import { notFound } from "next/navigation";
import { getCachedProductBySlug } from "@/lib/data/public.server";
import ProductDetailClient from "./ProductDetailClient";

export const revalidate = 600;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getCachedProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return <ProductDetailClient product={product} slug={slug} />;
}
