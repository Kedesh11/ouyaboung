"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import MapGL, {
    Layer,
    Marker,
    Popup,
    NavigationControl,
    Source,
    MapRef
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Store, Loader2 } from "lucide-react";
import type { FoodItem, GabonCity } from "@/types";
import { formatLocationAccuracy, isValidCoordinate } from "@/services";
import type { UserGeolocation } from "@/services";

// Gabon center and city coordinates
const GABON_CENTER = { longitude: 11.5, latitude: -0.8 };

const GABON_CITIES_COORDS: Record<GabonCity, { latitude: number; longitude: number }> = {
    'Libreville': { latitude: 0.4162, longitude: 9.4673 },
    'Port-Gentil': { latitude: -0.7193, longitude: 8.7815 },
    'Franceville': { latitude: -1.6333, longitude: 13.5833 },
    'Oyem': { latitude: 1.6167, longitude: 11.5833 },
    'Moanda': { latitude: -1.5667, longitude: 13.2 },
    'Mouila': { latitude: -1.8667, longitude: 11.0167 },
    'Lambaréné': { latitude: -0.7, longitude: 10.2333 },
    'Tchibanga': { latitude: -2.85, longitude: 11.0333 },
    'Koulamoutou': { latitude: -1.1333, longitude: 12.4667 },
    'Makokou': { latitude: 0.5667, longitude: 12.8667 },
};

// Free OpenStreetMap tile style
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

type StoreMapEntry = {
    id: string;
    merchant: NonNullable<FoodItem["merchant"]>;
    items: FoodItem[];
    coords: { latitude: number; longitude: number };
    totalQuantity: number;
    lowestPrice: number;
};

const createRadiusPolygon = (
    center: { latitude: number; longitude: number },
    radiusKm: number,
    points: number = 96
) => {
    const earthRadiusKm = 6371;
    const coordinates: [number, number][] = [];
    const latRad = (center.latitude * Math.PI) / 180;
    const lngRad = (center.longitude * Math.PI) / 180;
    const angularDistance = radiusKm / earthRadiusKm;

    for (let i = 0; i <= points; i += 1) {
        const bearing = (i / points) * 2 * Math.PI;
        const pointLat = Math.asin(
            Math.sin(latRad) * Math.cos(angularDistance) +
            Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
        );
        const pointLng =
            lngRad +
            Math.atan2(
                Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
                Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
            );

        coordinates.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI]);
    }

    return {
        type: "FeatureCollection" as const,
        features: [
            {
                type: "Feature" as const,
                properties: {},
                geometry: {
                    type: "Polygon" as const,
                    coordinates: [coordinates],
                },
            },
        ],
    };
};

interface GabonMapGLProps {
    items: FoodItem[];
    selectedCity?: GabonCity | "";
    userLocation?: UserGeolocation | null;
    radiusKm?: number;
    radiusOptions?: number[];
    onRadiusChange?: (radiusKm: number) => void;
    onItemSelect?: (item: FoodItem) => void;
    className?: string;
}

const GabonMapGL = ({
    items,
    selectedCity,
    userLocation,
    radiusKm = 10,
    radiusOptions = [2, 5, 10],
    onRadiusChange,
    onItemSelect,
    className = "",
}: GabonMapGLProps) => {
    const mapRef = useRef<MapRef>(null);
    const [popupInfo, setPopupInfo] = useState<StoreMapEntry | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // Calculate initial view based on selected city
    const initialViewState = useMemo(() => {
        if (userLocation) {
            return {
                longitude: userLocation.longitude,
                latitude: userLocation.latitude,
                zoom: 11,
            };
        }
        if (selectedCity && selectedCity in GABON_CITIES_COORDS) {
            const coords = GABON_CITIES_COORDS[selectedCity as GabonCity];
            return {
                longitude: coords.longitude,
                latitude: coords.latitude,
                zoom: 12,
            };
        }
        return {
            longitude: GABON_CENTER.longitude,
            latitude: GABON_CENTER.latitude,
            zoom: 6,
        };
    }, [selectedCity, userLocation]);

    // Fly to city when selectedCity changes
    useEffect(() => {
        if (!mapRef.current || !isMapLoaded) return;
        if (userLocation) return;

        if (selectedCity && selectedCity in GABON_CITIES_COORDS) {
            const coords = GABON_CITIES_COORDS[selectedCity as GabonCity];
            mapRef.current.flyTo({
                center: [coords.longitude, coords.latitude],
                zoom: 12,
                duration: 1500,
            });
        }
    }, [selectedCity, isMapLoaded, userLocation]);

    useEffect(() => {
        if (!mapRef.current || !isMapLoaded) return;
        if (!userLocation) return;

        mapRef.current.flyTo({
            center: [userLocation.longitude, userLocation.latitude],
            zoom: 11,
            duration: 1200,
        });
    }, [userLocation, isMapLoaded]);

    const storesWithItems = useMemo(() => {
        const stores = new Map<string, StoreMapEntry>();

        items.forEach((item) => {
            const merchant = item.merchant;
            if (!merchant?.id) return;

            const merchantLat = merchant.latitude;
            const merchantLng = merchant.longitude;
            if (!isValidCoordinate(merchantLat, merchantLng)) return;

            const existing = stores.get(merchant.id);
            if (existing) {
                existing.items.push(item);
                existing.totalQuantity += item.quantity_available || 0;
                existing.lowestPrice = Math.min(existing.lowestPrice, item.discounted_price);
                return;
            }

            stores.set(merchant.id, {
                id: merchant.id,
                merchant,
                items: [item],
                coords: {
                    latitude: merchantLat as number,
                    longitude: merchantLng as number,
                },
                totalQuantity: item.quantity_available || 0,
                lowestPrice: item.discounted_price,
            });
        });

        return Array.from(stores.values());
    }, [items]);

    const radiusPolygon = useMemo(() => {
        if (!userLocation) return null;
        return createRadiusPolygon(userLocation, radiusKm);
    }, [radiusKm, userLocation]);

    const handleMarkerHover = useCallback((store: StoreMapEntry) => {
        setPopupInfo(store);
    }, []);

    const handleMarkerClick = useCallback((store: StoreMapEntry) => {
        const firstItem = store.items[0];
        if (firstItem) {
            onItemSelect?.(firstItem);
        }
    }, [onItemSelect]);

    const handleMapLoad = useCallback(() => {
        setIsMapLoaded(true);
    }, []);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('fr-FR').format(price) + ' FCFA';
    };

    return (
        <Card className={`overflow-hidden relative ${className}`}>
            <MapGL
                ref={mapRef}
                mapLib={maplibregl}
                initialViewState={initialViewState}
                style={{ width: "100%", height: 500 }}
                mapStyle={MAP_STYLE}
                onLoad={handleMapLoad}
                attributionControl={false}
            >
                <NavigationControl position="top-right" />

                {radiusPolygon && (
                    <Source id="user-radius" type="geojson" data={radiusPolygon}>
                        <Layer
                            id="user-radius-fill"
                            type="fill"
                            paint={{
                                "fill-color": "#2563eb",
                                "fill-opacity": 0.08,
                            }}
                        />
                        <Layer
                            id="user-radius-line"
                            type="line"
                            paint={{
                                "line-color": "#2563eb",
                                "line-opacity": 0.55,
                                "line-width": 2,
                            }}
                        />
                    </Source>
                )}

                {/* Markers for stores with available items */}
                {storesWithItems.map((store) => (
                    <Marker
                        key={store.id}
                        longitude={store.coords.longitude}
                        latitude={store.coords.latitude}
                        anchor="bottom"
                        onClick={(e) => {
                            e.originalEvent.stopPropagation();
                            handleMarkerClick(store);
                        }}
                    >
                        <div
                            className="cursor-pointer transform hover:scale-110 transition-transform"
                            onMouseEnter={() => handleMarkerHover(store)}
                            onFocus={() => handleMarkerHover(store)}
                            tabIndex={0}
                            role="button"
                            aria-label={`Voir ${store.items.length} offre${store.items.length > 1 ? "s" : ""} chez ${store.merchant.business_name}`}
                        >
                            <div className="relative">
                                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                                    <MapPin className="w-4 h-4 text-primary-foreground" />
                                </div>
                                {store.totalQuantity > 0 && store.totalQuantity <= 3 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                                        {store.totalQuantity}
                                    </span>
                                )}
                            </div>
                        </div>
                    </Marker>
                ))}

                {/* User location marker */}
                {userLocation && (
                    <Marker
                        longitude={userLocation.longitude}
                        latitude={userLocation.latitude}
                        anchor="center"
                    >
                        <div
                            className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow ring-4 ring-blue-500/20"
                            title={formatLocationAccuracy(userLocation)}
                        />
                    </Marker>
                )}

                {/* Popup */}
                {popupInfo && (
                    <Popup
                        longitude={popupInfo.coords.longitude}
                        latitude={popupInfo.coords.latitude}
                        anchor="bottom"
                        onClose={() => setPopupInfo(null)}
                        closeButton={true}
                        closeOnClick={false}
                        className="map-popup"
                        maxWidth="280px"
                    >
                        <div className="p-2 min-w-[200px]">
                            <div className="flex items-start gap-2 mb-2">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                    {popupInfo.items[0]?.image_url ? (
                                        <Image
                                            src={popupInfo.items[0].image_url}
                                            alt={popupInfo.merchant.business_name}
                                            fill
                                            className="object-cover"
                                            sizes="48px"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Store className="w-6 h-6 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm truncate">{popupInfo.merchant.business_name}</h3>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {popupInfo.merchant.quartier || popupInfo.merchant.city || "Commerce"}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1 mb-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                        {popupInfo.items.length} offre{popupInfo.items.length > 1 ? 's' : ''}
                                    </Badge>
                                    <span className="font-bold text-primary text-sm">
                                        Dès {formatPrice(popupInfo.lowestPrice)}
                                    </span>
                                </div>

                                {popupInfo.items[0] && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        <span>{popupInfo.items[0].pickup_start} - {popupInfo.items[0].pickup_end}</span>
                                    </div>
                                )}

                                {popupInfo.totalQuantity > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {popupInfo.totalQuantity} article{popupInfo.totalQuantity > 1 ? 's' : ''} disponible{popupInfo.totalQuantity > 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>

                            <Button
                                size="sm"
                                className="w-full"
                                onClick={() => {
                                    handleMarkerClick(popupInfo);
                                    setPopupInfo(null);
                                }}
                            >
                                Voir les détails
                            </Button>
                        </div>
                    </Popup>
                )}
            </MapGL>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur rounded-lg p-3 shadow-lg border">
                <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-primary rounded-full" />
                        <span>Magasin avec offres</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-destructive rounded-full" />
                        <span>Derniers articles</span>
                    </div>
                </div>
            </div>

            {userLocation && onRadiusChange && (
                <div className="absolute top-4 left-4 bg-card/95 backdrop-blur rounded-md p-2 shadow-lg border">
                    <div className="flex items-center gap-1">
                        {radiusOptions.map((option) => (
                            <Button
                                key={option}
                                type="button"
                                variant={radiusKm === option ? "default" : "ghost"}
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={() => onRadiusChange(option)}
                            >
                                {option} km
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {/* Items count */}
            <Badge className="absolute top-4 right-14 bg-primary">
                {storesWithItems.length} magasin{storesWithItems.length > 1 ? 's' : ''}
            </Badge>

            {/* Loading overlay */}
            {!isMapLoaded && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Chargement de la carte...</p>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default GabonMapGL;
