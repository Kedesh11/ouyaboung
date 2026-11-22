"use client";

import dynamic from "next/dynamic";
import {
  AlertCircle,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Phone,
  Timer,
  Truck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DriverTransportJob } from "@/api/transport.api";
import { useNow } from "@/hooks/useNow";
import {
  useRespondTransportRequest,
  useTransportJobs,
  useUpdateTransportJobStatus,
} from "@/hooks/useTransportJobs";
import { formatDistance } from "@/lib/driver-presence";
import {
  formatCountdown,
  formatFare,
  mapsDirectionsUrl,
  remainingSeconds,
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

const ERROR_MESSAGES: Record<string, string> = {
  PROPOSAL_EXPIRED: "Le délai de réponse est dépassé.",
  PROPOSAL_NOT_AVAILABLE: "Cette demande n'est plus disponible.",
  DRIVER_BUSY: "Terminez votre course en cours avant d'en accepter une autre.",
  INVALID_TRANSITION:
    "Cette étape n'est pas possible pour l'état actuel de la course.",
  OFFLINE: "Vous êtes hors ligne. Réessayez dès que la connexion revient.",
  NETWORK_ERROR: "Connexion faible. Réessayez dans un instant.",
};

const errorText = (code: string, fallback: string) =>
  ERROR_MESSAGES[code] ?? fallback;

function JobCard({
  job,
  receivedAt,
  now,
}: {
  job: DriverTransportJob;
  receivedAt: number;
  now: number;
}) {
  const respond = useRespondTransportRequest();
  const update = useUpdateTransportJobStatus();
  const proposed = job.status === "proposed";
  const left = remainingSeconds(job.seconds_left, receivedAt, now);
  const expired = proposed && left <= 0;
  const busy = respond.isPending || update.isPending;
  const error = respond.error ?? update.error;

  return (
    <Card
      className={
        proposed ? "border-primary ring-1 ring-primary/40" : "border-primary/30"
      }
      data-testid={`transport-job-${job.id}`}
    >
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="w-5 h-5 text-primary shrink-0" />
            <h3 className="font-semibold">
              {proposed
                ? "Nouvelle demande de transport"
                : job.status === "accepted"
                  ? "Course acceptée"
                  : "Marchandise chargée"}
            </h3>
          </div>
          {proposed && (
            <Badge
              variant={expired ? "secondary" : "default"}
              className="shrink-0 gap-1"
              role="timer"
            >
              <Timer className="w-3 h-3" />
              {expired ? "Délai dépassé" : formatCountdown(left)}
            </Badge>
          )}
        </div>

        <dl className="grid gap-2 text-sm">
          <div className="flex items-start gap-2">
            <Package className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <dt className="sr-only">Marchandise</dt>
              <dd>{job.cargo_description}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
            <div>
              <dt className="text-xs text-muted-foreground">
                Point de ramassage
              </dt>
              <dd>
                {job.pickup_address}
                {job.distance_km != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · à {formatDistance(job.distance_km)} de vous
                  </span>
                )}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Navigation className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <dt className="text-xs text-muted-foreground">Livraison</dt>
              <dd>{job.dropoff_address}</dd>
            </div>
          </div>
        </dl>

        {job.driver_net != null && (
          <div
            className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
            data-testid="transport-earnings"
          >
            <p className="text-lg font-semibold">
              {formatFare(job.driver_net)}
            </p>
            <p className="text-xs text-muted-foreground">
              Votre gain · tarif {formatFare(job.fare_amount)} − commission{" "}
              {formatFare(job.platform_fee)}
              {job.route_distance_km != null &&
                ` · trajet ${job.route_distance_km} km`}
            </p>
          </div>
        )}

        <TransportMap
          pickup={{
            latitude: job.pickup_latitude,
            longitude: job.pickup_longitude,
          }}
          pickupLabel="Point de ramassage"
        />

        {job.status === "accepted" && (
          <div
            className={`rounded-lg border p-3 text-sm ${job.payment_status === "paid" ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}
            data-testid="transport-payment-state"
            role="status"
          >
            {job.payment_status === "paid"
              ? "Course payée: vous pouvez charger la marchandise."
              : job.payment_status === "pending"
                ? "Paiement en cours de validation par l'agriculteur…"
                : `En attente du paiement de l'agriculteur${job.seconds_to_pay != null ? ` (${formatCountdown(remainingSeconds(job.seconds_to_pay, receivedAt, now))} restantes)` : ""}. Ne chargez pas avant la confirmation.`}
          </div>
        )}

        {job.client ? (
          <div
            className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1"
            data-testid="transport-client"
          >
            <p className="font-medium">{job.client.name}</p>
            <p className="text-muted-foreground">{job.client.address}</p>
            <a
              href={`tel:${job.client.phone.replace(/[^\d+]/g, "")}`}
              aria-label={`Appeler ${job.client.name}`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Phone className="w-4 h-4" />
              {job.client.phone}
            </a>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Le nom et le téléphone du client s&apos;affichent dès que vous
            acceptez la course.
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {errorText(error.code, error.message)}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {proposed ? (
            <>
              <Button
                type="button"
                disabled={busy || expired}
                onClick={() =>
                  respond.mutate({ requestId: job.id, accept: true })
                }
              >
                {respond.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Accepter
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || expired}
                onClick={() =>
                  respond.mutate({ requestId: job.id, accept: false })
                }
              >
                Refuser
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline">
                <a
                  href={mapsDirectionsUrl(
                    job.pickup_latitude,
                    job.pickup_longitude,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation className="mr-2 h-4 w-4" />
                  Itinéraire
                </a>
              </Button>
              {job.status === "accepted" ? (
                <Button
                  type="button"
                  disabled={busy || job.payment_status !== "paid"}
                  onClick={() =>
                    update.mutate({ requestId: job.id, status: "picked_up" })
                  }
                >
                  {update.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Marchandise chargée
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    update.mutate({ requestId: job.id, status: "delivered" })
                  }
                >
                  {update.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Livraison terminée
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Demandes de transport proposées au chauffeur et courses en cours (rien d'affiché s'il n'y en a pas). */
export function TransportJobsCard() {
  const query = useTransportJobs();
  const jobs = query.data ?? [];
  const hasProposal = jobs.some(
    (job) =>
      job.status === "proposed" ||
      (job.status === "accepted" && job.payment_status !== "paid"),
  );
  const now = useNow(1000, hasProposal);

  if (query.isError && jobs.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Demandes de transport</AlertTitle>
        <AlertDescription>
          {errorText(
            query.error.code,
            "Impossible de charger vos demandes pour le moment. Nouvelle tentative automatique.",
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Demandes de transport">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          receivedAt={query.dataUpdatedAt}
          now={now}
        />
      ))}
    </section>
  );
}
