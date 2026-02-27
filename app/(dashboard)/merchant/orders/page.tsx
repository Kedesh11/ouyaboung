"use client";

// ============================================
// Merchant Orders Page - Manage Reservations
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Loader2,
  User,
  Phone,
  Calendar,
  Hash,
  QrCode,
} from "lucide-react";
import {
  getMerchantOrders,
  formatPrice,
  formatOrderForDisplay,
  getMyMerchantProfile,
  confirmOrder,
  markOrderReady,
  cancelOrder as cancelOrderService,
} from "@/services";
import type { Order, OrderStatus } from "@/types";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const MerchantOrdersPage = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<OrderStatus | "all">("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      loadMerchantInfo();
    }
  }, [user]);

  useEffect(() => {
    if (merchantId) {
      loadOrders();
    }
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
      toast.error("Erreur lors du chargement du profil");
    }
  };

  const loadOrders = async () => {
    if (!merchantId) return;
    setIsLoading(true);
    const result = await getMerchantOrders(merchantId, { perPage: 50 });
    if (result.success && result.data) {
      setOrders(result.data.data);
    }
    setIsLoading(false);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.pickup_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.food_item?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || order.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const mergeOrderUpdate = (updatedOrder: Order) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === updatedOrder.id
          ? { ...order, ...updatedOrder, user: order.user ?? updatedOrder.user }
          : order
      )
    );
    setSelectedOrder((prev) =>
      prev && prev.id === updatedOrder.id
        ? { ...prev, ...updatedOrder, user: prev.user ?? updatedOrder.user }
        : prev
    );
  };

  const withAction = async (
    order: Order,
    action: "confirm" | "ready" | "cancel",
    callback: () => Promise<any>,
    successMessage: string
  ) => {
    const actionKey = `${order.id}:${action}`;
    setActiveActionKey(actionKey);
    try {
      const result = await callback();
      if (result?.success && result.data) {
        mergeOrderUpdate(result.data as Order);
        toast.success(successMessage);
        return true;
      }

      toast.error(result?.error?.message || "La mise a jour du statut a echoue.");
      return false;
    } catch (error) {
      console.error("[MerchantOrders] Status transition failed", {
        orderId: order.id,
        action,
        error,
      });
      toast.error("Une erreur est survenue pendant la mise a jour.");
      return false;
    } finally {
      setActiveActionKey(null);
    }
  };

  const handleConfirm = async (order: Order) => {
    const done = await withAction(
      order,
      "confirm",
      () => confirmOrder(order.id),
      `Reservation ${order.pickup_code} confirmee`
    );
    if (done) {
      setIsDialogOpen(false);
    }
  };

  const handleMarkReady = async (order: Order) => {
    const done = await withAction(
      order,
      "ready",
      () => markOrderReady(order.id),
      `Reservation ${order.pickup_code} marquee comme prete`
    );
    if (done) {
      setIsDialogOpen(false);
    }
  };

  const handleCancel = async (order: Order) => {
    const done = await withAction(
      order,
      "cancel",
      () => cancelOrderService(order.id, "Annulee par le marchand"),
      `Reservation ${order.pickup_code} annulee`
    );
    if (done) {
      setIsDialogOpen(false);
    }
  };

  const handleScanOrder = (order: Order) => {
    setIsDialogOpen(false);
    router.push(`/merchant/scan?pickup_code=${encodeURIComponent(order.pickup_code)}`);
  };

  const isActionLoading = (orderId: string, action: "confirm" | "ready" | "cancel") =>
    activeActionKey === `${orderId}:${action}`;
  
  const isAnyActionLoadingForOrder = (orderId: string) =>
    typeof activeActionKey === "string" && activeActionKey.startsWith(`${orderId}:`);
  
  const isActionDisabled = (orderId: string) => isAnyActionLoadingForOrder(orderId);

  const LoadingIcon = () => <Loader2 className="w-4 h-4 mr-2 animate-spin" />;

  const ActionButtonLabel = ({
    loading,
    icon,
    label,
  }: {
    loading: boolean;
    icon: ReactNode;
    label: string;
  }) => (
    <>
      {loading ? <LoadingIcon /> : icon}
      {label}
    </>
  );

  const ActionButtons = ({ order }: { order: Order }) => {
    if (order.status === "pending") {
      const cancelLoading = isActionLoading(order.id, "cancel");
      const confirmLoading = isActionLoading(order.id, "confirm");
      return (
        <>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => handleCancel(order)}
            disabled={isActionDisabled(order.id)}
          >
            <ActionButtonLabel
              loading={cancelLoading}
              icon={<XCircle className="w-4 h-4 mr-2" />}
              label="Annuler"
            />
          </Button>
          <Button
            onClick={() => handleConfirm(order)}
            disabled={isActionDisabled(order.id)}
          >
            <ActionButtonLabel
              loading={confirmLoading}
              icon={<CheckCircle className="w-4 h-4 mr-2" />}
              label="Confirmer"
            />
          </Button>
        </>
      );
    }

    if (order.status === "confirmed") {
      const readyLoading = isActionLoading(order.id, "ready");
      return (
        <>
          <Button
            onClick={() => handleMarkReady(order)}
            disabled={isActionDisabled(order.id)}
          >
            <ActionButtonLabel
              loading={readyLoading}
              icon={<Package className="w-4 h-4 mr-2" />}
              label="Marquer comme pret"
            />
          </Button>
          <Button
            variant="outline"
            onClick={() => handleScanOrder(order)}
            disabled={isActionDisabled(order.id)}
          >
            <QrCode className="w-4 h-4 mr-2" />
            Scanner le QR
          </Button>
        </>
      );
    }

    if (order.status === "ready") {
      return (
        <Button
          onClick={() => handleScanOrder(order)}
          disabled={isActionDisabled(order.id)}
        >
          <QrCode className="w-4 h-4 mr-2" />
          Scanner pour valider la commande
        </Button>
      );
    }

    return null;
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-warning" />;
      case "confirmed":
        return <CheckCircle className="w-4 h-4 text-primary" />;
      case "ready":
        return <Package className="w-4 h-4 text-blue-500" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "cancelled":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const formatted = formatOrderForDisplay(order);

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setSelectedOrder(order);
            setIsDialogOpen(true);
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${order.status === "completed"
                    ? "bg-green-100"
                    : order.status === "cancelled"
                      ? "bg-destructive/10"
                      : "bg-primary/10"
                    }`}
                >
                  {getStatusIcon(order.status)}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {formatted.itemName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {order.quantity} unité(s)
                  </p>
                </div>
              </div>
              <Badge className={formatted.statusColor}>{formatted.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Hash className="w-3 h-3" />
                <span className="font-mono font-medium">{order.pickup_code}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{formatted.createdAt}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-bold text-primary">
                {formatPrice(order.total_price)}
              </span>
            </div>
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
    completed: orders.filter((o) => o.status === "completed").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Réservations</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez les commandes de vos clients
        </p>
      </div>
      {/* Search */}
      <div className="relative w-full sm:max-w-md mb-4 md:mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par code ou produit..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as OrderStatus | "all")}
        className="mb-4 md:mb-6"
      >
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
          <TabsTrigger value="completed" className="gap-1 text-xs sm:text-sm h-8 sm:h-10">
            <CheckCircle className="w-3 h-3" />
            Récupérées ({statusCounts.completed})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Orders Grid */}
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
            <h3 className="font-medium text-foreground mb-2">
              Aucune réservation trouvée
            </h3>
            <p className="text-sm">
              {searchQuery
                ? "Essayez une autre recherche"
                : "Les nouvelles réservations apparaîtront ici"}
            </p>
          </div>
        </Card>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Détails de la réservation</DialogTitle>
                <DialogDescription>
                  Code: {selectedOrder.pickup_code}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Product Info */}
                <div className="p-4 bg-muted/50 rounded-xl">
                  <h4 className="font-semibold text-foreground mb-2">
                    {selectedOrder.food_item?.name || "Produit"}
                  </h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {selectedOrder.quantity} x{" "}
                      {formatPrice(selectedOrder.food_item?.discounted_price || 0)}
                    </span>
                    <span className="font-bold text-primary">
                      {formatPrice(selectedOrder.total_price)}
                    </span>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Client</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span>{selectedOrder.user?.full_name || "Client"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span>{selectedOrder.user?.phone || "Non renseigné"}</span>
                  </div>
                </div>

                {/* Savings */}
                <div className="p-3 bg-primary/10 rounded-lg">
                  <p className="text-sm text-primary font-medium">
                    Économie client: {formatPrice(selectedOrder.savings)}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <ActionButtons order={selectedOrder} />
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MerchantOrdersPage;
