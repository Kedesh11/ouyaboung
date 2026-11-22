"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CreateTransportRequestInput } from "@/api/transport.api";
import { useCreateTransportRequest } from "@/hooks/useTransportRequest";
import { TRANSPORT_PROPOSAL_TTL_SECONDS } from "@/lib/transport";
import { vehicleLabel, type VehicleType } from "@/lib/driver-presence";

export const TRANSPORT_ERROR_MESSAGES: Record<string, string> = {
  ACTIVE_REQUEST_EXISTS: "Vous avez déjà une demande de transport en cours.",
  NO_DRIVER_AVAILABLE: "Aucun chauffeur libre pour le moment. Réessayez dans quelques instants.",
  DRIVER_UNAVAILABLE: "Ce chauffeur n'est plus disponible. Choisissez-en un autre.",
  PICKUP_REQUIRED: "Indiquez le point de ramassage: la position de votre exploitation n'est pas renseignée.",
  INVALID_POSITION: "La position de ramassage doit se situer au Gabon.",
  INVALID_CARGO: "Décrivez la marchandise (500 caractères maximum).",
  INVALID_DROPOFF: "Indiquez l'adresse de livraison.",
  FORBIDDEN: "Le transport est réservé aux agriculteurs dont le profil a été validé.",
  OFFLINE: "Vous êtes hors ligne. Réessayez dès que la connexion revient.",
  NETWORK_ERROR: "Connexion faible. Réessayez dans un instant.",
};

interface TransportOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** manual: chauffeur choisi sur la carte; auto: le plus proche. */
  mode: "manual" | "auto";
  driver?: { driver_id: string; display_name: string } | null;
  vehicleType: VehicleType | null;
  /** Point de ramassage a envoyer; sans lui le serveur utilise l'exploitation. */
  pickup: { latitude: number; longitude: number } | null;
  farmAddress?: string;
}

export function TransportOrderDialog({ open, onOpenChange, mode, driver, vehicleType, pickup, farmAddress }: TransportOrderDialogProps) {
  const create = useCreateTransportRequest();
  const [cargo, setCargo] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupAddress, setPickupAddress] = useState(farmAddress ?? "");

  // Une nouvelle ouverture repart d'un formulaire propre (sauf l'adresse de l'exploitation).
  useEffect(() => {
    if (open) {
      create.reset();
      setPickupAddress(farmAddress ?? "");
    }
  }, [open]);

  const manual = mode === "manual";
  const canSubmit = cargo.trim().length > 0 && dropoff.trim().length > 0 && (!manual || !!driver) && !create.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const input: CreateTransportRequestInput = {
      mode,
      driverId: manual ? driver?.driver_id : null,
      dropoffAddress: dropoff.trim(),
      cargoDescription: cargo.trim(),
      vehicleType,
      pickup: pickup ? { ...pickup, address: pickupAddress.trim() || null } : null,
    };
    create.mutate(input, {
      onSuccess: () => {
        setCargo("");
        setDropoff("");
        onOpenChange(false);
      },
    });
  };

  const error = create.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{manual ? `Commander ${driver?.display_name ?? "ce chauffeur"}` : "Commander le chauffeur le plus proche"}</DialogTitle>
            <DialogDescription>
              {manual
                ? "Le chauffeur choisi a "
                : "Nous proposons la course au chauffeur libre le plus proche, puis au suivant s'il refuse ou ne répond pas. Chaque chauffeur a "}
              {Math.floor(TRANSPORT_PROPOSAL_TTL_SECONDS / 60)} minutes pour répondre.
              {vehicleType ? ` Véhicule demandé: ${vehicleLabel(vehicleType)}.` : ""}
            </DialogDescription>
          </DialogHeader>

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
              Le chauffeur voit ce point sur sa carte. Son téléphone et le vôtre ne sont échangés qu&apos;après acceptation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transport-dropoff">Adresse de livraison</Label>
            <Input
              id="transport-dropoff"
              value={dropoff}
              onChange={(event) => setDropoff(event.target.value)}
              placeholder="Ex.: Marché de Mont-Bouët, Libreville"
              maxLength={300}
              required
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{TRANSPORT_ERROR_MESSAGES[error.code] ?? error.message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
