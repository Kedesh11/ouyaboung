"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CreateTransportRequestInput,
  TransportPoint,
} from "@/api/transport.api";
import {
  useCreateTransportRequest,
  useTransportQuote,
} from "@/hooks/useTransportRequest";
import { formatFare, TRANSPORT_PROPOSAL_TTL_SECONDS } from "@/lib/transport";
import {
  formatDistance,
  VEHICLE_TYPES,
  vehicleLabel,
  type VehicleType,
} from "@/lib/driver-presence";

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

export const TRANSPORT_ERROR_MESSAGES: Record<string, string> = {
  ACTIVE_REQUEST_EXISTS: "Vous avez déjà une demande de transport en cours.",
  NO_DRIVER_AVAILABLE:
    "Aucun chauffeur libre pour le moment. Réessayez dans quelques instants.",
  DRIVER_UNAVAILABLE:
    "Ce chauffeur n'est plus disponible. Choisissez-en un autre.",
  PICKUP_REQUIRED:
    "Indiquez le point de ramassage: la position de votre exploitation n'est pas renseignée.",
  DROPOFF_REQUIRED: "Choisissez la destination sur la carte.",
  VEHICLE_REQUIRED: "Choisissez le type de véhicule.",
  TARIFF_UNAVAILABLE: "Ce type de véhicule n'est pas proposé pour le moment.",
  TOO_FAR: "La destination est trop éloignée.",
  INVALID_POSITION:
    "Les points de ramassage et de livraison doivent se situer au Gabon.",
  INVALID_CARGO: "Décrivez la marchandise (500 caractères maximum).",
  INVALID_DROPOFF: "Indiquez l'adresse de livraison.",
  FORBIDDEN:
    "Le transport est réservé aux agriculteurs dont le profil a été validé.",
  OFFLINE: "Vous êtes hors ligne. Réessayez dès que la connexion revient.",
  NETWORK_ERROR: "Connexion faible. Réessayez dans un instant.",
};

const errorText = (code: string, fallback: string) =>
  TRANSPORT_ERROR_MESSAGES[code] ?? fallback;

interface TransportOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** manual: chauffeur choisi sur la carte; auto: le plus proche. */
  mode: "manual" | "auto";
  driver?: {
    driver_id: string;
    display_name: string;
    vehicle_type: VehicleType;
  } | null;
  /** Vehicule retenu par le filtre de la page (point de depart du choix en mode automatique). */
  vehicleType: VehicleType | null;
  /** Point de ramassage a envoyer; sans lui le serveur utilise l'exploitation. */
  pickup: TransportPoint | null;
  /** Point central de la carte de choix de la destination. */
  mapCenter: TransportPoint;
  farmAddress?: string;
}

export function TransportOrderDialog({
  open,
  onOpenChange,
  mode,
  driver,
  vehicleType,
  pickup,
  mapCenter,
  farmAddress,
}: TransportOrderDialogProps) {
  const create = useCreateTransportRequest();
  const [cargo, setCargo] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoff, setDropoff] = useState<TransportPoint | null>(null);
  const [pickupAddress, setPickupAddress] = useState(farmAddress ?? "");
  const [autoVehicle, setAutoVehicle] = useState<VehicleType | null>(
    vehicleType,
  );

  const manual = mode === "manual";
  // Le vehicule fixe le tarif: celui du chauffeur choisi, ou celui que l'agriculteur demande.
  const vehicle: VehicleType | null = manual
    ? (driver?.vehicle_type ?? null)
    : autoVehicle;

  // Une nouvelle ouverture repart d'un formulaire propre (sauf l'adresse de l'exploitation).
  useEffect(() => {
    if (open) {
      create.reset();
      setPickupAddress(farmAddress ?? "");
      setAutoVehicle(vehicleType);
      setDropoff(null);
    }
  }, [open]);

  const quote = useTransportQuote({
    vehicleType: vehicle,
    dropoff,
    pickup,
    enabled: open,
  });
  const hasQuote = !!quote.data && !quote.isError;
  const canSubmit =
    cargo.trim().length > 0 &&
    dropoffAddress.trim().length > 0 &&
    !!dropoff &&
    !!vehicle &&
    hasQuote &&
    (!manual || !!driver) &&
    !create.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !dropoff) return;
    const input: CreateTransportRequestInput = {
      mode,
      driverId: manual ? driver?.driver_id : null,
      dropoffAddress: dropoffAddress.trim(),
      dropoff,
      cargoDescription: cargo.trim(),
      vehicleType: vehicle,
      pickup: pickup
        ? { ...pickup, address: pickupAddress.trim() || null }
        : null,
    };
    create.mutate(input, {
      onSuccess: () => {
        setCargo("");
        setDropoffAddress("");
        setDropoff(null);
        onOpenChange(false);
      },
    });
  };

  const error = create.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {manual
                ? `Commander ${driver?.display_name ?? "ce chauffeur"}`
                : "Commander le chauffeur le plus proche"}
            </DialogTitle>
            <DialogDescription>
              {manual
                ? "Le chauffeur choisi a "
                : "Nous proposons la course au chauffeur libre le plus proche, puis au suivant s'il refuse ou ne répond pas. Chaque chauffeur a "}
              {Math.floor(TRANSPORT_PROPOSAL_TTL_SECONDS / 60)} minutes pour
              répondre. Le tarif est fixe et connu avant l&apos;envoi.
            </DialogDescription>
          </DialogHeader>

          {!manual && (
            <div className="space-y-2">
              <Label id="transport-vehicle-label">Type de véhicule</Label>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-labelledby="transport-vehicle-label"
              >
                {VEHICLE_TYPES.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={autoVehicle === type ? "default" : "outline"}
                    aria-pressed={autoVehicle === type}
                    onClick={() => setAutoVehicle(type)}
                  >
                    {vehicleLabel(type)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="transport-cargo">Marchandise à transporter</Label>
            <Textarea
              id="transport-cargo"
              value={cargo}
              onChange={(event) => setCargo(event.target.value)}
              maxLength={500}
              placeholder="Ex.: 40 régimes de bananes, environ 300 kg"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transport-pickup">Adresse de ramassage</Label>
            <Input
              id="transport-pickup"
              value={pickupAddress}
              onChange={(event) => setPickupAddress(event.target.value)}
              placeholder="Votre exploitation"
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground">
              Le chauffeur voit ce point sur sa carte. Son téléphone et le vôtre
              ne sont échangés qu&apos;après acceptation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transport-dropoff">Adresse de livraison</Label>
            <Input
              id="transport-dropoff"
              value={dropoffAddress}
              onChange={(event) => setDropoffAddress(event.target.value)}
              placeholder="Ex.: Marché de Mont-Bouët, Libreville"
              maxLength={300}
              required
            />
            <p className="text-xs text-muted-foreground">
              {dropoff
                ? "Destination placée. Cliquez ailleurs sur la carte pour la déplacer."
                : "Cliquez sur la carte pour placer la destination."}
            </p>
            <TransportMap
              pickup={pickup ?? mapCenter}
              dropoff={dropoff}
              onPick={setDropoff}
              pickupLabel="Ramassage"
              height={240}
            />
          </div>

          <div
            className="rounded-lg border bg-muted/40 p-3 text-sm"
            role="status"
            aria-live="polite"
            data-testid="transport-quote"
          >
            {!vehicle ? (
              <p className="text-muted-foreground">
                Choisissez un type de véhicule pour voir le tarif.
              </p>
            ) : !dropoff ? (
              <p className="text-muted-foreground">
                Placez la destination pour voir le tarif.
              </p>
            ) : quote.isPending ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Calcul du tarif…
              </p>
            ) : quote.isError ? (
              <p className="text-destructive">
                {errorText(
                  quote.error.code,
                  "Impossible de calculer le tarif pour le moment.",
                )}
              </p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    Tarif du chauffeur · {vehicleLabel(quote.data.vehicle_type)}{" "}
                    · {formatDistance(quote.data.distance_km)} environ
                  </span>
                  <span className="text-lg font-semibold">
                    {formatFare(quote.data.fare_amount)}
                  </span>
                </div>
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="transport-quote-fees"
                >
                  Le chauffeur reçoit ce tarif en entier. S&apos;ajoutent à
                  votre charge: la commission Ouyaboung (environ{" "}
                  {formatFare(quote.data.platform_fee)}) et les frais PVIT et
                  opérateur, détaillés avant le paiement.
                </p>
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorText(error.code, error.message)}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
