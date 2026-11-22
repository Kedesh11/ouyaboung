"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  History as HistoryIcon,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminFeeSettings,
  updateFeeSettings,
  type FeeChange,
  type FeeHistoryEntry,
  type FeeSettings,
  type FeeSettingsInput,
} from "@/api/fees.api";
import {
  FEE_FIELD_LABEL,
  formatPercent,
  formatXaf,
  previewFeeBreakdown,
} from "@/lib/fees";

const FEES_KEY = ["admin", "fee-settings"] as const;
const PREVIEW_AMOUNT = 10_000;

class FeesError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message || code);
  }
}

type FieldKey = keyof FeeSettingsInput;

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  hint: string;
  max: number;
  group: "commission" | "fees";
}> = [
  {
    key: "order_commission_rate",
    label: "Commission sur les commandes (%)",
    hint: "Payée par le consommateur, en plus du prix. Le marchand reçoit son prix en entier.",
    max: 50,
    group: "commission",
  },
  {
    key: "transport_commission_rate",
    label: "Commission sur les transports (%)",
    hint: "Payée par l'agriculteur, en plus du tarif. Le chauffeur reçoit son tarif en entier.",
    max: 50,
    group: "commission",
  },
  {
    key: "pvit_fee_rate",
    label: "Frais PVIT (%)",
    hint: "Passerelle de paiement. Estimation facturée au client.",
    max: 20,
    group: "fees",
  },
  {
    key: "airtel_fee_rate",
    label: "Frais Airtel Money (%)",
    hint: "Opérateur du client. Estimation facturée au client.",
    max: 20,
    group: "fees",
  },
  {
    key: "moov_fee_rate",
    label: "Frais Moov Money (%)",
    hint: "Opérateur du client. Estimation facturée au client.",
    max: 20,
    group: "fees",
  },
];

// Saisie en pourcentage -> taux (null si invalide).
const parsePercent = (value: string, max: number): number | null => {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  const percent = Number(text);
  if (!Number.isFinite(percent) || percent < 0 || percent > max) return null;
  return Math.round(percent * 100) / 10_000;
};

const toInput = (settings: FeeSettings): Record<FieldKey, string> => ({
  order_commission_rate: String(
    Math.round(settings.order_commission_rate * 10_000) / 100,
  ),
  transport_commission_rate: String(
    Math.round(settings.transport_commission_rate * 10_000) / 100,
  ),
  pvit_fee_rate: String(Math.round(settings.pvit_fee_rate * 10_000) / 100),
  airtel_fee_rate: String(Math.round(settings.airtel_fee_rate * 10_000) / 100),
  moov_fee_rate: String(Math.round(settings.moov_fee_rate * 10_000) / 100),
});

function ChangeList({ changes }: { changes: FeeChange[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {changes.map((change) => (
        <li key={change.field}>
          <span className="font-medium">
            {change.label ?? FEE_FIELD_LABEL[change.field]}
          </span>
          : {formatPercent(change.old)} → {formatPercent(change.new)}
        </li>
      ))}
    </ul>
  );
}

function FeeForm({ settings }: { settings: FeeSettings }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Record<FieldKey, string>>(() =>
    toInput(settings),
  );
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{
    notified: number;
    changed: boolean;
  } | null>(null);

  useEffect(() => setDraft(toInput(settings)), [settings]);

  const parsed = useMemo(() => {
    const out: Partial<Record<FieldKey, number>> = {};
    let valid = true;
    for (const field of FIELDS) {
      const rate = parsePercent(draft[field.key], field.max);
      if (rate === null) valid = false;
      else out[field.key] = rate;
    }
    return { rates: out as FeeSettingsInput, valid };
  }, [draft]);

  const changes = useMemo<FeeChange[]>(() => {
    if (!parsed.valid) return [];
    return FIELDS.filter(
      (field) =>
        Math.round(parsed.rates[field.key] * 10_000) !==
        Math.round(settings[field.key] * 10_000),
    ).map((field) => ({
      field: field.key,
      label: FEE_FIELD_LABEL[field.key],
      old: settings[field.key],
      new: parsed.rates[field.key],
    }));
  }, [parsed, settings]);

  const save = useMutation<{ changed: boolean; notified: number }, FeesError>({
    mutationFn: async () => {
      const response = await updateFeeSettings(parsed.rates);
      if (!response.success || !response.data)
        throw new FeesError(
          response.error?.code || "FAILED",
          response.error?.message,
        );
      return response.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setConfirming(false);
      void client.invalidateQueries({ queryKey: FEES_KEY });
    },
  });

  const bind =
    (key: FieldKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setResult(null);
      setConfirming(false);
      setDraft({ ...draft, [key]: event.target.value });
    };

  const previewFor = (
    flow: "order" | "transport",
    operator: "airtel" | "moov",
  ) =>
    parsed.valid
      ? previewFeeBreakdown(parsed.rates, flow, PREVIEW_AMOUNT, operator)
      : null;

  const group = (
    name: "commission" | "fees",
    title: string,
    description: string,
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-4">
        {FIELDS.filter((field) => field.group === name).map((field) => {
          const invalid = parsePercent(draft[field.key], field.max) === null;
          return (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                inputMode="decimal"
                value={draft[field.key]}
                onChange={bind(field.key)}
                aria-invalid={invalid}
              />
              <p
                className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}
              >
                {invalid
                  ? `Valeur comprise entre 0 et ${field.max} %.`
                  : field.hint}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {group(
        "commission",
        "Commissions de la plateforme",
        "Toutes les commissions sont payées par le client, jamais prélevées sur le marchand ou le chauffeur.",
      )}
      {group(
        "fees",
        "Frais des opérateurs",
        "Estimations affichées et facturées au client. PVIT prélève ses frais réels sur le compte de la plateforme.",
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Aperçu pour {formatXaf(PREVIEW_AMOUNT)}
          </CardTitle>
          <CardDescription>
            Ce que paiera le client avec les valeurs saisies (client Airtel /
            client Moov).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          {(["order", "transport"] as const).map((flow) => {
            const airtel = previewFor(flow, "airtel");
            const moov = previewFor(flow, "moov");
            return (
              <div
                key={flow}
                className="rounded-lg border p-3 space-y-1"
                data-testid={`preview-${flow}`}
              >
                <p className="font-medium">
                  {flow === "order" ? "Commande de produits" : "Transport"}
                </p>
                {airtel && moov ? (
                  <>
                    <p>
                      Commission: {formatXaf(airtel.platform)} · PVIT:{" "}
                      {formatXaf(airtel.pvit)}
                    </p>
                    <p>
                      Airtel: +{formatXaf(airtel.operator)} →{" "}
                      <strong data-testid={`preview-${flow}-airtel`}>
                        {formatXaf(airtel.total)}
                      </strong>
                    </p>
                    <p>
                      Moov: +{formatXaf(moov.operator)} →{" "}
                      <strong data-testid={`preview-${flow}-moov`}>
                        {formatXaf(moov.total)}
                      </strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Le marchand / chauffeur reçoit {formatXaf(PREVIEW_AMOUNT)}
                      .
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Saisissez des valeurs valides.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {save.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert role="status">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>
            {result.changed ? "Frais enregistrés" : "Aucun changement"}
          </AlertTitle>
          <AlertDescription>
            {result.changed
              ? `${result.notified} utilisateur${result.notified > 1 ? "s ont" : " a"} été informé${result.notified > 1 ? "s" : ""} sur la plateforme.`
              : "Les valeurs saisies sont déjà en vigueur."}
          </AlertDescription>
        </Alert>
      )}

      {confirming && changes.length > 0 ? (
        <Alert data-testid="fee-confirmation">
          <BellRing className="h-4 w-4" />
          <AlertTitle>Confirmer le changement</AlertTitle>
          <AlertDescription className="space-y-3">
            <ChangeList changes={changes} />
            <p className="text-sm">
              Tous les utilisateurs de la plateforme (consommateurs, marchands,
              agriculteurs, chauffeurs) recevront une notification. Les
              paiements suivants utiliseront ces taux.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirmer et notifier tout le monde
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setConfirming(false)}
              >
                Annuler
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={!parsed.valid || changes.length === 0}
            onClick={() => setConfirming(true)}
          >
            Enregistrer
          </Button>
          {!parsed.valid && (
            <span className="text-xs text-destructive">
              Corrigez les valeurs en rouge.
            </span>
          )}
          {parsed.valid && changes.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Aucune modification.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function History({ history }: { history: FeeHistoryEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="w-4 h-4" /> Historique des changements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun changement enregistré.
          </p>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border p-3 space-y-1"
              data-testid="fee-history-entry"
            >
              <p className="text-xs text-muted-foreground">
                {new Date(entry.changed_at).toLocaleString("fr-FR")} ·{" "}
                {entry.changed_by_name ?? "Administrateur"}
              </p>
              <ChangeList changes={entry.changes} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminFeesPage() {
  const query = useQuery<
    { settings: FeeSettings; history: FeeHistoryEntry[] },
    FeesError
  >({
    queryKey: FEES_KEY,
    queryFn: async () => {
      const result = await getAdminFeeSettings();
      if (!result.success || !result.data)
        throw new FeesError(
          result.error?.code || "FAILED",
          result.error?.message,
        );
      return result.data;
    },
    retry: (count, error) => error.code !== "FORBIDDEN" && count < 1,
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          Frais &amp; commissions
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Le client paie le prix, la commission de la plateforme et les frais
          des opérateurs. Le marchand ou le chauffeur reçoit son prix en entier.
          Chaque modification est notifiée à tous les utilisateurs.
        </p>
      </div>

      {query.isPending ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {query.error.code === "FORBIDDEN"
              ? "Accès réservé"
              : "Chargement impossible"}
          </AlertTitle>
          <AlertDescription>
            {query.error.code === "FORBIDDEN"
              ? "Seuls les administrateurs peuvent modifier les frais."
              : "Impossible de charger les frais. Vérifiez votre connexion puis réessayez."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <FeeForm settings={query.data.settings} />
          <History history={query.data.history} />
        </>
      )}
    </div>
  );
}
