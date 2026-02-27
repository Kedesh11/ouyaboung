"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import Map, {
    Marker,
    Popup,
    NavigationControl,
    GeolocateControl,
    MapRef
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Store, Loader2 } from "lucide-react";
import type { FoodItem, GabonCity } from "@/types";

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

// Helper function to validate coordinates
const isValidCoord = (lat: number | undefined | null, lng: number | undefined | null): boolean => {
    if (lat === undefined || lat === null || lng === undefined || lng === null) return false;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (isNaN(lat) || isNaN(lng)) return false;
    if (!isFinite(lat) || !isFinite(lng)) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

// Generate pseudo-random coordinates for items without merchant location
const generateCityCoords = (cityName: string, itemId: string): { latitude: number; longitude: number } | null => {
    const city = cityName as GabonCity;
    const baseCoords = GABON_CITIES_COORDS[city];

    if (!baseCoords) return null;

    // Create deterministic offset based on item ID
    const hash = itemId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const offsetLat = ((hash % 100) - 50) * 0.001;
    const offsetLng = (((hash * 7) % 100) - 50) * 0.001;

    return {
        latitude: baseCoords.latitude + offsetLat,
        longitude: baseCoords.longitude + offsetLng,
    };
};

interface GabonMapGLProps {
    items: FoodItem[];
    selectedCity?: GabonCity | "";
    userLocation?: { latitude: number; longitude: number } | null;
    onItemSelect?: (item: FoodItem) => void;
    className?: string;
}

const GabonMapGL = ({
    items,
    selectedCity,
    userLocation,
    onItemSelect,
    className = "",
}: GabonMapGLProps) => {
    const mapRef = useRef<MapRef>(null);
    const [popupInfo, setPopupInfo] = useState<FoodItem | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // Calculate initial view based on selected city
    const initialViewState = useMemo(() => {
        if (selectedCity && selectedCity in GABON_CITIES_COORDS) {
            const coords = GABON_CITIES_COORDS[selectedCity as GabonCity];
            return {
                longitude: coords.longitude,
                latitude: coords.latitude,
                zoom: 12,
            };
        }
        if (userLocation) {
            return {
                longitude: userLocation.longitude,
                latitude: userLocation.latitude,
                zoom: 11,
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

        if (selectedCity && selectedCity in GABON_CITIES_COORDS) {
            const coords = GABON_CITIES_COORDS[selectedCity as GabonCity];
            mapRef.current.flyTo({
                center: [coords.longitude, coords.latitude],
                zoom: 12,
                duration: 1500,
            });
        }
    }, [selectedCity, isMapLoaded]);

    useEffect(() => {
        if (!mapRef.current || !isMapLoaded) return;
        if (selectedCity) return;
        if (!userLocation) return;

        mapRef.current.flyTo({
            center: [userLocation.longitude, userLocation.latitude],
            zoom: 11,
            duration: 1200,
        });
    }, [userLocation, selectedCity, isMapLoaded]);

    // Generate coordinates for items
    const itemsWithCoords = useMemo(() => {
        return items
            .map(item => {
                // Try merchant coordinates first
                const merchantLat = item.merchant?.latitude;
                const merchantLng = item.merchant?.longitude;

                if (isValidCoord(merchantLat, merchantLng)) {
                    return {
                        ...item,
                        coords: { latitude: merchantLat!, longitude: merchantLng! },
                    };
                }

                // Fall back to city-based coordinates
                // If merchant city is missing and selectedCity is "all", default to Libreville
                let cityName = item.merchant?.city;
                if (!cityName) {
                    cityName = !selectedCity ? "Libreville" : selectedCity;
                }

                if (cityName) {
                    const cityCoords = generateCityCoords(cityName, item.id);
                    if (cityCoords) {
                        return { ...item, coords: cityCoords };
                    }
                }

                return null;
            })
            .filter((item): item is FoodItem & { coords: { latitude: number; longitude: number } } =>
                item !== null && isValidCoord(item.coords.latitude, item.coords.longitude)
            );
    }, [items, selectedCity]);

    const handleMarkerClick = useCallback((item: FoodItem) => {
        setPopupInfo(item);
    }, []);

    const handleMapLoad = useCallback(() => {
        setIsMapLoaded(true);
    }, []);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('fr-FR').format(price) + ' FCFA';
    };

    const getDiscount = (original: number, discounted: number) => {
        return Math.round((1 - discounted / original) * 100);
    };

    return (
        <Card className={`overflow-hidden relative ${className}`}>
            <Map
                ref={mapRef}
                mapLib={maplibregl}
                initialViewState={initialViewState}
                style={{ width: "100%", height: 500 }}
                mapStyle={MAP_STYLE}
                onLoad={handleMapLoad}
                attributionControl={false}
            >
                {/* Navigation controls */}
                <NavigationControl position="top-right" />

                {/* Geolocation control */}
                <GeolocateControl
                    position="top-left"
                    trackUserLocation
                />

                {/* Markers for items */}
                {itemsWithCoords.map((item) => (
                    <Marker
                        key={item.id}
                        longitude={item.coords.longitude}
                        latitude={item.coords.latitude}
                        anchor="bottom"
                        onClick={(e) => {
                            e.originalEvent.stopPropagation();
                            handleMarkerClick(item);
                        }}
                    >
                        <div className="cursor-pointer transform hover:scale-110 transition-transform">
                            <div className="relative">
                                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                                    <MapPin className="w-4 h-4 text-primary-foreground" />
                                </div>
                                {item.quantity_available && item.quantity_available <= 3 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                                        {item.quantity_available}
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
                        <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow" />
                    </Marker>
                )}

                {/* Popup */}
                {popupInfo && (
                    <Popup
                        longitude={itemsWithCoords.find(i => i.id === popupInfo.id)?.coords.longitude || 0}
                        latitude={itemsWithCoords.find(i => i.id === popupInfo.id)?.coords.latitude || 0}
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
                                    {popupInfo.image_url ? (
                                        <Image
                                            src={popupInfo.image_url}
                                            alt={popupInfo.name}
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
                                    <h3 className="font-semibold text-sm truncate">{popupInfo.name}</h3>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {popupInfo.merchant?.business_name || "Commerce"}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1 mb-2">
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                        -{getDiscount(popupInfo.original_price, popupInfo.discounted_price)}%
                                    </Badge>
                                    <span className="font-bold text-primary text-sm">
                                        {formatPrice(popupInfo.discounted_price)}
                                    </span>
                                    <span className="text-xs text-muted-foreground line-through">
                                        {formatPrice(popupInfo.original_price)}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    <span>{popupInfo.pickup_start} - {popupInfo.pickup_end}</span>
                                </div>

                                {popupInfo.quantity_available && (
                                    <p className="text-xs text-muted-foreground">
                                        {popupInfo.quantity_available} disponible{popupInfo.quantity_available > 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>

                            <Button
                                size="sm"
                                className="w-full"
                                onClick={() => {
                                    onItemSelect?.(popupInfo);
                                    setPopupInfo(null);
                                }}
                            >
                                Voir les détails
                            </Button>
                        </div>
                    </Popup>
                )}
            </Map>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur rounded-lg p-3 shadow-lg border">
                <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-primary rounded-full" />
                        <span>Offre disponible</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-destructive rounded-full" />
                        <span>Derniers articles</span>
                    </div>
                </div>
            </div>

            {/* Items count */}
            <Badge className="absolute top-4 right-14 bg-primary">
                {itemsWithCoords.length} offres
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
