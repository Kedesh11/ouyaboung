"use client";

import { AlertCircle, Info, Loader2 } from "lucide-react";
import type { FeeBreakdown } from "@/api/fees.api";
import { useFeeBreakdown } from "@/hooks/useFeeBreakdown";
import { formatPercent, formatXaf, operatorLabel } from "@/lib/fees";
import type { FeeFlow, FeeOperator } from "@/api/fees.api";

/** Detail affichable: les taux sont absents des anciens paiements (seuls les montants sont connus). */
export type FeeBreakdownView = Omit<FeeBreakdown, "rates"> & { rates?: FeeBreakdown["rates"] };

interface FeeBreakdownCardProps {
  breakdown: FeeBreakdownView | null | undefined;
  /** Qui recoit le prix: "Marchand", "Chauffeur"... */
  recipientLabel: string;
  title?: string;
  loading?: boolean;
  error?: string | null;
  /** Detail deja paye (historique): le titre et la mention d'estimation changent. */
  settled?: boolean;
}

function Row({ label, hint, amount, strong = false, testId }: { label: string; hint?: string; amount: number; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${strong ? "border-t pt-2 mt-1 text-base font-bold" : "text-sm"}`} data-testid={testId}>
      <div className="min-w-0">
        <p className={strong ? "" : "text-foreground"}>{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={`shrink-0 tabular-nums ${strong ? "text-primary" : ""}`}>{formatXaf(amount)}</p>
    </div>
  );
}

/**
 * Detail de ce que paie le client et de qui prelève quoi: le marchand / chauffeur, la plateforme,
 * PVIT et l'operateur Mobile Money. Presentational: les montants viennent du serveur.
 */
export function FeeBreakdownCard({ breakdown, recipientLabel, title = "Détail du paiement", loading = false, error = null, settled = false }: FeeBreakdownCardProps) {
  return (
    <section className="rounded-lg border bg-muted/40 p-4 space-y-3" aria-label={title} data-testid="fee-breakdown">
      <h3 className="text-sm font-semibold">{title}</h3>

      {loading && !breakdown ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Calcul des frais…
        </p>
      ) : error && !breakdown ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      ) : breakdown ? (
        <>
          <div className="space-y-2">
            <Row
              label={`Prix — reçu par: ${recipientLabel}`}
              hint="Versé en intégralité, sans prélèvement."
              amount={breakdown.base_amount}
              testId="fee-base"
            />
            <Row
              label="Commission Ouyaboung"
              hint={breakdown.rates ? `${formatPercent(breakdown.rates.platform)} du prix · payée par vous` : "Payée par vous"}
              amount={breakdown.platform_fee}
              testId="fee-platform"
            />
            <Row
              label="Frais PVIT"
              hint={breakdown.rates ? `${formatPercent(breakdown.rates.pvit)} · passerelle de paiement` : "Passerelle de paiement"}
              amount={breakdown.pvit_fee}
              testId="fee-pvit"
            />
            <Row
              label={`Frais ${operatorLabel(breakdown.operator)}`}
              hint={breakdown.rates ? `${formatPercent(breakdown.rates.operator)} · opérateur Mobile Money` : "Opérateur Mobile Money"}
              amount={breakdown.operator_fee}
              testId="fee-operator"
            />
            <Row label={settled ? "Total payé" : "Total à payer"} amount={breakdown.total_amount} strong testId="fee-total" />
          </div>
          {breakdown.fees_estimated && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                {settled
                  ? "Frais PVIT et opérateur: estimation au moment du paiement."
                  : "Les frais PVIT et opérateur sont une estimation. Les taux sont fixés par la plateforme et peuvent changer: vous en êtes informé."}
              </span>
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

interface LiveProps {
  flow: FeeFlow;
  baseAmount: number | null | undefined;
  operator: FeeOperator;
  recipientLabel: string;
  title?: string;
}

/** Carte branchee sur le serveur: recalcule quand l'operateur change ou que les taux evoluent. */
export function FeeBreakdownLive({ flow, baseAmount, operator, recipientLabel, title }: LiveProps) {
  const query = useFeeBreakdown({ flow, baseAmount, operator });
  return (
    <FeeBreakdownCard
      breakdown={query.data}
      recipientLabel={recipientLabel}
      title={title}
      loading={query.isPending && query.fetchStatus !== "idle"}
      error={query.isError ? "Impossible de calculer les frais pour le moment. Réessayez dans un instant." : null}
    />
  );
}
