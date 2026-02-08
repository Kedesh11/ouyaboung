"use client";

// ============================================
// Product Detail Page - Sensitive Linked Resource
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
    ShoppingBag,
    Store,
    MapPin,
    Clock,
    AlertCircle,
    ArrowLeft,
    Loader2,
    ShieldCheck,
    CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import * as inventoryService from "@/services/inventory.service";
import { useAuth } from "@/hooks/useAuth";
import type { FoodItem } from "@/types";
import { toast } from "sonner";
import { createReservation } from "@/services";
import { generateProductSchema } from "@/lib/seo/schemas";

// ISR: Revalidate every 10 minutes
export const revalidate = 600;

const ProductDetailPage = () => {
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;
    const { isAuthenticated, user } = useAuth();
    const [product, setProduct] = useState<FoodItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isReserving, setIsReserving] = useState(false);

    useEffect(() => {
        if (slug) {
            loadProductData(slug);
        }
    }, [slug]);

    const loadProductData = async (productSlug: string) => {
        setIsLoading(true);
        try {
            const result = await inventoryService.getItemBySlug(productSlug);
            if (result.success && result.data) {
                setProduct(result.data);
            } else {
                toast.error("Produit non trouvé");
                router.push("/search");
            }
        } catch (error) {
            console.error("Error loading product:", error);
            toast.error("Une erreur est survenue");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReserve = async () => {
        if (!isAuthenticated) {
            toast.error("Veuillez vous connecter pour réserver");
            router.push(`/auth?returnTo=/p/${slug}`);
            return;
        }

        if (!product || product.quantity_available <= 0) return;

        setIsReserving(true);
        try {
            const resp = await createReservation(user?.id || "", product.id, 1);

            if (resp.success) {
                toast.success("Réservation réussie !");
                router.push("/user/reservations");
            } else {
                toast.error(resp.error?.message || "Erreur lors de la réservation");
            }
        } catch (error) {
            console.error("Reservation error:", error);
            toast.error("Une erreur est survenue");
        } finally {
            setIsReserving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!product) return null;

    const savingsPercent = Math.round((1 - product.discounted_price / product.original_price) * 100);
    
    // Generate Product schema for SEO
    const productSchema = product ? generateProductSchema({
        name: product.name,
        description: product.description || "",
        image: [product.image_url || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800"],
        offers: {
            price: product.discounted_price,
            priceCurrency: "XAF",
            availability: product.quantity_available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            seller: { name: product.merchant?.business_name || "Ouyaboung" },
        },
    }) : null;

    return (
        <div className="min-h-screen bg-background pb-20">
            <Navbar />
            
            {productSchema && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
                />
            )}

            <main className="container mx-auto px-4 pt-28">
                <Button
                    variant="ghost"
                    size="sm"
                    className="mb-6 gap-2"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="w-4 h-4" /> Retour
                </Button>

                <div className="grid lg:grid-cols-2 gap-12">
                    {/* Product Image Section */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-4"
                    >
                        <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl border bg-muted">
                            <Image
                                src={product.image_url || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=800&fit=crop"}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 50vw"
                                priority  // LCP optimization - preload hero image
                            />
                            <div className="absolute top-6 left-6 flex flex-wrap gap-2">
                                <Badge className="bg-primary hover:bg-primary shadow-lg text-lg px-4 py-1.5 rounded-full">
                                    -{savingsPercent}%
                                </Badge>
                                {product.quantity_available < 5 && (
                                    <Badge variant="destructive" className="shadow-lg text-lg px-4 py-1.5 rounded-full animate-pulse">
                                        Plus que {product.quantity_available} !
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Product Info Section */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex flex-col h-full"
                    >
                        <div className="flex-1 space-y-8">
                            <div>
                                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                                    <Store className="w-4 h-4" />
                                    <Link href={`/m/${product.merchant?.slug}`} className="hover:text-primary transition-colors underline-offset-4 hover:underline">
                                        {product.merchant?.business_name}
                                    </Link>
                                    <Separator orientation="vertical" className="h-4 mx-2" />
                                    <Badge variant="secondary">
                                        {inventoryService.getCategoryName(product.category)}
                                    </Badge>
                                </div>
                                <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-4">
                                    {product.name}
                                </h1>
                                <p className="text-xl text-muted-foreground leading-relaxed">
                                    {product.description || "Pas de description pour ce produit."}
                                </p>
                            </div>

                            <div className="bg-muted/30 rounded-2xl p-6 border space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground font-medium">Prix d'origine</span>
                                    <span className="text-lg text-muted-foreground line-through decoration-destructive/30">
                                        {product.original_price.toLocaleString()} XAF
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-bold text-foreground">Prix Anti-Gaspillage</span>
                                    <span className="text-3xl font-black text-primary">
                                        {product.discounted_price.toLocaleString()} XAF
                                    </span>
                                </div>
                                <div className="pt-4 flex items-center gap-2 text-green-600 font-bold justify-center bg-green-50/50 py-2 rounded-xl border border-green-100">
                                    <CheckCircle2 className="w-5 h-5" />
                                    Vous économisez {(product.original_price - product.discounted_price).toLocaleString()} XAF !
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-card border rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <MapPin className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Lieu</p>
                                        <p className="font-semibold">{product.merchant?.quartier}</p>
                                    </div>
                                </div>
                                <div className="bg-card border rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                                        <Clock className="w-6 h-6 text-orange-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Retrait</p>
                                        <p className="font-semibold">{product.pickup_start} - {product.pickup_end}</p>
                                    </div>
                                </div>
                            </div>

                            <Card className="border-primary/20 bg-primary/5">
                                <CardContent className="p-6">
                                    <div className="flex gap-4">
                                        <ShieldCheck className="w-8 h-8 text-primary shrink-0" />
                                        <div>
                                            <h3 className="font-bold text-foreground mb-1">Garantie Anti-Gaspillage</h3>
                                            <p className="text-sm text-muted-foreground">
                                                En réservant ce produit, vous luttez activement contre le gaspillage alimentaire au Gabon tout en faisant des économies.
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="mt-12 sticky bottom-4">
                            <Button
                                size="lg"
                                className="w-full h-16 text-xl font-bold shadow-xl shadow-primary/20 rounded-2xl"
                                disabled={product.quantity_available <= 0 || isReserving}
                                onClick={handleReserve}
                            >
                                {isReserving ? (
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                ) : (
                                    <ShoppingBag className="w-6 h-6 mr-2" />
                                )}
                                {product.quantity_available > 0 ? `Réserver maintenant` : "Épuisé"}
                            </Button>
                            <p className="text-center text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" /> Paiement sécurisé lors du retrait chez le commerçant
                            </p>
                        </div>
                    </motion.div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default ProductDetailPage;
