"use client";

// ============================================
// Merchant Farm Orders Page - Track B2B orders placed with farmers
// ouyaboung Platform - Marché B2B commerçant <-> agriculteur
// ============================================

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  Loader2,
  Sprout,
  Calendar,
} from "lucide-react";
import {
  getMerchantFarmOrders,
  getMyMerchantProfile,
  cancelFarmOrder,
  formatFarmOrderForDisplay,
  canCancelFarmOrder,
} from "@/services";
import type { FarmOrder, FarmOrderStatus } from "@/types";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const MerchantFarmOrdersPage = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<FarmOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FarmOrderStatus | "all">("all");
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadMerchantInfo();
  }, [user]);

  useEffect(() => {
    if (merchantId) loadOrders();
  }, [merchantId]);

  const loadMerchantInfo = async () => {
    if (!user) return;
    try {
      const profile = await getMyMerchantProfile(user.id);
      if (profile.success && profile.data) {
        setMerchantId(profile.data.id);
      }
    } catch (e) {
      console.error("Failed to load merchant profile", e);
    }
  };

  const loadOrders = async () => {
    if (!merchantId) return;
    setIsLoading(true);
    const result = await getMerchantFarmOrders(merchantId, { perPage: 50 });
    if (result.success && result.data) {
      setOrders(result.data.data);
    }
    setIsLoading(false);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      !searchQuery ||
      order.farm_product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.farmer?.farm_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || order.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleCancel = async (order: FarmOrder) => {
    if (!confirm("Êtes-vous sûr de vouloir annuler cette commande ?")) return;

    setCancellingId(order.id);
    try {
      const result = await cancelFarmOrder(order.id, "Annulée par le commerçant");
      if (result.success) {
        toast.success("Commande annulée");
        loadOrders();
      } else {
        toast.error(result.error?.message || "Erreur lors de l'annulation");
      }
    } catch (error) {
      console.error(error);
      toast.error("Une erreur est survenue");
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusIcon = (status: FarmOrderStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-warning" />;
      case "confirmed":
        return <CheckCircle className="w-4 h-4 text-primary" />;
      case "ready":
        return <Package className="w-4 h-4 text-blue-500" />;
      case "delivered":
        return <Truck className="w-4 h-4 text-green-600" />;
      case "refused":
      case "cancelled":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const statusCounts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Mes commandes agricoles</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Suivez vos commandes passées auprès des agriculteurs
        </p>
      </div>

      <div className="relative w-full sm:max-w-md mb-4 md:mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par produit ou exploitation..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FarmOrderStatus | "all")} className="mb-4 md:mb-6">
        <TabsList className="flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="all" className="text-xs sm:text-sm h-8 sm:h-10">Toutes ({statusCounts.all})</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1 text-xs sm:text-sm h-8 sm:h-10">
            <Clock className="w-3 h-3" />
            En attente ({statusCounts.pending})
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="gap-1 text-xs sm:text-sm h-8 sm:h-10">
            <CheckCircle className="w-3 h-3" />
            Confirmées ({statusCounts.confirmed})
          </TabsTrigger>
          <TabsTrigger value="ready" className="gap-1 text-xs sm:text-sm h-8 sm:h-10">
            <Package className="w-3 h-3" />
            Prêtes ({statusCounts.ready})
          </TabsTrigger>
          <TabsTrigger value="delivered" className="gap-1 text-xs sm:text-sm h-8 sm:h-10">
            <Truck className="w-3 h-3" />
            Livrées ({statusCounts.delivered})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {filteredOrders.map((order) => {
            const formatted = formatFarmOrderForDisplay(order);
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          {getStatusIcon(order.status)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{formatted.productName}</h3>
                          <p className="text-xs text-muted-foreground">{formatted.quantity}</p>
                        </div>
                      </div>
                      <Badge className={formatted.statusColor}>{formatted.status}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                      <div className="flex items-center gap-1">
                        <Sprout className="w-3 h-3" />
                        <span className="truncate">{formatted.farmerName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatted.createdAt}</span>
                      </div>
                    </div>

                    {order.status === "refused" && order.refusal_reason && (
                      <p className="text-xs text-destructive mb-3">Motif: {order.refusal_reason}</p>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="font-bold text-primary">{formatted.totalPrice}</span>
                      {canCancelFarmOrder(order) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={cancellingId === order.id}
                          onClick={() => handleCancel(order)}
                        >
                          {cancellingId === order.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Annuler"
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Sprout className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="font-medium text-foreground mb-2">Aucune commande trouvée</h3>
            <p className="text-sm">
              {searchQuery ? "Essayez une autre recherche" : "Parcourez le marché agriculteurs pour passer votre première commande"}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default MerchantFarmOrdersPage;
