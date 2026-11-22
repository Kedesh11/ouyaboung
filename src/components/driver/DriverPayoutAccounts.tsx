"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAddDriverPayoutAccount,
  useDriverPayoutAccounts,
  useVerifyDriverPayoutAccount,
} from "@/hooks/useDriverPayoutAccounts";
import type { DriverPayoutAccount, PayoutOperator } from "@/services/payout.service";

const STATUS_LABEL: Record<DriverPayoutAccount["verification_status"], string> = {
  verified: "Vérifié",
  pending: "En attente",
  rejected: "Refusé",
  disabled: "Désactivé",
};

const mask = (msisdn: string) => (msisdn.length > 4 ? `${msisdn.slice(0, 3)}••••${msisdn.slice(-2)}` : msisdn);

/** Numéros Mobile Money qui reçoivent le paiement des courses. */
export function DriverPayoutAccounts({ driverId }: { driverId: string | undefined }) {
  const accounts = useDriverPayoutAccounts(driverId);
  const add = useAddDriverPayoutAccount(driverId);
  const verify = useVerifyDriverPayoutAccount(driverId);
  const [operator, setOperator] = useState<PayoutOperator>("airtel");
  const [label, setLabel] = useState("");
  const [msisdn, setMsisdn] = useState("");

  const list = accounts.data ?? [];
  const hasVerified = list.some((account) => account.verification_status === "verified" && account.is_active);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Paiement des courses
        </CardTitle>
        <CardDescription>
          Le numéro Airtel ou Moov qui reçoit votre part de chaque course. Il est vérifié automatiquement auprès de l&apos;opérateur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!accounts.isPending &&
          (hasVerified ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Prêt à être payé</AlertTitle>
              <AlertDescription>Vous pouvez recevoir des demandes de transport.</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Numéro requis</AlertTitle>
              <AlertDescription>
                Sans numéro Mobile Money vérifié, vous n&apos;apparaissez pas sur la carte des agriculteurs et vous ne pouvez pas accepter de course.
              </AlertDescription>
            </Alert>
          ))}

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!msisdn.trim() || add.isPending) return;
            add.mutate(
              { operator, label, msisdn, isDefault: list.length === 0 },
              { onSuccess: () => { setLabel(""); setMsisdn(""); } },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Opérateur">
            <Button type="button" variant={operator === "airtel" ? "default" : "outline"} aria-pressed={operator === "airtel"} onClick={() => setOperator("airtel")}>
              Airtel Money
            </Button>
            <Button type="button" variant={operator === "moov" ? "default" : "outline"} aria-pressed={operator === "moov"} onClick={() => setOperator("moov")}>
              Libertis/Moov Money
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="driver-payout-label">Libellé</Label>
            <Input id="driver-payout-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex: Mon numéro principal" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="driver-payout-msisdn">Numéro Mobile Money</Label>
            <Input
              id="driver-payout-msisdn"
              inputMode="tel"
              value={msisdn}
              onChange={(event) => setMsisdn(event.target.value)}
              placeholder={operator === "airtel" ? "77157904 ou 074787355" : "62053671 ou 066282310"}
            />
            <p className="text-xs text-muted-foreground">Préfixes acceptés: {operator === "airtel" ? "74, 77, 76" : "66, 62, 65"}.</p>
          </div>

          {add.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{add.error.message}</AlertDescription>
            </Alert>
          )}
          {add.data && !add.data.verified && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{add.data.message || "Le numéro n'a pas pu être vérifié."}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={add.isPending || !driverId || !msisdn.trim()} className="w-full">
            {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter et vérifier le numéro
          </Button>
        </form>

        <div className="space-y-3">
          {accounts.isPending ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : accounts.isError ? (
            <p className="text-sm text-destructive">Impossible de charger vos numéros. Vérifiez votre connexion.</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun numéro enregistré.</p>
          ) : (
            list.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" data-testid={`payout-${account.id}`}>
                <div className="min-w-0">
                  <p className="font-medium truncate">{account.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.operator === "airtel" ? "Airtel Money" : "Libertis/Moov Money"} · {mask(account.msisdn)}
                  </p>
                  {account.rejection_reason && <p className="text-xs text-destructive">{account.rejection_reason}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={account.verification_status === "verified" ? "default" : "secondary"}>
                    {STATUS_LABEL[account.verification_status]}
                  </Badge>
                  {(account.verification_status === "pending" || account.verification_status === "rejected") && (
                    <Button type="button" size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate(account.id)}>
                      Vérifier
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
          {verify.error && <p className="text-xs text-destructive">{verify.error.message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Rappel sur le tableau de bord tant qu'aucun numéro n'est vérifié. */
export function DriverPayoutNotice({ driverId }: { driverId: string | undefined }) {
  const accounts = useDriverPayoutAccounts(driverId);
  if (accounts.isPending || accounts.isError) return null;
  if (accounts.data?.some((account) => account.verification_status === "verified" && account.is_active)) return null;

  return (
    <Alert variant="destructive" data-testid="payout-notice">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Ajoutez votre numéro Mobile Money</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Sans numéro vérifié, les agriculteurs ne peuvent pas vous commander et vous ne pouvez pas être payé.</p>
        <Button asChild size="sm" variant="outline">
          <a href="/driver/payments">Ajouter mon numéro</a>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
