"use client";

import { useEffect, useMemo, useRef } from "react";
import MapGL, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bike, Car, Sprout, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MAP_STYLE_URL } from "@/lib/map-style";
import { vehicleLabel } from "@/lib/driver-presence";
import type { AvailableDriver } from "@/api/driver-presence.api";

export type MapDriver = AvailableDriver & {
  /** Anciennete de la position a l'instant present (donnee serveur + temps ecoule depuis la reponse). */
  displayAge: number;
  stale: boolean;
};

interface AvailableDriversMapProps {
  center: { latitude: number; longitude: number };
  drivers: MapDriver[];
  selectedDriverId: string | null;
  onSelect: (driverId: string | null) => void;
  className?: string;
}

const VehicleIcon = ({ type }: { type: string }) => {
  if (type === "moto" || type === "tricycle") return <Bike className="w-4 h-4 text-white" />;
  if (type === "voiture") return <Car className="w-4 h-4 text-white" />;
  return <Truck className="w-4 h-4 text-white" />;
};

const AvailableDriversMap = ({ center, drivers, selectedDriverId, onSelect, className = "" }: AvailableDriversMapProps) => {
  const mapRef = useRef<MapRef>(null);

  const initialViewState = useMemo(
    () => ({ longitude: center.longitude, latitude: center.latitude, zoom: 11 }),
    // Vue initiale seulement: les changements de centre sont geres par l'effet ci-dessous.
    [],
  );

  // Recentre la carte quand le point de reference change (ex. position de l'exploitation obtenue apres le chargement).
  useEffect(() => {
    mapRef.current?.flyTo({ center: [center.longitude, center.latitude], zoom: 11, duration: 800 });
  }, [center.latitude, center.longitude]);

  const selected = drivers.find((d) => d.driver_id === selectedDriverId);
  useEffect(() => {
    if (!selected) return;
    mapRef.current?.flyTo({ center: [selected.longitude, selected.latitude], zoom: 13, duration: 600 });
  }, [selected?.driver_id]);

  return (
    <Card className={`overflow-hidden relative ${className}`}>
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initialViewState}
        style={{ width: "100%", height: 480 }}
        mapStyle={MAP_STYLE_URL}
        attributionControl={false}
        onClick={() => onSelect(null)}
      >
        <NavigationControl position="top-right" />

        <Marker longitude={center.longitude} latitude={center.latitude} anchor="bottom">
          <div
            className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
            title="Votre exploitation"
          >
            <Sprout className="w-4 h-4 text-white" />
          </div>
        </Marker>

        {drivers.map((driver) => {
          const isSelected = driver.driver_id === selectedDriverId;
          return (
            <Marker key={driver.driver_id} longitude={driver.longitude} latitude={driver.latitude} anchor="center">
              <button
                type="button"
                data-testid={`driver-marker-${driver.driver_id}`}
                aria-label={`${driver.display_name}, ${vehicleLabel(driver.vehicle_type)}`}
                aria-pressed={isSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(driver.driver_id);
                }}
                className={`w-9 h-9 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center transition-transform hover:scale-110 ${
                  isSelected ? "ring-4 ring-blue-500/40 scale-110" : ""
                } ${driver.stale ? "opacity-50" : ""}`}
              >
                <VehicleIcon type={driver.vehicle_type} />
              </button>
            </Marker>
          );
        })}
      </MapGL>

      <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur rounded-lg p-2 shadow-lg border text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-600" /> Votre exploitation
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Chauffeur libre
        </div>
      </div>
    </Card>
  );
};

export default AvailableDriversMap;
