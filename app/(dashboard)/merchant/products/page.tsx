"use client";

// ============================================
// Merchant Products Page - Manage Products
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import AddProductModal from "@/components/merchant/AddProductModal";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  Package,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getMerchantItems, formatPrice, isExpiringSoon, getCategoryName, getMyMerchantProfile, updateListing, deleteListing } from "@/services";
import type { FoodItem } from "@/types";
import { toast } from "sonner";

const MerchantProductsContent = () => {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<FoodItem[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<FoodItem | null>(null);

  useEffect(() => {
    // Check if we should open the add modal from query params
    if (action === "add") {
      setEditingProduct(null);
      setIsAddModalOpen(true);
    }
  }, [action]);

  useEffect(() => {
    if (user) {
      loadMerchantProfile();
    } else {
      // If no user, we can't load profile. 
      // In a real app, this should probably redirect or the route should be protected.
      setIsProfileLoading(false);
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (merchantId) {
      loadProducts();
    }
  }, [merchantId]);

  const loadMerchantProfile = async () => {
    if (!user) return;
    try {
      const result = await getMyMerchantProfile(user.id);
      if (result.success && result.data) {
        setMerchantId(result.data.id);
      } else {
        toast.error("Impossible de charger le profil commerçant");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du chargement du profil");
    } finally {
      setIsProfileLoading(false);
    }
  };

  const loadProducts = async () => {
    if (!merchantId) return;
    setIsLoading(true);
    const result = await getMerchantItems(merchantId, true);
    if (result.success && result.data) {
      setProducts(result.data);
    }
    setIsLoading(false);
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "active" && product.is_available) ||
      (activeTab === "inactive" && !product.is_available) ||
      (activeTab === "expiring" &&
        product.expiry_date &&
        isExpiringSoon(product.expiry_date));
    return matchesSearch && matchesTab;
  });

  const handleToggleVisibility = async (product: FoodItem) => {
    try {
      const result = await updateListing(product.id, {
        isAvailable: !product.is_available
      });
      
      if (result.success) {
        toast.success(
          product.is_available ? "Produit masqué" : "Produit affiché"
        );
        loadProducts();
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error(error);
      toast.error("Une erreur est survenue");
    }
  };

  const handleDelete = async (product: FoodItem) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer "${product.name}" ?`)) {
      try {
        const result = await deleteListing(product.id);
        if (result.success) {
          toast.success(`Produit "${product.name}" supprimé`);
          loadProducts();
        } else {
          toast.error("Erreur lors de la suppression");
        }
      } catch (error) {
        console.error(error);
        toast.error("Une erreur est survenue");
      }
    }
  };

  const ProductCard = ({ product }: { product: FoodItem }) => {
    const discount = Math.round(
      ((product.original_price - product.discounted_price) /
        product.original_price) *
      100
    );

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="overflow-hidden">
          <div className="relative">
            <Image
              src={
                product.image_url ||
                "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=200&fit=crop"
              }
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            {/* Badges container shifted left to right-12 to make room for menu button at right-2 */}
            <div className="absolute top-2 right-12 flex gap-1 items-center">
              <Badge variant="secondary" className="text-xs">
                -{discount}%
              </Badge>
              {!product.is_available && (
                <Badge variant="outline" className="bg-background/80 text-xs">
                  <EyeOff className="w-3 h-3 mr-1" />
                  Masqué
                </Badge>
              )}
            </div>

            {/* Menu Button moved to top-right of image */}
            <div className="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/20 hover:bg-black/40 text-white rounded-full">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    setEditingProduct(product);
                    setIsAddModalOpen(true);
                  }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Modifier
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleVisibility(product)}>
                    {product.is_available ? (
                      <>
                        <EyeOff className="w-4 h-4 mr-2" />
                        Masquer
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Afficher
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(product)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {product.expiry_date && isExpiringSoon(product.expiry_date) && (
              <div className="absolute top-2 left-2">
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Expire bientôt
                </Badge>
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-foreground line-clamp-1">
                  {product.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {getCategoryName(product.category)}
                </p>
              </div>
              {/* Removed Dropdown from here */}
            </div>

            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-lg font-bold text-primary">
                  {formatPrice(product.discounted_price)}
                </span>
                <span className="text-xs text-muted-foreground line-through ml-2">
                  {formatPrice(product.original_price)}
                </span>
              </div>
              <Badge variant="outline">
                {product.quantity_available} dispo
              </Badge>
            </div>

            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="w-3 h-3 mr-1" />
              Récupération: {product.pickup_start} - {product.pickup_end}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <>
      {isProfileLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !merchantId ? (
        <div className="flex flex-col items-center justify-center h-64">
          <AlertTriangle className="w-12 h-12 text-warning mb-4" />
          <h3 className="text-xl font-semibold mb-2">Profil commerçant non trouvé</h3>
          <p className="text-muted-foreground mb-4">
            Impossible de charger vos informations. Veuillez vérifier votre connexion ou votre compte.
          </p>
          <Button onClick={() => window.location.reload()}>Réessayer</Button>
        </div>
      ) : (
        <>
          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un produit..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button className="gap-2" onClick={() => {
              setEditingProduct(null);
              setIsAddModalOpen(true);
            }}>
              <Plus className="w-4 h-4" />
              Nouveau produit
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList>
              <TabsTrigger value="all">
                Tous ({products.length})
              </TabsTrigger>
              <TabsTrigger value="active">
                Actifs ({products.filter((p) => p.is_available).length})
              </TabsTrigger>
              <TabsTrigger value="inactive">
                Masqués ({products.filter((p) => !p.is_available).length})
              </TabsTrigger>
              <TabsTrigger value="expiring" className="text-warning">
                Expirent bientôt (
                {
                  products.filter(
                    (p) => p.expiry_date && isExpiringSoon(p.expiry_date)
                  ).length
                }
                )
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Products Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="font-medium text-foreground mb-2">
                  Aucun produit trouvé
                </h3>
                <p className="text-sm mb-4">
                  {searchQuery
                    ? "Essayez une autre recherche"
                    : "Commencez par ajouter votre premier produit"}
                </p>
                <Button className="gap-2" onClick={() => {
                  setEditingProduct(null);
                  setIsAddModalOpen(true);
                }}>
                  <Plus className="w-4 h-4" />
                  Ajouter un produit
                </Button>
              </div>
            </Card>
          )}

          {/* Add Product Modal */}
          {merchantId && (
            <AddProductModal
              open={isAddModalOpen}
              onOpenChange={(open) => {
                setIsAddModalOpen(open);
                if (!open) setEditingProduct(null);
              }}
              onProductCreated={loadProducts}
              merchantId={merchantId}
              productToEdit={editingProduct}
            />
          )}
        </>
      )}
    </>
  );
};

const MerchantProductsPage = () => {
  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Mes produits</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez vos invendus
        </p>
      </div>
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }>
        <MerchantProductsContent />
      </Suspense>
    </div>
  );
};

export default MerchantProductsPage;
