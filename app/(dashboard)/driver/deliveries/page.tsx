"use client";

// ============================================
// Driver Deliveries Page - Available pool + active delivery management
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Store,
  Sprout,
  Loader2,
  Truck,
  CheckCircle,
  Navigation,
  Camera,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useDriverProfile, useAvailableDeliveries, useDriverActiveDeliveries } from "@/hooks/useDriverData";
import { useDriverLocationTracking } from "@/hooks/useDriverLocationTracking";
import {
  acceptDelivery,
  markPickedUp,
  markInTransit,
  markDeliveryDelivered,
  formatDeliveryForDisplay,
  isDeliveryActive,
  uploadDeliveryProof,
} from "@/services";
import { useQueryClient } from "@tanstack/react-query";
import type { Delivery } from "@/types";

const DriverDeliveriesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: driver, isLoading: profileLoading } = useDriverProfile(user?.id);
  const isApproved = !!driver?.is_verified && driver.is_active && !driver.is_refused;

  const { data: activeDeliveries, isLoading: activeLoading } = useDriverActiveDeliveries(driver?.id);
  const { data: availableDeliveries, isLoading: availableLoading } = useAvailableDeliveries(isApproved);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const currentDelivery: Delivery | undefined = activeDeliveries?.[0];

  useDriverLocationTracking(
    driver?.id,
    currentDelivery?.id,
    !!currentDelivery && isDeliveryActive(currentDelivery.status)
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['driver', 'deliveries'] });
  };

  const handleAccept = async (deliveryId: string) => {
    setActionLoading(deliveryId);
    try {
      const result = await acceptDelivery(deliveryId);
      if (result.success) {
        toast.success("Livraison acceptée");
        invalidate();
      } else {
        toast.error(result.error?.message || "Impossible d'accepter cette livraison");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handlePickedUp = async (deliveryId: string) => {
    setActionLoading(deliveryId);
    try {
      const result = await markPickedUp(deliveryId);
      if (result.success) {
        toast.success("Commande marquée comme récupérée");
        invalidate();
      } else {
        toast.error(result.error?.message || "Erreur lors de la mise à jour");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleInTransit = async (deliveryId: string) => {
    setActionLoading(deliveryId);
    try {
      const result = await markInTransit(deliveryId);
      if (result.success) {
        toast.success("Livraison en route");
        invalidate();
      } else {
        toast.error(result.error?.message || "Erreur lors de la mise à jour");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelivered = async (deliveryId: string) => {
    if (!proofFile) {
      toast.error("Veuillez ajouter une photo de confirmation avant de valider la livraison");
      return;
    }

    setActionLoading(deliveryId);
    try {
      const uploadResult = await uploadDeliveryProof(deliveryId, proofFile);
      if (!uploadResult.success || !uploadResult.data) {
        toast.error(uploadResult.error?.message || "Échec de l'upload de la photo");
        return;
      }

      const result = await markDeliveryDelivered(deliveryId, uploadResult.data.publicUrl);
      if (result.success) {
        toast.success("Livraison confirmée");
        setProofFile(null);
        invalidate();
      } else {
        toast.error(result.error?.message || "Erreur lors de la confirmation");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const isLoading = profileLoading || activeLoading || (isApproved && availableLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
        <Package className="w-12 h-12 text-warning mb-4" />
        <h3 className="text-xl font-semibold mb-2">Profil non approuvé</h3>
        <p className="text-muted-foreground">
          Votre profil chauffeur doit être approuvé par un administrateur avant de pouvoir accepter des livraisons.
        </p>
      </div>
    );
  }

  if (currentDelivery) {
    const formatted = formatDeliveryForDisplay(currentDelivery);

    return (
      <div className="space-y-4 md:space-y-6 lg:p-6">
        <div className="mb-4 md:mb-6">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Livraison en cours</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
            Suivez votre trajet et confirmez les étapes de la livraison
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{formatted.productName}</h3>
              <Badge className={formatted.statusColor}>{formatted.status}</Badge>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Sprout className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">{formatted.farmerName}</p>
                  <p className="text-muted-foreground">{formatted.farmerAddress}, {formatted.farmerCity}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Store className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">{formatted.merchantName}</p>
                  <p className="text-muted-foreground">{formatted.merchantAddress}, {formatted.merchantCity}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="w-4 h-4" />
              {formatted.quantity}
            </div>

            {isDeliveryActive(currentDelivery.status) && (
              <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-md p-2">
                <MapPin className="w-3.5 h-3.5" />
                Votre position est partagée en direct avec l'agriculteur et le commerçant.
              </div>
            )}

            {currentDelivery.status === "in_transit" && (
              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Photo de confirmation de livraison *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              {currentDelivery.status === "accepted" && (
                <Button onClick={() => handlePickedUp(currentDelivery.id)} disabled={actionLoading === currentDelivery.id} className="gap-2">
                  {actionLoading === currentDelivery.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  Marquer récupérée
                </Button>
              )}
              {currentDelivery.status === "picked_up" && (
                <Button onClick={() => handleInTransit(currentDelivery.id)} disabled={actionLoading === currentDelivery.id} className="gap-2">
                  {actionLoading === currentDelivery.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  En route
                </Button>
              )}
              {currentDelivery.status === "in_transit" && (
                <Button onClick={() => handleDelivered(currentDelivery.id)} disabled={actionLoading === currentDelivery.id || !proofFile} className="gap-2">
                  {actionLoading === currentDelivery.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirmer la livraison
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Livraisons disponibles</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Acceptez une commande à récupérer chez un agriculteur
        </p>
      </div>

      {availableDeliveries && availableDeliveries.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {availableDeliveries.map((delivery) => {
            const formatted = formatDeliveryForDisplay(delivery);
            return (
              <motion.div key={delivery.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">{formatted.productName}</h3>
                      <Badge variant="outline">{formatted.quantity}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Sprout className="w-3.5 h-3.5" />
                        <span>{formatted.farmerName} · {formatted.farmerCity}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Store className="w-3.5 h-3.5" />
                        <span>{formatted.merchantName} · {formatted.merchantCity}</span>
                      </div>
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={() => handleAccept(delivery.id)}
                      disabled={actionLoading === delivery.id}
                    >
                      {actionLoading === delivery.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                      Accepter
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="font-medium text-foreground mb-2">Aucune livraison disponible</h3>
            <p className="text-sm">Les nouvelles livraisons apparaîtront ici dès qu'un agriculteur préparera une commande.</p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default DriverDeliveriesPage;
