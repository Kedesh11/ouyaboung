"use client";

// ============================================
// Merchant - Farmer Detail & Order Placement (B2B)
// ouyaboung Platform - Marché B2B commerçant <-> agriculteur
// ============================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Phone, Mail, Sprout, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import PlaceFarmOrderModal from "@/components/merchant/PlaceFarmOrderModal";
import { getFarmerBySlugName, getFarmerTypeName } from "@/services/farmer.service";
import { getFarmerItems, formatPricePerUnit, getFarmProductCategoryName } from "@/services";
import type { Farmer, FarmProduct } from "@/types";

export default function MerchantFarmerDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [products, setProducts] = useState<FarmProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<FarmProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (params.slug) loadFarmer();
  }, [params.slug]);

  const loadFarmer = async () => {
    setIsLoading(true);
    try {
      const farmerResult = await getFarmerBySlugName(params.slug);
      if (!farmerResult.success || !farmerResult.data) {
        toast.error("Exploitation introuvable");
        router.push("/merchant/farmers");
        return;
      }
      setFarmer(farmerResult.data);

      const productsResult = await getFarmerItems(farmerResult.data.id);
      if (productsResult.success && productsResult.data) {
        setProducts(productsResult.data);
      }
    } catch (error) {
      console.error("Failed to load farmer detail", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  const openOrderModal = (product: FarmProduct) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!farmer) return null;

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => router.push("/merchant/farmers")}>
        <ArrowLeft className="w-4 h-4" /> Retour au répertoire
      </Button>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0 border border-border">
                  {farmer.logo_url ? (
                    <Image src={farmer.logo_url} alt={farmer.farm_name} fill className="object-cover" sizes="64px" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Sprout className="w-7 h-7 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{farmer.farm_name}</h1>
                  <Badge variant="outline" className="mt-1">
                    {getFarmerTypeName(farmer.farmer_type)}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{farmer.address}, {farmer.quartier}, {farmer.city}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{farmer.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>{farmer.email}</span>
                </div>
              </div>

              {farmer.description && (
                <p className="text-sm text-muted-foreground mt-4 pt-4 border-t">{farmer.description}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sprout className="w-5 h-5 text-primary" /> Catalogue
            </h2>
            <span className="text-sm text-muted-foreground">{products.length} produit(s)</span>
          </div>

          {products.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {products.map((product) => (
                <Card key={product.id} className="overflow-hidden">
                  <div className="relative h-32 bg-muted">
                    <Image
                      src={
                        product.image_url ||
                        "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=400&h=200&fit=crop"
                      }
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <div>
                      <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{getFarmProductCategoryName(product.category)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-primary">
                        {formatPricePerUnit(product.price_per_unit, product.unit)}
                      </span>
                      <Badge variant="outline">{product.quantity_available} {product.unit}</Badge>
                    </div>
                    <Button className="w-full gap-2" size="sm" onClick={() => openOrderModal(product)}>
                      <ShoppingCart className="w-4 h-4" />
                      Commander
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                <Sprout className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Aucun produit disponible pour le moment.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <PlaceFarmOrderModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        product={selectedProduct}
        onOrderPlaced={() => router.push("/merchant/farm-orders")}
      />
    </div>
  );
}
