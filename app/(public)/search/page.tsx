"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import FoodCard, { FoodItem as FoodCardItem } from "@/components/FoodCard";
import { Search as SearchIcon, MapPin, Grid, Map, SlidersHorizontal, Store, Loader2, LocateFixed } from "lucide-react";
import {
    searchInventory,
    getCategoryName,
    formatPrice,
    getAuthUser,
    getActiveOrders,
    createReservation,
    resolveUserLocation,
    getCachedUserLocation,
    formatLocationAccuracy,
    isValidCoordinate,
    isWithinGabonBounds,
} from "@/services";
import { useToast } from "@/hooks/use-toast";
import type { FoodItem, FoodCategory, GabonCity, MerchantType } from "@/types";
import type { UserGeolocation } from "@/services";

// Dynamic load map component to avoid SSR issues - using MapLibre instead of Leaflet
const GabonMapGL = dynamic(() => import("@/components/GabonMapGL"), {
    ssr: false,
    loading: () => (
        <Card className="h-[500px] flex items-center justify-center bg-muted/50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </Card>
    ),
});

// Gabon cities
const GABON_CITIES: GabonCity[] = [
    'Libreville',
    'Port-Gentil',
    'Franceville',
    'Oyem',
    'Moanda',
    'Mouila',
    'Lambaréné',
    'Tchibanga',
    'Koulamoutou',
    'Makokou',
];

const MERCHANT_TYPES: { value: MerchantType; label: string }[] = [
    { value: 'bakery', label: 'Boulangerie' },
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'grocery', label: 'Épicerie' },
    { value: 'supermarket', label: 'Supermarché' },
    { value: 'hotel', label: 'Hôtel' },
    { value: 'caterer', label: 'Traiteur' },
];

const FOOD_CATEGORIES: FoodCategory[] = [
    'bread_pastry',
    'prepared_meals',
    'fruits_vegetables',
    'dairy',
    'meat_fish',
    'beverages',
    'snacks',
    'mixed_basket',
];

const DEFAULT_NEARBY_RADIUS_KM = 10;
const NEARBY_RADIUS_OPTIONS = [2, 5, 10];

const calculateDistanceKm = (
    origin: { latitude: number; longitude: number },
    target: { latitude: number; longitude: number }
): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(target.latitude - origin.latitude);
    const dLng = toRad(target.longitude - origin.longitude);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(origin.latitude)) *
            Math.cos(toRad(target.latitude)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
};

const SearchPage = () => {
    const { toast } = useToast();
    const router = useRouter();
    const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
    const [showFilters, setShowFilters] = useState(false);
    const [priceRange, setPriceRange] = useState([0, 20000]); // XAF
    const [isLoading, setIsLoading] = useState(true);
    const [items, setItems] = useState<FoodItem[]>([]);
    const [userLocation, setUserLocation] = useState<UserGeolocation | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [geoStatus, setGeoStatus] = useState<"idle" | "granted" | "approximate" | "denied" | "unavailable">("idle");
    const [userId, setUserId] = useState<string | null>(null);
    const [reservedCountMap, setReservedCountMap] = useState<Record<string, number>>({});
    const [reservingItemId, setReservingItemId] = useState<string | null>(null);
    const [nearbyRadiusKm, setNearbyRadiusKm] = useState(DEFAULT_NEARBY_RADIUS_KM);

    // Filter states
    const [selectedCity, setSelectedCity] = useState<GabonCity | "all">("all");
    const [selectedCategory, setSelectedCategory] = useState<FoodCategory | "all">("all");
    const [selectedMerchantType, setSelectedMerchantType] = useState<MerchantType | "all">("all");
    const [sortBy, setSortBy] = useState<"distance" | "price" | "discount" | "rating">("distance");
    const [searchQuery, setSearchQuery] = useState("");

    const requestUserLocation = useCallback(async (
        showFeedback: boolean = false,
        forceRefresh: boolean = false,
        requestBrowserPermission: boolean = showFeedback
    ) => {
        setIsLocating(true);
        try {
            const result = await resolveUserLocation({
                forceRefresh,
                timeoutMs: requestBrowserPermission ? 15000 : 8000,
                maximumAgeMs: 300000,
                enableHighAccuracy: requestBrowserPermission,
                fallbackToIp: true,
                requestBrowserPermission,
                retryLowAccuracy: true,
            });

            if (result.success && result.data) {
                setUserLocation(result.data);
                setGeoStatus(result.data.isApproximate ? "approximate" : "granted");

                if (showFeedback && result.data.isApproximate) {
                    toast({
                        title: "Position approximative activée",
                        description: "Nous utilisons une position IP temporaire. Autorisez le GPS pour plus de précision.",
                    });
                }
            } else {
                if (result.error?.code === "GEO_PERMISSION_DENIED") {
                    setGeoStatus("denied");
                    if (showFeedback) {
                        toast({
                            title: "Localisation refusée",
                            description: "Autorisez la localisation pour trier les boutiques autour de vous.",
                            variant: "destructive",
                        });
                    }
                } else {
                    setGeoStatus("unavailable");
                    if (showFeedback) {
                        toast({
                            title: "Position indisponible",
                            description: "Impossible d'obtenir votre position actuelle.",
                            variant: "destructive",
                        });
                    }
                }
            }
        } catch {
            setGeoStatus("unavailable");
            if (showFeedback) {
                toast({
                    title: "Position indisponible",
                    description: "Impossible d'obtenir votre position actuelle.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsLocating(false);
        }
    }, [toast]);

    // Load items on mount and when filters change
    useEffect(() => {
        loadItems();
    }, [selectedCity, selectedCategory, selectedMerchantType, priceRange, sortBy, userLocation, nearbyRadiusKm]);

    useEffect(() => {
        const cached = getCachedUserLocation();
        if (cached && isValidCoordinate(cached.latitude, cached.longitude)) {
            setUserLocation(cached);
            setGeoStatus(cached.isApproximate ? "approximate" : "granted");
        }

        requestUserLocation(false, false, false);
    }, [requestUserLocation]);

    useEffect(() => {
        const init = async () => {
            const { data } = await getAuthUser();
            const uid = data?.user?.id || null;
            setUserId(uid);
            if (uid) {
                const res = await getActiveOrders({ userId: uid });
                if (res.success && res.data) {
                    const counts: Record<string, number> = {};
                    res.data.forEach((o) => {
                        const key = `${o.food_item_id}:${o.merchant_id}`;
                        counts[key] = (counts[key] || 0) + (o.quantity || 1);
                    });
                    setReservedCountMap(counts);
                }
            }
        };
        init();
    }, []);

    const loadItems = async () => {
        setIsLoading(true);
        const hasNearbyOrigin =
            userLocation && isValidCoordinate(userLocation.latitude, userLocation.longitude);

        const result = await searchInventory({
            city: selectedCity === "all" ? undefined : selectedCity,
            category: selectedCategory === "all" ? undefined : selectedCategory,
            merchantType: selectedMerchantType === "all" ? undefined : selectedMerchantType,
            minPrice: priceRange[0],
            maxPrice: priceRange[1],
            maxDistanceKm: hasNearbyOrigin ? nearbyRadiusKm : undefined,
            userLatitude: hasNearbyOrigin ? userLocation.latitude : undefined,
            userLongitude: hasNearbyOrigin ? userLocation.longitude : undefined,
            sortBy,
        });

        if (result.success && result.data) {
            console.log("Search Results:", result.data.length, "items", result.data);
            setItems(result.data);
        }

        setIsLoading(false);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            loadItems();
            return;
        }

        setIsLoading(true);
        const hasNearbyOrigin =
            userLocation && isValidCoordinate(userLocation.latitude, userLocation.longitude);
        const result = await searchInventory({
            city: selectedCity === "all" ? undefined : selectedCity,
            category: selectedCategory === "all" ? undefined : selectedCategory,
            merchantType: selectedMerchantType === "all" ? undefined : selectedMerchantType,
            minPrice: priceRange[0],
            maxPrice: priceRange[1],
            maxDistanceKm: hasNearbyOrigin ? nearbyRadiusKm : undefined,
            userLatitude: hasNearbyOrigin ? userLocation.latitude : undefined,
            userLongitude: hasNearbyOrigin ? userLocation.longitude : undefined,
            sortBy,
        });

        if (result.success && result.data) {
            // Client-side filter by search query
            const filtered = result.data.filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.merchant?.business_name?.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setItems(filtered);
        }
        setIsLoading(false);
    };

    const handleReserve = async (item: FoodItem) => {
        // Vérifier si l'utilisateur est connecté
        if (!userId) {
            toast({
                title: "Connexion requise",
                description: "Veuillez vous connecter pour réserver ce produit",
                variant: "destructive",
            });
            return;
        }

        // Vérifier la disponibilité
        if ((item.quantity_available || 0) <= 0) {
            toast({
                title: "Stock épuisé",
                description: "Ce produit n'est plus disponible",
                variant: "destructive",
            });
            return;
        }

        // Vérifier si déjà réservé
        const key = `${item.id}:${item.merchant_id}`;
        const alreadyReserved = (reservedCountMap[key] || 0) > 0;

        if (alreadyReserved) {
            toast({
                title: "Déjà réservé",
                description: "Vous avez déjà réservé ce produit. Consultez vos réservations.",
            });
            return;
        }

        // Démarrer le chargement
        setReservingItemId(item.id);

        try {
            const resp = await createReservation(userId, item.id, 1);

            if (resp.success && resp.data) {
                // Mise à jour du compteur de réservations
                setReservedCountMap((prev) => ({
                    ...prev,
                    [key]: (prev[key] || 0) + 1,
                }));

                // Mise à jour locale de la quantité
                setItems((prev) =>
                    prev.map((fi) =>
                        fi.id === item.id
                            ? { ...fi, quantity_available: Math.max(0, (fi.quantity_available || 0) - 1) }
                            : fi
                    )
                );

                // Notification de succès
                toast({
                    title: "Réservation confirmée !",
                    description: `${item.name} a été ajouté à vos réservations`,
                });
            } else if (resp.error?.code === 'OFFLINE_QUEUED') {
                setReservedCountMap((prev) => ({
                    ...prev,
                    [key]: (prev[key] || 0) + 1,
                }));

                setItems((prev) =>
                    prev.map((fi) =>
                        fi.id === item.id
                            ? { ...fi, quantity_available: Math.max(0, (fi.quantity_available || 0) - 1) }
                            : fi
                    )
                );

                toast({
                    title: "Réservation mise en attente",
                    description: "Vous etes hors ligne. La reservation sera envoyee automatiquement des que la connexion revient.",
                });
            } else {
                // Notification d'erreur
                toast({
                    title: "Erreur de réservation",
                    description: resp.error?.message || "Impossible de réserver ce produit",
                    variant: "destructive",
                });
            }
        } catch (error: any) {
            console.error('Error reserving item:', error);
            toast({
                title: "Erreur",
                description: "Une erreur est survenue lors de la réservation",
                variant: "destructive",
            });
        } finally {
            setReservingItemId(null);
        }
    };

    const distanceByItemId = useMemo(() => {
        const distanceMap: Record<string, number> = {};
        if (!userLocation) return distanceMap;

        items.forEach((item) => {
            const merchantLat = item.merchant?.latitude;
            const merchantLng = item.merchant?.longitude;
            // Some merchants have placeholder/missing coordinates (e.g. (0,0) or
            // null) instead of a real position. isValidCoordinate alone accepts
            // (0,0) as "valid" (it's a real lat/lng pair, just nowhere near
            // Gabon), which would compute a bogus multi-thousand-km distance and
            // get the item wrongly excluded by the nearby-radius filter below.
            // Only trust coordinates that actually fall within Gabon.
            if (isWithinGabonBounds(merchantLat, merchantLng)) {
                const latitude = merchantLat as number;
                const longitude = merchantLng as number;
                distanceMap[item.id] = calculateDistanceKm(userLocation, {
                    latitude,
                    longitude,
                });
            }
        });

        return distanceMap;
    }, [items, userLocation]);

    const itemsWithinRadius = useMemo(() => {
        if (!userLocation) return items;

        return items.filter((item) => {
            const distance = distanceByItemId[item.id];
            // Items whose merchant has no trustworthy coordinates get an
            // unknown distance - show them rather than silently hiding them,
            // instead of only filtering out items we can actually place too far.
            return typeof distance !== "number" || distance <= nearbyRadiusKm;
        });
    }, [distanceByItemId, items, nearbyRadiusKm, userLocation]);

    const displayedItems = useMemo(() => {
        if (sortBy !== "distance" || !userLocation) {
            return itemsWithinRadius;
        }

        return [...itemsWithinRadius].sort((a, b) => {
            const da = distanceByItemId[a.id] ?? Number.MAX_SAFE_INTEGER;
            const db = distanceByItemId[b.id] ?? Number.MAX_SAFE_INTEGER;
            return da - db;
        });
    }, [itemsWithinRadius, sortBy, userLocation, distanceByItemId]);

    // Convert FoodItem to FoodCardItem format
    const toFoodCardItem = (item: FoodItem): FoodCardItem => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        originalPrice: item.original_price,
        discountedPrice: item.discounted_price,
        image: item.image_url || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop",
        merchant: {
            name: item.merchant?.business_name || "Commerce",
            type: item.merchant?.business_type || "other",
            distance:
                distanceByItemId[item.id] !== undefined
                    ? `${distanceByItemId[item.id].toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`
                    : item.merchant?.quartier || "Distance inconnue",
            slug: item.merchant?.slug || "",
        },
        slug: item.slug || "",
        pickupTime: `${item.pickup_start} - ${item.pickup_end}`,
        quantity: item.quantity_available,
        badges: (item.badges || []) as ("bio" | "free" | "lastItems")[],
    });

    return (
        <div className="min-h-screen">
            <main className="pt-24 pb-12">
                <div className="container mx-auto px-4">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                            Trouver des <span className="text-gradient">invendus</span>
                        </h1>
                        <p className="text-muted-foreground">
                            Découvrez les offres disponibles au Gabon
                        </p>
                    </motion.div>

                    {/* Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-6"
                    >
                        <Card className="p-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Select value={selectedCity} onValueChange={(v) => setSelectedCity(v as GabonCity | "all")}>
                                        <SelectTrigger className="pl-10 h-12">
                                            <SelectValue placeholder="Choisir une ville au Gabon" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Toutes les villes</SelectItem>
                                            {GABON_CITIES.map(city => (
                                                <SelectItem key={city} value={city}>{city}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex-1 relative">
                                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Input
                                        placeholder="Rechercher un produit ou commerce..."
                                        className="pl-10 h-12"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    />
                                </div>
                                <Button size="lg" className="gap-2 h-12" onClick={handleSearch}>
                                    <SearchIcon className="w-5 h-5" />
                                    Rechercher
                                </Button>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {isLocating ? (
                                        <span>Recherche de votre position...</span>
                                    ) : geoStatus === "granted" && userLocation ? (
                                        <span>
                                            {formatLocationAccuracy(userLocation)}: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                                        </span>
                                    ) : geoStatus === "approximate" && userLocation ? (
                                        <span>
                                            {formatLocationAccuracy(userLocation)}: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                                        </span>
                                    ) : geoStatus === "denied" ? (
                                        <span>Localisation refusée. Les résultats ne sont pas triés autour de vous.</span>
                                    ) : geoStatus === "unavailable" ? (
                                        <span>Position indisponible. Les résultats ne sont pas triés autour de vous.</span>
                                    ) : (
                                        <span>Position non définie.</span>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1.5"
                                    onClick={() => requestUserLocation(true, true, true)}
                                    disabled={isLocating}
                                >
                                    {isLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                                    {isLocating ? "Localisation..." : "Actualiser ma position"}
                                </Button>
                            </div>
                        </Card>
                    </motion.div>

                    {/* Filters & View Toggle */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-wrap items-center gap-4 mb-6"
                    >
                        <Button
                            variant={showFilters ? "default" : "outline"}
                            onClick={() => setShowFilters(!showFilters)}
                            className="gap-2"
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                            Filtres
                        </Button>

                        <div className="flex gap-2 flex-wrap">
                            {MERCHANT_TYPES.slice(0, 3).map(type => (
                                <Badge
                                    key={type.value}
                                    variant={selectedMerchantType === type.value ? "default" : "outline"}
                                    className="cursor-pointer hover:bg-accent px-3 py-1.5"
                                    onClick={() => setSelectedMerchantType(
                                        selectedMerchantType === type.value ? "all" : type.value
                                    )}
                                >
                                    <Store className="w-3 h-3 mr-1" /> {type.label}
                                </Badge>
                            ))}
                        </div>

                        <div className="ml-auto flex gap-2">
                            <Button
                                variant={viewMode === "grid" ? "default" : "outline"}
                                size="icon"
                                onClick={() => setViewMode("grid")}
                            >
                                <Grid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={viewMode === "map" ? "default" : "outline"}
                                size="icon"
                                onClick={() => setViewMode("map")}
                            >
                                <Map className="w-4 h-4" />
                            </Button>
                        </div>
                    </motion.div>

                    {/* Extended Filters */}
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-6"
                        >
                            <Card className="p-6">
                                <div className="grid md:grid-cols-4 gap-6">
                                    <div>
                                        <label className="text-sm font-medium text-foreground mb-2 block">
                                            Catégorie
                                        </label>
                                        <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as FoodCategory | "all")}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Toutes" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Toutes</SelectItem>
                                                {FOOD_CATEGORIES.map(cat => (
                                                    <SelectItem key={cat} value={cat}>{getCategoryName(cat)}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-foreground mb-2 block">
                                            Type de commerce
                                        </label>
                                        <Select value={selectedMerchantType} onValueChange={(v) => setSelectedMerchantType(v as MerchantType | "all")}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Tous" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Tous</SelectItem>
                                                {MERCHANT_TYPES.map(type => (
                                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-foreground mb-4 block">
                                            Prix max: {formatPrice(priceRange[1])}
                                        </label>
                                        <Slider
                                            value={priceRange}
                                            onValueChange={setPriceRange}
                                            max={50000}
                                            step={500}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-foreground mb-2 block">
                                            Trier par
                                        </label>
                                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="distance">Distance</SelectItem>
                                                <SelectItem value="price">Prix croissant</SelectItem>
                                                <SelectItem value="discount">Réduction</SelectItem>
                                                <SelectItem value="rating">Note</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    {/* Results */}
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{displayedItems.length}</span> résultats trouvés
                            {userLocation ? ` dans un rayon de ${nearbyRadiusKm} km` : ""}
                        </p>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                            <SelectTrigger className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="distance">Distance</SelectItem>
                                <SelectItem value="price">Prix croissant</SelectItem>
                                <SelectItem value="discount">Réduction</SelectItem>
                                <SelectItem value="rating">Note</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            {/* Grid View - Hidden when map is active */}
                            <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 ${viewMode !== "grid" ? "hidden" : ""}`}>
                                {displayedItems.map((item, index) => (
                                    <motion.div
                                        key={item.id}
                                        data-food-id={item.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                    >
                                        <FoodCard
                                            item={toFoodCardItem(item)}
                                            onReserve={item.quantity_available > 0 ? () => handleReserve(item) : undefined}
                                            reservedCount={reservedCountMap[`${item.id}:${item.merchant_id}`] || 0}
                                            isReserving={reservingItemId === item.id}
                                        />
                                    </motion.div>
                                ))}
                                {displayedItems.length === 0 && (
                                    <div className="col-span-full text-center py-12">
                                        <p className="text-muted-foreground">Aucun résultat trouvé</p>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Essayez de modifier vos filtres
                                        </p>
                                    </div>
                                )}
                            </div>
                            {/* Map View - Conditionally rendered to prevent MapLibre reuse errors */}
                            {viewMode === "map" && (
                                <GabonMapGL
                                    items={userLocation ? displayedItems : []}
                                    selectedCity={selectedCity === "all" ? "" : selectedCity}
                                    userLocation={userLocation}
                                    radiusKm={nearbyRadiusKm}
                                    radiusOptions={NEARBY_RADIUS_OPTIONS}
                                    onRadiusChange={setNearbyRadiusKm}
                                    onItemSelect={(item) => {
                                        if (item.slug) {
                                            router.push(`/p/${item.slug}`);
                                        }
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SearchPage;
