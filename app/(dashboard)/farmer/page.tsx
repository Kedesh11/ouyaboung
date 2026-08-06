"use client";

// ============================================
// Farmer Dashboard Overview - Account status + catalogue snapshot
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Sprout,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFarmerProfile, useFarmerItems } from "@/hooks/useFarmerData";
import { getFarmerTypeName } from "@/services/farmer.service";

export default function FarmerDashboardPage() {
  const { user } = useAuth();
  const { data: farmer, isLoading: profileLoading } = useFarmerProfile(user?.id);
  const { data: products, isLoading: itemsLoading } = useFarmerItems(farmer?.id);

  const isLoading = profileLoading || (!!farmer?.id && itemsLoading);

  const status: "pending" | "approved" | "rejected" = !farmer
    ? "pending"
    : farmer.is_verified
      ? "approved"
      : farmer.is_refused
        ? "rejected"
        : "pending";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!farmer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-warning mb-4" />
        <h3 className="text-xl font-semibold mb-2">Profil agriculteur introuvable</h3>
        <p className="text-muted-foreground">
          Il semble que votre profil d'exploitation n'ait pas encore été créé. Contactez le support si le problème persiste.
        </p>
      </div>
    );
  }

  const availableCount = products?.filter((p) => p.is_available).length || 0;
  const totalCount = products?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          Bonjour, {farmer.farm_name}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          {getFarmerTypeName(farmer.farmer_type)} · {farmer.city}
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
                {status === "rejected" ? "Exploitation refusée" : "Exploitation en attente de validation"}
              </p>
              <p className="text-muted-foreground">
                {status === "rejected"
                  ? "Vous ne pouvez pas publier de produits tant que votre exploitation n'est pas réactivée."
                  : "Vous pourrez ajouter des produits dès qu'un administrateur aura approuvé votre exploitation."}
              </p>
              {status === "rejected" && farmer.refusal_reason && (
                <p className="mt-2 text-destructive">Motif: {farmer.refusal_reason}</p>
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
              <p className="font-medium text-foreground">Exploitation approuvée</p>
              <p className="text-muted-foreground">
                Votre exploitation est visible dans le répertoire public. Ajoutez vos produits pour que les commerçants puissent les découvrir.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Produits au catalogue</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">{availableCount} disponible(s)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Type d'exploitation</CardTitle>
            <Sprout className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getFarmerTypeName(farmer.farmer_type)}</div>
            <Badge variant="outline" className="mt-2">{farmer.city}</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">Gérer votre catalogue</h3>
            <p className="text-sm text-muted-foreground">
              Ajoutez, modifiez ou masquez vos produits disponibles.
            </p>
          </div>
          <Link href="/farmer/products">
            <Button className="gap-2" disabled={status !== "approved"}>
              Voir mes produits
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
