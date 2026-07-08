"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { MapPin, Phone, Mail, Clock, Star, Store, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import FoodCard from "@/components/FoodCard";
import * as merchantService from "@/services/merchant.service";
import type { Merchant, FoodItem } from "@/types";
import { generateLocalBusinessSchema } from "@/lib/seo/schemas";

interface MerchantPublicClientProps {
  merchant: Merchant;
  items: FoodItem[];
}

export default function MerchantPublicClient({ merchant, items }: MerchantPublicClientProps) {
  const router = useRouter();

  const businessSchema = generateLocalBusinessSchema({
    name: merchant.business_name,
    description: merchant.description || "",
    url: `https://ouyaboung-eight.vercel.app/m/${merchant.slug}`,
    logo: merchant.logo_url || "",
    telephone: merchant.phone,
    priceRange: "XAF 1000-20000",
    address: {
      addressCountry: "GA",
      addressLocality: merchant.city,
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
      />

      <div className="relative h-64 md:h-80 w-full overflow-hidden pt-16">
        <Image
          src={
            merchant.cover_image_url ||
            "https://images.unsplash.com/photo-1517248135467-4c7ed9d42339?w=1200&h=400&fit=crop"
          }
          alt={`Couverture ${merchant.business_name}`}
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

      <main className="container mx-auto px-4 -mt-12 relative z-10 pb-20">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted border-2 border-white shadow-lg">
                    <Image
                      src={
                        merchant.logo_url ||
                        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop"
                      }
                      alt={merchant.business_name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">{merchant.business_name}</h1>
                    <Badge variant="outline" className="mt-1">
                      {merchantService.getMerchantTypeName(merchant.business_type)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <MapPin className="w-5 h-5 text-primary" />
                    <span className="text-sm">
                      {merchant.address}, {merchant.quartier}, {merchant.city}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Phone className="w-5 h-5 text-primary" />
                    <span className="text-sm">{merchant.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Mail className="w-5 h-5 text-primary" />
                    <span className="text-sm">{merchant.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-semibold text-foreground">
                      {merchant.rating.toFixed(1)} ({merchant.total_reviews} avis)
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Horaires d&apos;ouverture
                  </h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {merchant.opening_hours ? (
                      Object.entries(merchant.opening_hours).map(([day, hours]) => (
                        <div key={day} className="flex justify-between">
                          <span className="capitalize">{day}</span>
                          <span>
                            {hours.is_closed ? "Fermé" : `${hours.open} - ${hours.close}`}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p>Horaires non renseignés</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">À propos</h3>
                <p className="text-sm text-muted-foreground">
                  {merchant.description || "Aucune description disponible pour ce commerce."}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Store className="w-6 h-6 text-primary" /> Offres disponibles
              </h2>
              <span className="text-muted-foreground">{items.length} produit(s)</span>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                  className="cursor-pointer"
                  onClick={() => router.push(`/p/${item.slug}`)}
                >
                  <FoodCard
                    item={{
                      id: item.id,
                      name: item.name,
                      description: item.description || "",
                      originalPrice: item.original_price,
                      discountedPrice: item.discounted_price,
                      image: item.image_url || "",
                      slug: item.slug,
                      merchant: {
                        name: merchant.business_name,
                        type: merchant.business_type,
                        distance: merchant.quartier,
                        slug: merchant.slug,
                      },
                      pickupTime: `${item.pickup_start} - ${item.pickup_end}`,
                      quantity: item.quantity_available,
                      badges: (item.badges || []) as ("bio" | "free" | "lastItems")[],
                    }}
                  />
                </motion.div>
              ))}
              {items.length === 0 && (
                <div className="col-span-full py-20 text-center bg-muted/30 rounded-xl border-2 border-dashed">
                  <Store className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">
                    Aucune offre disponible pour le moment.
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
