"use client";

// ============================================
// Delivery Tracking Dialog - Reusable live tracking view
// ouyaboung Platform - Chauffeurs / livraison
// Used from both the merchant (farm-orders) and farmer (orders) order pages.
// ============================================

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, Phone } from "lucide-react";
import { getDelivery, formatDeliveryForDisplay, isDeliveryActive } from "@/services";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import type { Delivery } from "@/types";

const DeliveryTrackingMap = dynamic(() => import("./DeliveryTrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] flex items-center justify-center bg-muted/30 rounded-lg">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  ),
});

interface DeliveryTrackingDialogProps {
  farmOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DeliveryTrackingDialog = ({ farmOrderId, open, onOpenChange }: DeliveryTrackingDialogProps) => {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    getDelivery(farmOrderId).then((result) => {
      if (result.success) {
        setDelivery(result.data || null);
      }
      setIsLoading(false);
    });
  }, [open, farmOrderId]);

  const active = !!delivery && isDeliveryActive(delivery.status);
  const position = useDeliveryTracking(delivery?.id, open && active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Suivi de la livraison
          </DialogTitle>
          <DialogDescription>
            Position en direct du chauffeur assigné à cette commande.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !delivery ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Aucune livraison n'a encore été créée pour cette commande.
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const formatted = formatDeliveryForDisplay(delivery);
              return (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {formatted.driverName || "En attente d'un chauffeur"}
                    </p>
                    {delivery.driver?.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {delivery.driver.phone}
                      </p>
                    )}
                  </div>
                  <Badge className={formatted.statusColor}>{formatted.status}</Badge>
                </div>
              );
            })()}

            <DeliveryTrackingMap
              driverPosition={position}
              farmerCoords={
                delivery.farm_order?.farmer?.latitude != null && delivery.farm_order?.farmer?.longitude != null
                  ? { latitude: delivery.farm_order.farmer.latitude, longitude: delivery.farm_order.farmer.longitude }
                  : null
              }
              merchantCoords={
                delivery.farm_order?.merchant?.latitude != null && delivery.farm_order?.merchant?.longitude != null
                  ? { latitude: delivery.farm_order.merchant.latitude, longitude: delivery.farm_order.merchant.longitude }
                  : null
              }
              driverName={delivery.driver?.full_name}
            />

            {!active && (
              <p className="text-xs text-muted-foreground text-center">
                {delivery.status === "delivered"
                  ? "Cette commande a été livrée."
                  : "Le suivi en direct démarrera une fois la livraison acceptée par un chauffeur."}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryTrackingDialog;
