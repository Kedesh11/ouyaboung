"use client";

// ============================================
// Driver Dashboard Overview - Account status + deliveries snapshot
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDriverProfile, useDriverActiveDeliveries } from "@/hooks/useDriverData";
import { getVehicleTypeName } from "@/services/driver.service";

export default function DriverDashboardPage() {
  const { user } = useAuth();
  const { data: driver, isLoading: profileLoading } = useDriverProfile(user?.id);
  const { data: activeDeliveries, isLoading: deliveriesLoading } = useDriverActiveDeliveries(driver?.id);

  const isLoading = profileLoading || (!!driver?.id && deliveriesLoading);

  const status: "pending" | "approved" | "rejected" = !driver
    ? "pending"
    : driver.is_verified
      ? "approved"
      : driver.is_refused
        ? "rejected"
        : "pending";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-warning mb-4" />
        <h3 className="text-xl font-semibold mb-2">Profil chauffeur introuvable</h3>
        <p className="text-muted-foreground">
          Il semble que votre profil chauffeur n'ait pas encore été créé. Contactez le support si le problème persiste.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          Bonjour, {driver.full_name}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          {getVehicleTypeName(driver.vehicle_type)} · {driver.city}
        </p>
      </div>

      {status !== "approved" && (
        <Card className={status === "rejected" ? "border-destructive/50 bg-destructive/5" : "border-amber-300/60 bg-amber-50/40"}>
          <CardContent className="p-4 flex items-start gap-3">
            {status === "rejected" ? (
              <AlertTriangle className="w-5 h-5 mt-0.5 text-destructive" />
            ) : (
              <Clock className="w-5 h-5 mt-0.5 text-amber-600" />
            )}
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {status === "rejected" ? "Profil refusé" : "Profil en attente de validation"}
              </p>
              <p className="text-muted-foreground">
                {status === "rejected"
                  ? "Vous ne pouvez pas accepter de livraisons tant que votre profil n'est pas réactivé."
                  : "Vous pourrez accepter des livraisons dès qu'un administrateur aura approuvé votre profil."}
              </p>
              {status === "rejected" && driver.refusal_reason && (
                <p className="mt-2 text-destructive">Motif: {driver.refusal_reason}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {status === "approved" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 text-primary" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Profil approuvé</p>
              <p className="text-muted-foreground">
                Vous pouvez accepter des livraisons disponibles depuis la page "Livraisons".
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Livraisons en cours</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeDeliveries?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">acceptée(s) ou en route</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Véhicule</CardTitle>
            <Truck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getVehicleTypeName(driver.vehicle_type)}</div>
            <Badge variant="outline" className="mt-2">{driver.city}</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">Livraisons disponibles</h3>
            <p className="text-sm text-muted-foreground">
              Consultez les commandes prêtes à être récupérées chez les agriculteurs.
            </p>
          </div>
          <Link href="/driver/deliveries">
            <Button className="gap-2" disabled={status !== "approved"}>
              Voir les livraisons
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
