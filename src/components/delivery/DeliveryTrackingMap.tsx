"use client";

// ============================================
// Delivery Tracking Map - Live driver position for a delivery
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { useMemo, useRef } from "react";
import MapGL, { Marker, NavigationControl, MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Sprout, Store } from "lucide-react";

const GABON_CENTER = { longitude: 11.5, latitude: -0.8 };
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface DeliveryTrackingMapProps {
  driverPosition: GeoPoint | null;
  farmerCoords?: GeoPoint | null;
  merchantCoords?: GeoPoint | null;
  driverName?: string;
  className?: string;
}

const isValid = (point?: GeoPoint | null): point is GeoPoint =>
  !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);

const DeliveryTrackingMap = ({
  driverPosition,
  farmerCoords,
  merchantCoords,
  driverName = "Chauffeur",
  className = "",
}: DeliveryTrackingMapProps) => {
  const mapRef = useRef<MapRef>(null);

  const initialViewState = useMemo(() => {
    const center = driverPosition || farmerCoords || merchantCoords;
    if (center) {
      return { longitude: center.longitude, latitude: center.latitude, zoom: 12 };
    }
    return { longitude: GABON_CENTER.longitude, latitude: GABON_CENTER.latitude, zoom: 6 };
  }, [driverPosition, farmerCoords, merchantCoords]);

  return (
    <Card className={`overflow-hidden relative ${className}`}>
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initialViewState}
        style={{ width: "100%", height: 320 }}
        mapStyle={MAP_STYLE}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />

        {isValid(farmerCoords) && (
          <Marker longitude={farmerCoords.longitude} latitude={farmerCoords.latitude} anchor="bottom">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <Sprout className="w-4 h-4 text-white" />
            </div>
          </Marker>
        )}

        {isValid(merchantCoords) && (
          <Marker longitude={merchantCoords.longitude} latitude={merchantCoords.latitude} anchor="bottom">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <Store className="w-4 h-4 text-primary-foreground" />
            </div>
          </Marker>
        )}

        {isValid(driverPosition) && (
          <Marker longitude={driverPosition.longitude} latitude={driverPosition.latitude} anchor="center">
            <div className="w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow ring-4 ring-blue-500/30 flex items-center justify-center" title={driverName}>
              <Truck className="w-3 h-3 text-white" />
            </div>
          </Marker>
        )}
      </MapGL>

      <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur rounded-lg p-2 shadow-lg border text-xs space-y-1">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-600" /> Agriculteur</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-primary" /> Commerce</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Chauffeur</div>
      </div>

      {!isValid(driverPosition) && (
        <Badge variant="secondary" className="absolute top-3 left-3 gap-1">
          <MapPin className="w-3 h-3" />
          En attente de position
        </Badge>
      )}
    </Card>
  );
};

export default DeliveryTrackingMap;
