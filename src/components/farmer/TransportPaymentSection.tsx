"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Smartphone, Timer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FarmerTransportRequest } from "@/api/transport.api";
import { usePayTransport, useSyncTransportPayment } from "@/hooks/useTransportRequest";
import { useNow } from "@/hooks/useNow";
import { PAYMENT_FLOW_ENABLED } from "@/services/payment.service";
import type { TransportPaymentOperator } from "@/services/transport-payment.service";
import { formatCountdown, remainingSeconds } from "@/lib/transport";
import { FeeBreakdownCard } from "@/components/payment/FeeBreakdownCard";
import { useFeeBreakdown } from "@/hooks/useFeeBreakdown";
import { formatXaf } from "@/lib/fees";

export const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  PAYMENT_DISABLED: "Le paiement est temporairement indisponible.",
  PAYMENT_NOT_CONFIGURED: "Le paiement n'est pas encore configuré.",
  PAYMENT_WINDOW_EXPIRED: "Le délai de paiement est dépassé: la course va être annulée.",
  PAYMENT_IN_PROGRESS: "Un paiement est déjà en cours. Validez la demande sur votre téléphone.",
  ALREADY_PAID: "Cette course est déjà payée.",
  INVALID_REQUEST_STATUS: "Cette course n'attend pas de paiement.",
  DRIVER_PAYOUT_NOT_VERIFIED: "Le chauffeur ne peut pas encore recevoir de paiement. Contactez le support.",
  TOO_MANY_ATTEMPTS: "Trop de tentatives. Réessayez dans quelques minutes.",
  INVALID_PHONE_OPERATOR: "Le numéro ne correspond pas à l'opérateur choisi.",
  PROVIDER_UNAVAILABLE: "Le fournisseur de paiement est momentanément indisponible. Réessayez dans un instant.",
  PROVIDER_REJECTED: "Le paiement a été refusé. Vérifiez le numéro puis réessayez.",
  OFFLINE: "Vous êtes hors ligne. Réessayez dès que la connexion revient.",
  NETWORK_ERROR: "Connexion faible. Réessayez dans un instant.",
};

const errorText = (code: string, fallback: string) => PAYMENT_ERROR_MESSAGES[code] ?? fallback;

interface TransportPaymentSectionProps {
  request: FarmerTransportRequest;
  /** Instant de reception de la reponse serveur (pour le compte a rebours). */
  receivedAt: number;
}

/**
 * Paiement de la course acceptee. Aucun paiement ne part sans le clic de l'agriculteur;
 * le tarif affiche est celui fige a la commande.
 */
export function TransportPaymentSection({ request, receivedAt }: TransportPaymentSectionProps) {
  const pay = usePayTransport();
  const sync = useSyncTransportPayment();
  const [phone, setPhone] = useState("");
  const [operator, setOperator] = useState<TransportPaymentOperator>("airtel");

  const awaiting = request.status === "accepted" && request.payment_status !== "paid";
  const now = useNow(1000, awaiting);
  // Detail calcule par le serveur avec les taux du moment (commission, PVIT, operateur choisi).
  const feeQuery = useFeeBreakdown({
    flow: "transport",
    baseAmount: request.fare_amount,
    operator,
    enabled: request.status === "accepted" && request.payment_status === "unpaid",
  });
  const breakdown = feeQuery.data;

  if (request.payment_status === "paid") {
    return (
      <div className="space-y-3" data-testid="transport-paid">
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Course payée{request.payment_breakdown ? ` (${formatXaf(request.payment_breakdown.total_amount)})` : ""}. Le chauffeur peut charger la marchandise.
        </div>
        {request.payment_breakdown && (
          <FeeBreakdownCard breakdown={request.payment_breakdown} recipientLabel="le chauffeur" title="Détail de ce que vous avez payé" settled />
        )}
      </div>
    );
  }

  if (!awaiting) return null;

  const left = remainingSeconds(request.seconds_to_pay, receivedAt, now);
  const expired = left <= 0;
  const pending = request.payment_status === "pending";
  const error = pay.error ?? sync.error;

  if (pending) {
    return (
      <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="transport-payment-pending">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="w-4 h-4" />
          Validez le paiement sur votre téléphone
        </div>
        <p className="text-xs text-muted-foreground">
          Confirmez la demande Mobile Money{request.payment_breakdown ? ` de ${formatXaf(request.payment_breakdown.total_amount)}` : ""}. Cette page se met à jour dès que le paiement est reçu.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorText(error.code, error.message)}</AlertDescription>
          </Alert>
        )}
        {request.payment_reference && (
          <Button type="button" size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(request.payment_reference as string)}>
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Vérifier le paiement
          </Button>
        )}
      </div>
    );
  }

  const phoneValid = phone.replace(/\D/g, "").length >= 8;

  return (
    <form
      className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
      data-testid="transport-payment-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!phoneValid || expired || pay.isPending || !PAYMENT_FLOW_ENABLED || !breakdown) return;
        pay.mutate({ requestId: request.id, phone, operator });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Payer la course</p>
        <Badge variant={expired ? "secondary" : "default"} className="gap-1" role="timer">
          <Timer className="w-3 h-3" />
          {expired ? "Délai dépassé" : formatCountdown(left)}
        </Badge>
      </div>

      <FeeBreakdownCard
        breakdown={breakdown}
        recipientLabel="le chauffeur"
        loading={feeQuery.isPending && feeQuery.fetchStatus !== "idle"}
        error={feeQuery.isError ? "Impossible de calculer les frais pour le moment. Réessayez dans un instant." : null}
      />

      <div className="flex gap-2" role="group" aria-label="Opérateur Mobile Money">
        <Button type="button" size="sm" variant={operator === "airtel" ? "default" : "outline"} aria-pressed={operator === "airtel"} onClick={() => setOperator("airtel")}>
          Airtel Money
        </Button>
        <Button type="button" size="sm" variant={operator === "moov" ? "default" : "outline"} aria-pressed={operator === "moov"} onClick={() => setOperator("moov")}>
          Moov Money
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="transport-pay-phone">Numéro Mobile Money</Label>
        <Input
          id="transport-pay-phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder={operator === "airtel" ? "074 12 34 56" : "062 12 34 56"}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>

      {!PAYMENT_FLOW_ENABLED && <p className="text-xs text-amber-700">Le paiement est temporairement indisponible.</p>}
      {expired && <p className="text-xs text-destructive">{PAYMENT_ERROR_MESSAGES.PAYMENT_WINDOW_EXPIRED}</p>}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorText(error.code, error.message)}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={!phoneValid || expired || pay.isPending || !PAYMENT_FLOW_ENABLED || !breakdown}>
        {pay.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {breakdown ? `Payer ${formatXaf(breakdown.total_amount)}` : "Calcul du total…"}
      </Button>
    </form>
  );
}
