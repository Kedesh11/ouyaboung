"use client";

import { useEffect, useMemo, useRef } from "react";
import MapGL, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MAP_STYLE_URL } from "@/lib/map-style";

interface TransportMapProps {
  pickup: { latitude: number; longitude: number };
  /** Position en direct du chauffeur (agriculteur) ou du chauffeur lui-meme. */
  driver?: { latitude: number; longitude: number } | null;
  pickupLabel?: string;
  driverLabel?: string;
  height?: number;
}

/** Petite carte: point de ramassage et, quand il est connu, le chauffeur. */
const TransportMap = ({
  pickup,
  driver = null,
  pickupLabel = "Point de ramassage",
  driverLabel = "Chauffeur",
  height = 220,
}: TransportMapProps) => {
  const mapRef = useRef<MapRef>(null);

  const initialViewState = useMemo(
    () => ({ longitude: pickup.longitude, latitude: pickup.latitude, zoom: 12 }),
    // Vue initiale seulement: l'ajustement se fait dans l'effet ci-dessous.
    [],
  );

  // Cadre les deux points; sans chauffeur, centre sur le ramassage.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driver) {
      map.flyTo({ center: [pickup.longitude, pickup.latitude], zoom: 13, duration: 600 });
      return;
    }
    map.fitBounds(
      [
        [Math.min(pickup.longitude, driver.longitude), Math.min(pickup.latitude, driver.latitude)],
        [Math.max(pickup.longitude, driver.longitude), Math.max(pickup.latitude, driver.latitude)],
      ],
      { padding: 48, maxZoom: 14, duration: 600 },
    );
  }, [pickup.latitude, pickup.longitude, driver?.latitude, driver?.longitude]);

  return (
    <Card className="overflow-hidden">
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initialViewState}
        style={{ width: "100%", height }}
        mapStyle={MAP_STYLE_URL}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Marker longitude={pickup.longitude} latitude={pickup.latitude} anchor="bottom">
          <div
            className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
            title={pickupLabel}
            aria-label={pickupLabel}
          >
            <MapPin className="w-4 h-4 text-white" />
          </div>
        </Marker>
        {driver && (
          <Marker longitude={driver.longitude} latitude={driver.latitude} anchor="center">
            <div
              className="w-9 h-9 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center"
              title={driverLabel}
              aria-label={driverLabel}
            >
              <Truck className="w-4 h-4 text-white" />
            </div>
          </Marker>
        )}
      </MapGL>
    </Card>
  );
};

export default TransportMap;
