"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  getTransportPricing,
  updateTransportSettings,
  updateTransportTariff,
  type TransportSettings,
  type TransportTariff,
} from "@/api/transport-pricing.api";
import { vehicleLabel } from "@/lib/driver-presence";
import { estimateTransportFare, formatFare } from "@/lib/transport";

const PRICING_KEY = ["admin", "transport-pricing"] as const;
const PREVIEW_DISTANCES = [5, 25, 100];

class PricingError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message || code);
  }
}

const toInt = (value: string): number =>
  value.trim() === "" ? NaN : Math.trunc(Number(value));

type TariffDraft = {
  base_fee: string;
  price_per_km: string;
  min_fare: string;
  is_active: boolean;
};

const toDraft = (tariff: TransportTariff): TariffDraft => ({
  base_fee: String(tariff.base_fee),
  price_per_km: String(tariff.price_per_km),
  min_fare: String(tariff.min_fare),
  is_active: tariff.is_active,
});

function TariffRow({
  tariff,
  commissionRate,
}: {
  tariff: TransportTariff;
  commissionRate: number;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<TariffDraft>(() => toDraft(tariff));
  const [saved, setSaved] = useState(false);

  // Repart de la valeur serveur quand elle change (apres enregistrement ou rechargement).
  useEffect(() => setDraft(toDraft(tariff)), [tariff]);

  const values = {
    base_fee: toInt(draft.base_fee),
    price_per_km: toInt(draft.price_per_km),
    min_fare: toInt(draft.min_fare),
  };
  const valid = Object.values(values).every(
    (v) => Number.isInteger(v) && v >= 0,
  );
  const dirty =
    draft.base_fee !== String(tariff.base_fee) ||
    draft.price_per_km !== String(tariff.price_per_km) ||
    draft.min_fare !== String(tariff.min_fare) ||
    draft.is_active !== tariff.is_active;

  const save = useMutation<TransportTariff, PricingError>({
    mutationFn: async () => {
      const result = await updateTransportTariff({
        vehicle_type: tariff.vehicle_type,
        ...values,
        is_active: draft.is_active,
      });
      if (!result.success || !result.data)
        throw new PricingError(
          result.error?.code || "FAILED",
          result.error?.message,
        );
      return result.data;
    },
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: PRICING_KEY });
    },
  });

  const preview = useMemo(
    () =>
      valid
        ? PREVIEW_DISTANCES.map(
            (km) =>
              estimateTransportFare({ ...values }, km, commissionRate).fare,
          )
        : [],
    [
      valid,
      values.base_fee,
      values.price_per_km,
      values.min_fare,
      commissionRate,
    ],
  );

  const field = (
    key: "base_fee" | "price_per_km" | "min_fare",
    label: string,
  ) => (
    <div className="space-y-1">
      <Label
        htmlFor={`${tariff.vehicle_type}-${key}`}
        className="text-xs text-muted-foreground"
      >
        {label}
      </Label>
      <Input
        id={`${tariff.vehicle_type}-${key}`}
        inputMode="numeric"
        value={draft[key]}
        onChange={(event) => {
          setSaved(false);
          setDraft({ ...draft, [key]: event.target.value });
        }}
        aria-invalid={!valid && !Number.isInteger(toInt(draft[key]))}
      />
    </div>
  );

  return (
    <Card
      data-testid={`tariff-${tariff.vehicle_type}`}
      className={tariff.is_active ? "" : "opacity-70"}
    >
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{vehicleLabel(tariff.vehicle_type)}</h3>
          <div className="flex items-center gap-2">
            <Label
              htmlFor={`${tariff.vehicle_type}-active`}
              className="text-sm"
            >
              {draft.is_active ? "Proposé" : "Désactivé"}
            </Label>
            <Switch
              id={`${tariff.vehicle_type}-active`}
              checked={draft.is_active}
              onCheckedChange={(checked) => {
                setSaved(false);
                setDraft({ ...draft, is_active: checked });
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {field("base_fee", "Frais de base (FCFA)")}
          {field("price_per_km", "Prix par km (FCFA)")}
          {field("min_fare", "Minimum (FCFA)")}
        </div>

        {preview.length > 0 && (
          <p
            className="text-xs text-muted-foreground"
            data-testid={`preview-${tariff.vehicle_type}`}
          >
            Aperçu:{" "}
            {PREVIEW_DISTANCES.map(
              (km, index) => `${km} km → ${formatFare(preview[index])}`,
            ).join(" · ")}
          </p>
        )}

        {save.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || !valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Enregistrer
          </Button>
          {saved && !dirty && (
            <span
              className="flex items-center gap-1 text-sm text-green-600"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4" /> Enregistré
            </span>
          )}
          {!valid && (
            <span className="text-xs text-destructive">
              Montants entiers positifs uniquement.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsCard({ settings }: { settings: TransportSettings }) {
  const client = useQueryClient();
  const [commission, setCommission] = useState(
    String(Math.round(settings.commission_rate * 1000) / 10),
  );
  const [factor, setFactor] = useState(String(settings.road_distance_factor));
  const [maxKm, setMaxKm] = useState(String(settings.max_distance_km));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCommission(String(Math.round(settings.commission_rate * 1000) / 10));
    setFactor(String(settings.road_distance_factor));
    setMaxKm(String(settings.max_distance_km));
  }, [settings]);

  const rate = Number(commission.replace(",", ".")) / 100;
  const factorNumber = Number(factor.replace(",", "."));
  const maxKmNumber = toInt(maxKm);
  const valid =
    commission.trim() !== "" &&
    rate >= 0 &&
    rate <= 0.5 &&
    factor.trim() !== "" &&
    factorNumber >= 1 &&
    factorNumber <= 3 &&
    Number.isInteger(maxKmNumber) &&
    maxKmNumber >= 1 &&
    maxKmNumber <= 2000;
  const dirty =
    Math.abs(rate - settings.commission_rate) > 1e-9 ||
    factorNumber !== settings.road_distance_factor ||
    maxKmNumber !== settings.max_distance_km;

  const save = useMutation<TransportSettings, PricingError>({
    mutationFn: async () => {
      const result = await updateTransportSettings({
        commission_rate: Math.round(rate * 1000) / 1000,
        road_distance_factor: factorNumber,
        max_distance_km: maxKmNumber,
      });
      if (!result.success || !result.data)
        throw new PricingError(
          result.error?.code || "FAILED",
          result.error?.message,
        );
      return result.data;
    },
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: PRICING_KEY });
    },
  });

  const bind =
    (setter: (value: string) => void) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(false);
      setter(event.target.value);
    };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commission et calcul de distance</CardTitle>
        <CardDescription>
          S&apos;appliquent aux nouvelles demandes. Les courses déjà commandées
          gardent leur tarif.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="commission">Commission plateforme (%)</Label>
            <Input
              id="commission"
              inputMode="decimal"
              value={commission}
              onChange={bind(setCommission)}
            />
            <p className="text-xs text-muted-foreground">
              Entre 0 et 50 %. Retenue sur le tarif, le reste revient au
              chauffeur.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="road-factor">Coefficient de détour routier</Label>
            <Input
              id="road-factor"
              inputMode="decimal"
              value={factor}
              onChange={bind(setFactor)}
            />
            <p className="text-xs text-muted-foreground">
              Multiplie la distance à vol d&apos;oiseau (1 à 3).
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-km">Distance maximale (km)</Label>
            <Input
              id="max-km"
              inputMode="numeric"
              value={maxKm}
              onChange={bind(setMaxKm)}
            />
            <p className="text-xs text-muted-foreground">
              Au-delà, la demande est refusée.
            </p>
          </div>
        </div>

        {save.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={!dirty || !valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Enregistrer
          </Button>
          {saved && !dirty && (
            <span
              className="flex items-center gap-1 text-sm text-green-600"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4" /> Enregistré
            </span>
          )}
          {!valid && (
            <span className="text-xs text-destructive">
              Valeurs hors limites.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminTransportPricingPage() {
  const query = useQuery<
    { tariffs: TransportTariff[]; settings: TransportSettings },
    PricingError
  >({
    queryKey: PRICING_KEY,
    queryFn: async () => {
      const result = await getTransportPricing();
      if (!result.success || !result.data)
        throw new PricingError(
          result.error?.code || "FAILED",
          result.error?.message,
        );
      return result.data;
    },
    retry: (count, error) => error.code !== "FORBIDDEN" && count < 1,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          Tarifs de transport
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Tarif = max(minimum, frais de base + distance × prix au km), arrondi
          aux 50 FCFA supérieurs. Le tarif est figé à la commande.
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
              ? "Seuls les administrateurs peuvent modifier les tarifs."
              : "Impossible de charger les tarifs. Vérifiez votre connexion puis réessayez."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            {query.data.tariffs.map((tariff) => (
              <TariffRow
                key={tariff.vehicle_type}
                tariff={tariff}
                commissionRate={query.data.settings.commission_rate}
              />
            ))}
          </div>
          <SettingsCard settings={query.data.settings} />
        </>
      )}
    </div>
  );
}
