"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, Phone, Mail, Sprout, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import FarmProductCard from "@/components/FarmProductCard";
import { getFarmerTypeName } from "@/services/farmer.service";
import type { Farmer, FarmProduct } from "@/types";

interface FarmerPublicClientProps {
  farmer: Farmer;
  products: FarmProduct[];
}

export default function FarmerPublicClient({ farmer, products }: FarmerPublicClientProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <div className="relative h-56 md:h-64 w-full overflow-hidden pt-16">
        <Image
          src={
            farmer.cover_image_url ||
            "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1200&h=400&fit=crop"
          }
          alt={`Couverture ${farmer.farm_name}`}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute bottom-6 left-6 right-6 container mx-auto px-4">
          <Button
            variant="secondary"
            size="sm"
            className="mb-4 gap-2 bg-white/90"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </div>
      </div>

      <main className="container mx-auto px-4 -mt-10 relative z-10 pb-20">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted border-2 border-white shadow-lg">
                    {farmer.logo_url ? (
                      <Image src={farmer.logo_url} alt={farmer.farm_name} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sprout className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">{farmer.farm_name}</h1>
                    <Badge variant="outline" className="mt-1">
                      {getFarmerTypeName(farmer.farmer_type)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="w-5 h-5 text-primary" />
                    <span className="text-sm">
                      {farmer.address}, {farmer.quartier}, {farmer.city}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Phone className="w-5 h-5 text-primary" />
                    <span className="text-sm">{farmer.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Mail className="w-5 h-5 text-primary" />
                    <span className="text-sm">{farmer.email}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">À propos</h3>
                <p className="text-sm text-muted-foreground">
                  {farmer.description || "Aucune description disponible pour cette exploitation."}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Sprout className="w-6 h-6 text-primary" /> Produits disponibles
              </h2>
              <span className="text-muted-foreground">{products.length} produit(s)</span>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {products.map((product) => (
                <FarmProductCard key={product.id} product={product} />
              ))}
              {products.length === 0 && (
                <div className="col-span-full py-20 text-center bg-muted/30 rounded-xl border-2 border-dashed">
                  <Sprout className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">
                    Aucun produit disponible pour le moment.
                  </p>
                  <p className="text-sm text-muted-foreground">Revenez plus tard !</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
