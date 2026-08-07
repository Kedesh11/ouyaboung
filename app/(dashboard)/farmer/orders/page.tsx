"use client";

// ============================================
// Farmer Orders Page - Receive & manage B2B orders
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  Loader2,
  Store,
  Calendar,
  MessageSquare,
  MapPin,
} from "lucide-react";
import {
  getFarmerFarmOrders,
  getMyFarmerProfile,
  confirmFarmOrder,
  refuseFarmOrder,
  markFarmOrderReady,
  markFarmOrderDelivered,
  formatFarmOrderForDisplay,
} from "@/services";
import type { FarmOrder, FarmOrderStatus } from "@/types";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import DeliveryTrackingDialog from "@/components/delivery/DeliveryTrackingDialog";

type ActionKind = "confirm" | "refuse" | "ready" | "delivered";

const FarmerOrdersPage = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<FarmOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FarmOrderStatus | "all">("all");
  const [selectedOrder, setSelectedOrder] = useState<FarmOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [refusalReason, setRefusalReason] = useState("");
  const [isRefusing, setIsRefusing] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadFarmerInfo();
  }, [user]);

  useEffect(() => {
    if (farmerId) loadOrders();
  }, [farmerId]);

  const loadFarmerInfo = async () => {
    if (!user) return;
    try {
      const profile = await getMyFarmerProfile(user.id);
      if (profile.success && profile.data) {
        setFarmerId(profile.data.id);
      }
    } catch (e) {
      console.error("Failed to load farmer profile", e);
      toast.error("Erreur lors du chargement du profil");
    }
  };

  const loadOrders = async () => {
    if (!farmerId) return;
    setIsLoading(true);
    const result = await getFarmerFarmOrders(farmerId, { perPage: 50 });
    if (result.success && result.data) {
      setOrders(result.data.data);
    }
    setIsLoading(false);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      !searchQuery ||
      order.farm_product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.merchant?.business_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || order.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const mergeOrderUpdate = (updatedOrder: FarmOrder) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order))
    );
    setSelectedOrder((prev) => (prev && prev.id === updatedOrder.id ? { ...prev, ...updatedOrder } : prev));
  };

  const withAction = async (
    order: FarmOrder,
    action: ActionKind,
    callback: () => Promise<any>,
    successMessage: string
  ) => {
    const actionKey = `${order.id}:${action}`;
    setActiveActionKey(actionKey);
    try {
      const result = await callback();
      if (result?.success && result.data) {
        mergeOrderUpdate(result.data as FarmOrder);
        toast.success(successMessage);
        return true;
      }
      toast.error(result?.error?.message || "La mise à jour du statut a échoué.");
      return false;
    } catch (error) {
      console.error("[FarmerOrders] Status transition failed", { orderId: order.id, action, error });
      toast.error("Une erreur est survenue pendant la mise à jour.");
      return false;
    } finally {
      setActiveActionKey(null);
    }
  };

  const handleConfirm = async (order: FarmOrder) => {
    const done = await withAction(order, "confirm", () => confirmFarmOrder(order.id), "Commande confirmée");
    if (done) setIsDialogOpen(false);
  };

  const handleMarkReady = async (order: FarmOrder) => {
    const done = await withAction(order, "ready", () => markFarmOrderReady(order.id), "Commande marquée comme prête");
    if (done) setIsDialogOpen(false);
  };

  const handleMarkDelivered = async (order: FarmOrder) => {
    const done = await withAction(order, "delivered", () => markFarmOrderDelivered(order.id), "Commande marquée comme livrée");
    if (done) setIsDialogOpen(false);
  };

  const openRefuse = (order: FarmOrder) => {
    setSelectedOrder(order);
    setRefusalReason("");
    setIsRefusing(true);
    setIsDialogOpen(true);
  };

  const handleConfirmRefuse = async () => {
    if (!selectedOrder) return;
    if (!refusalReason.trim()) {
      toast.error("Le motif du refus est obligatoire.");
      return;
    }
    const done = await withAction(
      selectedOrder,
      "refuse",
      () => refuseFarmOrder(selectedOrder.id, refusalReason.trim()),
      "Commande refusée"
    );
    if (done) {
      setIsRefusing(false);
      setIsDialogOpen(false);
    }
  };

  const isActionLoading = (orderId: string, action: ActionKind) => activeActionKey === `${orderId}:${action}`;
  const isActionDisabled = (orderId: string) =>
    typeof activeActionKey === "string" && activeActionKey.startsWith(`${orderId}:`);

  const LoadingIcon = () => <Loader2 className="w-4 h-4 mr-2 animate-spin" />;

  const ActionButtonLabel = ({ loading, icon, label }: { loading: boolean; icon: ReactNode; label: string }) => (
    <>
      {loading ? <LoadingIcon /> : icon}
      {label}
    </>
  );

  const ActionButtons = ({ order }: { order: FarmOrder }) => {
    if (order.status === "pending") {
      return (
        <>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => openRefuse(order)}
            disabled={isActionDisabled(order.id)}
          >
            <ActionButtonLabel loading={false} icon={<XCircle className="w-4 h-4 mr-2" />} label="Refuser" />
          </Button>
          <Button onClick={() => handleConfirm(order)} disabled={isActionDisabled(order.id)}>
            <ActionButtonLabel
              loading={isActionLoading(order.id, "confirm")}
              icon={<CheckCircle className="w-4 h-4 mr-2" />}
              label="Confirmer"
            />
          </Button>
        </>
      );
    }

    if (order.status === "confirmed") {
      return (
        <Button onClick={() => handleMarkReady(order)} disabled={isActionDisabled(order.id)}>
          <ActionButtonLabel
            loading={isActionLoading(order.id, "ready")}
            icon={<Package className="w-4 h-4 mr-2" />}
            label="Marquer comme prête"
          />
        </Button>
      );
    }

    if (order.status === "ready") {
      return (
        <Button onClick={() => handleMarkDelivered(order)} disabled={isActionDisabled(order.id)}>
          <ActionButtonLabel
            loading={isActionLoading(order.id, "delivered")}
            icon={<Truck className="w-4 h-4 mr-2" />}
            label="Marquer comme livrée"
          />
        </Button>
      );
    }

    return null;
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

  const OrderCard = ({ order }: { order: FarmOrder }) => {
    const formatted = formatFarmOrderForDisplay(order);

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setSelectedOrder(order);
            setIsRefusing(false);
            setIsDialogOpen(true);
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    order.status === "delivered"
                      ? "bg-green-100"
                      : order.status === "refused" || order.status === "cancelled"
                        ? "bg-destructive/10"
                        : "bg-primary/10"
                  }`}
                >
                  {getStatusIcon(order.status)}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{formatted.productName}</h3>
                  <p className="text-xs text-muted-foreground">{formatted.quantity}</p>
                </div>
              </div>
              <Badge className={formatted.statusColor}>{formatted.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Store className="w-3 h-3" />
                <span className="truncate">{formatted.merchantName}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{formatted.createdAt}</span>
              </div>
            </div>

            {order.special_request && (
              <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
                <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{order.special_request}</span>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-bold text-primary">{formatted.totalPrice}</span>
            </div>

            {(order.status === "ready" || order.status === "delivered") && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setTrackingOrderId(order.id);
                }}
              >
                <MapPin className="w-4 h-4" />
                Suivre la livraison
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const statusCounts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    refused: orders.filter((o) => o.status === "refused").length,
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Commandes reçues</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez les commandes passées par les commerçants
        </p>
      </div>

      <div className="relative w-full sm:max-w-md mb-4 md:mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par produit ou commerce..."
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
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="font-medium text-foreground mb-2">Aucune commande trouvée</h3>
            <p className="text-sm">
              {searchQuery ? "Essayez une autre recherche" : "Les nouvelles commandes apparaîtront ici"}
            </p>
          </div>
        </Card>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setIsRefusing(false);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          {selectedOrder && !isRefusing && (
            <>
              <DialogHeader>
                <DialogTitle>Détails de la commande</DialogTitle>
                <DialogDescription>{selectedOrder.merchant?.business_name || "Commerce"}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted/50 rounded-xl">
                  <h4 className="font-semibold text-foreground mb-2">
                    {selectedOrder.farm_product?.name || "Produit"}
                  </h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {selectedOrder.quantity} {selectedOrder.unit} x {selectedOrder.price_per_unit.toLocaleString()} XAF
                    </span>
                    <span className="font-bold text-primary">
                      {selectedOrder.total_price.toLocaleString()} XAF
                    </span>
                  </div>
                </div>

                {selectedOrder.special_request && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-foreground">Demande spéciale</h4>
                    <p className="text-sm text-muted-foreground">{selectedOrder.special_request}</p>
                  </div>
                )}

                {selectedOrder.requested_date && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-foreground">Date souhaitée</h4>
                    <p className="text-sm text-muted-foreground">{selectedOrder.requested_date}</p>
                  </div>
                )}

                {selectedOrder.status === "refused" && selectedOrder.refusal_reason && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <h4 className="font-medium text-destructive mb-1">Motif du refus</h4>
                    <p className="text-sm text-destructive/80">{selectedOrder.refusal_reason}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <ActionButtons order={selectedOrder} />
              </DialogFooter>
            </>
          )}

          {selectedOrder && isRefusing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-destructive" />
                  Refuser la commande
                </DialogTitle>
                <DialogDescription>Veuillez indiquer le motif du refus.</DialogDescription>
              </DialogHeader>

              <div className="space-y-2 py-4">
                <Label htmlFor="refusal-reason" className="text-destructive">
                  Motif du refus *
                </Label>
                <Textarea
                  id="refusal-reason"
                  placeholder="Indiquez le motif du refus (obligatoire)..."
                  value={refusalReason}
                  onChange={(e) => setRefusalReason(e.target.value)}
                  className="min-h-[100px] border-destructive/50 focus:border-destructive"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsRefusing(false)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRefuse}
                  disabled={!refusalReason.trim() || isActionDisabled(selectedOrder.id)}
                >
                  <ActionButtonLabel
                    loading={isActionLoading(selectedOrder.id, "refuse")}
                    icon={<XCircle className="w-4 h-4 mr-2" />}
                    label="Confirmer le refus"
                  />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {trackingOrderId && (
        <DeliveryTrackingDialog
          farmOrderId={trackingOrderId}
          open={!!trackingOrderId}
          onOpenChange={(open) => !open && setTrackingOrderId(null)}
        />
      )}
    </div>
  );
};

export default FarmerOrdersPage;
