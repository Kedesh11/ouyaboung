"use client";

import { Loader2 } from "lucide-react";
import { DriverPayoutAccounts } from "@/components/driver/DriverPayoutAccounts";
import { useAuth } from "@/hooks/useAuth";
import { useDriverProfile } from "@/hooks/useDriverData";

export default function DriverPaymentsPage() {
  const { user } = useAuth();
  const { data: driver, isLoading } = useDriverProfile(user?.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Paiements</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Votre part de chaque course payée par l&apos;agriculteur est versée sur ce numéro, moins la commission de la plateforme.
        </p>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <DriverPayoutAccounts driverId={driver?.id} />
      )}
    </div>
  );
}
