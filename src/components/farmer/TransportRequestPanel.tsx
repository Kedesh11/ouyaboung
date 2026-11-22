"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Phone,
  Star,
  Timer,
  Truck,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FarmerTransportRequest } from "@/api/transport.api";
import { useCancelTransportRequest } from "@/hooks/useTransportRequest";
import { TransportPaymentSection } from "@/components/farmer/TransportPaymentSection";
import { useNow } from "@/hooks/useNow";
import { formatAge, vehicleLabel } from "@/lib/driver-presence";
import {
  closedReasonLabel,
  formatCountdown,
  formatFare,
  isActiveTransport,
  remainingSeconds,
  TRANSPORT_STATUS_LABEL,
} from "@/lib/transport";

const TransportMap = dynamic(
  () => import("@/components/transport/TransportMap"),
  {
    ssr: false,
    loading: () => (
      <Card className="h-[220px] flex items-center justify-center bg-muted/50">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </Card>
    ),
  },
);

interface TransportRequestPanelProps {
  request: FarmerTransportRequest;
  /** Instant de reception de la reponse serveur (pour le compte a rebours). */
  receivedAt: number;
  /** Ferme l'affichage d'une demande terminee. */
  onDismiss: () => void;
}

/** Etat de la demande de transport en cours (ou terminee depuis peu) de l'agriculteur. */
export function TransportRequestPanel({
  request,
  receivedAt,
  onDismiss,
}: TransportRequestPanelProps) {
  const cancel = useCancelTransportRequest();
  const [confirming, setConfirming] = useState(false);
  const proposed = request.status === "proposed";
  const now = useNow(1000, proposed);
  const left = remainingSeconds(request.seconds_left, receivedAt, now);
  const active = isActiveTransport(request.status);
  const driver = request.driver;
  const cancellable =
    request.status === "proposed" ||
    (request.status === "accepted" && request.payment_status === "unpaid");
  const failed =
    request.status === "no_driver" || request.status === "cancelled";

  return (
    <Card
      data-testid="transport-request-panel"
      className={
        failed
          ? "border-destructive/40"
          : request.status === "delivered"
            ? "border-green-300"
            : "border-primary/40"
      }
    >
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {failed ? (
              <XCircle className="w-5 h-5 text-destructive shrink-0" />
            ) : request.status === "delivered" ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            ) : (
              <Truck className="w-5 h-5 text-primary shrink-0" />
            )}
            <h2 className="font-semibold">
              {request.status === "accepted" &&
              request.payment_status !== "paid"
                ? "Course acceptée: paiement attendu"
                : TRANSPORT_STATUS_LABEL[request.status]}
            </h2>
          </div>
          {proposed && (
            <Badge className="shrink-0 gap-1" role="timer">
              <Timer className="w-3 h-3" />
              {left > 0 ? formatCountdown(left) : "Délai dépassé"}
            </Badge>
          )}
        </div>

        {failed && closedReasonLabel(request.closed_reason) && (
          <p className="text-sm text-muted-foreground">
            {closedReasonLabel(request.closed_reason)}
          </p>
        )}

        {driver && request.status !== "cancelled" && (
          <div
            className="rounded-lg border bg-muted/40 p-3 space-y-1 text-sm"
            data-testid="transport-driver"
          >
            <p className="font-medium">{driver.display_name}</p>
            <p className="text-muted-foreground">
              {vehicleLabel(driver.vehicle_type)}
              {driver.age_seconds != null &&
                ` · position ${formatAge(driver.age_seconds)}`}
            </p>
            <p className="flex items-center gap-1 text-muted-foreground">
              <Star className="w-3 h-3 text-amber-500" />
              {driver.total_reviews > 0
                ? `${Number(driver.rating).toFixed(1)} (${driver.total_reviews} avis)`
                : "Nouveau chauffeur"}
            </p>
            {driver.phone && (
              <a
                href={`tel:${driver.phone.replace(/[^\d+]/g, "")}`}
                aria-label={`Appeler ${driver.display_name}`}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Phone className="w-4 h-4" />
                {driver.phone}
              </a>
            )}
          </div>
        )}

        <dl className="text-sm space-y-1">
          <div>
            <dt className="inline text-muted-foreground">Marchandise: </dt>
            <dd className="inline">{request.cargo_description}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Ramassage: </dt>
            <dd className="inline">{request.pickup_address}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Livraison: </dt>
            <dd className="inline">{request.dropoff_address}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Tarif du chauffeur: </dt>
            <dd className="inline font-medium">
              {formatFare(request.fare_amount)}
              {request.distance_km != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · {request.distance_km} km
                </span>
              )}
            </dd>
          </div>
        </dl>

        {(request.status === "accepted" ||
          request.status === "picked_up" ||
          request.status === "delivered") && (
          <TransportPaymentSection request={request} receivedAt={receivedAt} />
        )}

        {(request.status === "accepted" || request.status === "picked_up") &&
          driver?.latitude != null &&
          driver.longitude != null && (
            <TransportMap
              pickup={{
                latitude: request.pickup_latitude,
                longitude: request.pickup_longitude,
              }}
              driver={{
                latitude: driver.latitude,
                longitude: driver.longitude,
              }}
              driverLabel={driver.display_name}
            />
          )}

        {cancel.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{cancel.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {active && cancellable && !confirming && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(true)}
            >
              Annuler la demande
            </Button>
          )}
          {active && cancellable && confirming && (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(request.id, {
                    onSettled: () => setConfirming(false),
                  })
                }
              >
                {cancel.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Oui, annuler
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                Non, garder
              </Button>
            </>
          )}
          {!active && (
            <Button type="button" onClick={onDismiss}>
              {request.status === "delivered" ? "Fermer" : "Nouvelle demande"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
