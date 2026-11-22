"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Star,
  Truck,
  WifiOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useAvailableDrivers } from "@/hooks/useAvailableDrivers";
import { useMyTransportRequest } from "@/hooks/useTransportRequest";
import { isActiveTransport } from "@/lib/transport";
import { TransportOrderDialog } from "@/components/farmer/TransportOrderDialog";
import { TransportRequestPanel } from "@/components/farmer/TransportRequestPanel";
import {
  formatAge,
  formatDistance,
  VEHICLE_TYPES,
  vehicleLabel,
  type VehicleType,
} from "@/lib/driver-presence";
import { DEFAULT_MAP_CENTER } from "@/lib/map-style";
import {
  getCachedUserLocation,
  getMyFarmerProfile,
  isValidCoordinate,
  isWithinGabonBounds,
} from "@/services";
import type { MapDriver } from "@/components/farmer/AvailableDriversMap";

const AvailableDriversMap = dynamic(
  () => import("@/components/farmer/AvailableDriversMap"),
  {
    ssr: false,
    loading: () => (
      <Card className="h-[480px] flex items-center justify-center bg-muted/50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </Card>
    ),
  },
);

const RADIUS_OPTIONS = [5, 10, 25, 50];
const DEFAULT_RADIUS_KM = 25;
const CLOCK_TICK_MS = 5_000;

type Center = { latitude: number; longitude: number };

export default function FarmerTransportPage() {
  const { user } = useAuth();
  const [center, setCenter] = useState<Center | null>(null);
  const [centerLabel, setCenterLabel] = useState("");
  // D'ou vient le centre: l'exploitation (le serveur la connait), la position de l'appareil, ou le defaut.
  const [centerSource, setCenterSource] = useState<
    "farm" | "device" | "default"
  >("default");
  const [farmAddress, setFarmAddress] = useState("");
  const [orderMode, setOrderMode] = useState<"manual" | "auto" | null>(null);
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(
    null,
  );
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Point de reference: l'exploitation de l'agriculteur, sinon sa derniere position connue, sinon Libreville.
  useEffect(() => {
    let cancelled = false;
    const resolveCenter = async () => {
      if (user?.id) {
        const profile = await getMyFarmerProfile(user.id);
        const lat = profile.data?.latitude;
        const lng = profile.data?.longitude;
        if (!cancelled && isWithinGabonBounds(lat, lng)) {
          setCenter({ latitude: lat as number, longitude: lng as number });
          setCenterLabel("votre exploitation");
          setCenterSource("farm");
          setFarmAddress(profile.data?.address ?? "");
          return;
        }
      }
      const cached = getCachedUserLocation();
      if (
        !cancelled &&
        cached &&
        isValidCoordinate(cached.latitude, cached.longitude)
      ) {
        setCenter({ latitude: cached.latitude, longitude: cached.longitude });
        setCenterLabel("votre position");
        setCenterSource("device");
        return;
      }
      if (!cancelled) {
        setCenter(DEFAULT_MAP_CENTER);
        setCenterLabel(
          "Libreville (position de votre exploitation non renseignée)",
        );
      }
    };
    void resolveCenter();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Horloge locale: fait vieillir les positions affichees entre deux reponses du serveur.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const query = useAvailableDrivers({ center, radiusKm, vehicleType });
  const transport = useMyTransportRequest();
  const request = transport.data ?? null;
  const hasActiveRequest = isActiveTransport(request?.status);
  const visibleRequest =
    request && (hasActiveRequest || request.id !== dismissedRequestId)
      ? request
      : null;

  const drivers = useMemo<MapDriver[]>(() => {
    const elapsed = query.dataUpdatedAt
      ? Math.max(0, (now - query.dataUpdatedAt) / 1000)
      : 0;
    return (
      (query.data ?? [])
        .map((driver) => {
          const displayAge = driver.age_seconds + elapsed;
          return { ...driver, displayAge, stale: displayAge >= 120 };
        })
        // Une position trop ancienne n'est plus fiable: le serveur la masque, on fait pareil entre deux reponses.
        .filter((driver) => !driver.stale)
    );
  }, [query.data, query.dataUpdatedAt, now]);

  // Selection invalide (chauffeur parti ou filtre change): on la lache.
  useEffect(() => {
    if (
      selectedDriverId &&
      !drivers.some((d) => d.driver_id === selectedDriverId)
    )
      setSelectedDriverId(null);
  }, [drivers, selectedDriverId]);

  const errorCode = query.error?.code;
  const forbidden = errorCode === "FORBIDDEN";
  const hasData = (query.data?.length ?? 0) > 0 || query.isSuccess;
  const lastUpdateAge = query.dataUpdatedAt
    ? Math.max(0, Math.floor((now - query.dataUpdatedAt) / 1000))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          Transport
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Chauffeurs libres et opérationnels près de {centerLabel || "vous"}, en
          temps réel.
        </p>
      </div>

      {forbidden ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Accès réservé</AlertTitle>
          <AlertDescription>
            Le transport est réservé aux agriculteurs dont le profil a été
            validé.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {visibleRequest && (
            <TransportRequestPanel
              request={visibleRequest}
              receivedAt={transport.dataUpdatedAt}
              onDismiss={() => setDismissedRequestId(visibleRequest.id)}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Type de véhicule"
            >
              <Button
                type="button"
                size="sm"
                variant={vehicleType === null ? "default" : "outline"}
                onClick={() => setVehicleType(null)}
              >
                Tous
              </Button>
              {VEHICLE_TYPES.filter((type) => type !== "other").map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={vehicleType === type ? "default" : "outline"}
                  onClick={() => setVehicleType(type)}
                >
                  {vehicleLabel(type)}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                size="sm"
                disabled={hasActiveRequest || !center}
                onClick={() => setOrderMode("auto")}
              >
                <Truck className="w-4 h-4 mr-2" />
                Le plus proche
              </Button>
              <Select
                value={String(radiusKm)}
                onValueChange={(value) => setRadiusKm(Number(value))}
              >
                <SelectTrigger
                  className="w-[130px]"
                  aria-label="Rayon de recherche"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} km
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Actualiser"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw
                  className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            {query.isPending && !query.data ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Recherche des
                chauffeurs…
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                <span>
                  {drivers.length} chauffeur{drivers.length > 1 ? "s" : ""}{" "}
                  libre{drivers.length > 1 ? "s" : ""} dans {radiusKm} km
                </span>
                {lastUpdateAge !== null && (
                  <span>· mis à jour {formatAge(lastUpdateAge)}</span>
                )}
              </>
            )}
            {query.isError && hasData && (
              <span className="flex items-center gap-1 text-amber-700">
                <WifiOff className="w-4 h-4" /> Connexion faible : dernière
                liste connue affichée.
              </span>
            )}
          </div>

          {query.isError && !query.data && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Chauffeurs indisponibles</AlertTitle>
              <AlertDescription>
                Impossible de charger les chauffeurs. Vérifiez votre connexion;
                la recherche reprend automatiquement.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {center && (
                <AvailableDriversMap
                  center={center}
                  drivers={drivers}
                  selectedDriverId={selectedDriverId}
                  onSelect={setSelectedDriverId}
                />
              )}
            </div>

            <div
              className="space-y-3 lg:max-h-[480px] lg:overflow-y-auto"
              aria-label="Liste des chauffeurs"
            >
              {drivers.length === 0 &&
                !query.isPending &&
                !(query.isError && !query.data) && (
                  <Card>
                    <CardContent className="p-6 text-center text-sm text-muted-foreground space-y-2">
                      <MapPin className="w-8 h-8 mx-auto opacity-50" />
                      <p>Aucun chauffeur libre dans ce rayon pour le moment.</p>
                      {radiusKm < RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1] && (
                        <p>Essayez d&apos;élargir le rayon.</p>
                      )}
                    </CardContent>
                  </Card>
                )}

              {drivers.map((driver) => {
                const isSelected = driver.driver_id === selectedDriverId;
                return (
                  <div key={driver.driver_id} className="space-y-1">
                    <button
                      type="button"
                      data-testid={`driver-card-${driver.driver_id}`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelectedDriverId(
                          isSelected ? null : driver.driver_id,
                        )
                      }
                      className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {driver.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {vehicleLabel(driver.vehicle_type)} · position{" "}
                            {formatAge(driver.displayAge)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {formatDistance(driver.distance_km)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="w-3 h-3 text-amber-500" />
                        {driver.total_reviews > 0 ? (
                          <span>
                            {Number(driver.rating).toFixed(1)} (
                            {driver.total_reviews} avis)
                          </span>
                        ) : (
                          <span>Nouveau chauffeur</span>
                        )}
                      </div>
                    </button>
                    {isSelected && (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={hasActiveRequest}
                        onClick={() => setOrderMode("manual")}
                      >
                        Commander ce chauffeur
                      </Button>
                    )}
                    {driver.phone && (
                      <a
                        href={`tel:${driver.phone.replace(/[^\d+]/g, "")}`}
                        aria-label={`Appeler ${driver.display_name}`}
                        className="inline-flex items-center gap-1 px-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        {driver.phone}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <TransportOrderDialog
        open={orderMode !== null}
        onOpenChange={(open) => !open && setOrderMode(null)}
        mode={orderMode ?? "auto"}
        driver={
          orderMode === "manual"
            ? (drivers.find((d) => d.driver_id === selectedDriverId) ?? null)
            : null
        }
        vehicleType={vehicleType}
        pickup={centerSource === "device" ? center : null}
        farmAddress={farmAddress}
      />
    </div>
  );
}
