"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, MapPin, MapPinOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useDriverPresence, type PresenceUiStatus } from "@/contexts/DriverPresenceContext";
import { ageSeconds, formatAge } from "@/lib/driver-presence";

const STATUS_LINE: Record<PresenceUiStatus, string> = {
  loading: "Chargement…",
  not_approved: "Disponible après validation de votre profil par l'administration.",
  off: "Vous êtes indisponible : votre position n'est pas partagée.",
  starting: "Recherche de votre position GPS…",
  sharing: "Vous êtes visible des agriculteurs vérifiés.",
  denied: "Localisation refusée : autorisez-la dans les réglages de votre navigateur.",
  unavailable: "Signal GPS indisponible pour le moment. Nouvelle tentative automatique.",
  error: "Connexion faible : nouvelle tentative automatique.",
  state_unavailable: "Impossible de charger votre état de partage. Vérifiez votre connexion.",
};

/** Ce qui est partage: affiche dans le bandeau d'information et dans la fenetre « Ce qui est partage ». */
function SharingDetails() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Quand vous êtes <strong>Disponible</strong>, votre position est partagée en temps réel avec les agriculteurs
        vérifiés, pour qu&apos;ils puissent vous proposer des courses. C&apos;est activé par défaut.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Ils voient votre prénom, l&apos;initiale de votre nom, votre véhicule, votre note, votre numéro de téléphone (pour qu&apos;ils puissent vous appeler) et votre position — jamais votre plaque.</li>
        <li>La position n&apos;est partagée que lorsque l&apos;application est ouverte et que vous êtes disponible.</li>
        <li>Vous pouvez passer indisponible à tout moment avec l&apos;interrupteur : votre dernière position est alors effacée.</li>
        <li>Aucun historique de vos déplacements n&apos;est conservé en dehors des livraisons en cours.</li>
      </ul>
    </div>
  );
}

export function DriverAvailabilityCard() {
  const { status, isAvailable, noticeAcknowledged, lastSentAt, pending, actionError, acknowledgeNotice, setAvailable } =
    useDriverPresence();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Rafraichit l'age affiche de la derniere position envoyee.
  useEffect(() => {
    if (status !== "sharing") return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [status]);

  if (status === "not_approved") {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <MapPinOff className="w-5 h-5 shrink-0" />
          {STATUS_LINE.not_approved}
        </CardContent>
      </Card>
    );
  }

  const loading = status === "loading";
  const problem = status === "unavailable" || status === "error" || status === "state_unavailable";
  // Bandeau d'information: affiche tant que le chauffeur n'a pas dit l'avoir lu. Il ne bloque rien.
  const showNotice = !loading && !noticeAcknowledged && status !== "state_unavailable";

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${status === "sharing" ? "bg-green-100" : "bg-muted"}`}>
                {loading || status === "starting" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : status === "sharing" ? (
                  <MapPin className="w-5 h-5 text-green-600" />
                ) : (
                  <MapPinOff className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Disponibilité</p>
                <p className="text-sm text-muted-foreground" role="status">
                  {STATUS_LINE[status]}
                  {status === "sharing" && lastSentAt && ` Position envoyée ${formatAge(ageSeconds(lastSentAt, now))}.`}
                </p>
              </div>
            </div>

            {!loading && (
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={isAvailable ? "default" : "secondary"}>{isAvailable ? "Disponible" : "Indisponible"}</Badge>
                <Switch
                  aria-label="Disponible pour des courses"
                  checked={isAvailable}
                  disabled={pending || status === "state_unavailable"}
                  onCheckedChange={(checked) => void setAvailable(checked)}
                />
              </div>
            )}
          </div>

          {showNotice && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Votre position est partagée quand vous êtes disponible</AlertTitle>
              <AlertDescription className="space-y-3">
                <SharingDetails />
                <Button type="button" size="sm" onClick={() => void acknowledgeNotice()} disabled={pending}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  J&apos;ai compris
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {status === "denied" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Localisation refusée</AlertTitle>
              <AlertDescription>
                Sans votre position, les agriculteurs ne peuvent pas vous voir. Autorisez la localisation pour ce site dans votre navigateur, puis rechargez la page.
              </AlertDescription>
            </Alert>
          )}

          {problem && status !== "state_unavailable" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {STATUS_LINE[status]}
            </p>
          )}

          {actionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {!loading && noticeAcknowledged && (
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              {status === "sharing" && <CheckCircle2 className="w-3 h-3 text-green-600" />}
              Position partagée uniquement pendant que l&apos;application est ouverte et que vous êtes disponible.
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setDetailsOpen(true)}>
                Ce qui est partagé
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ce qui est partagé</DialogTitle>
            <DialogDescription asChild>
              <div>
                <SharingDetails />
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
