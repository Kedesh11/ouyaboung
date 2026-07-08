"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import FoodCard, { FoodItem as FoodCardItem } from "@/components/FoodCard";
import {
    ShoppingBag,
    Heart,
    Leaf,
    Wallet,
    Clock,
    ArrowRight,
    Loader2,
    TrendingUp,
} from "lucide-react";
import {
    getActiveOrders,
    getUserStats,
    formatOrderForDisplay,
    formatPrice,
    getAvailableItems,
    createReservation,
    getFavorites,
} from "@/services";
import { useAuth } from "@/hooks/useAuth";
import type { Order, FoodItem, UserImpact } from "@/types";
import { AVG_MEAL_WEIGHT_KG, co2KgToTrees } from "@/lib/impactCalculations";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

export default function UserDashboardPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [reservingItemId, setReservingItemId] = useState<string | null>(null);
    const [activeOrders, setActiveOrders] = useState<Order[]>([]);
    const [favoriteItems, setFavoriteItems] = useState<FoodItem[]>([]);
    const [userImpact, setUserImpact] = useState<UserImpact | null>(null);
    const [favoritesCount, setFavoritesCount] = useState<number>(0);
    const [reservedCountMap, setReservedCountMap] = useState<Record<string, number>>({});
    const [monthlyGrowth, setMonthlyGrowth] = useState<number>(0);

    const userId = user?.id || null;

    // Calculate monthly growth percentage
    const calculateMonthlyGrowth = async (userId: string) => {
        try {
            const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabasePublicEnv();
            const supabase = (await import('@supabase/ssr')).createBrowserClient(
                supabaseUrl,
                supabaseAnonKey
            );

            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

            // Get current month successful transactions
            const { data: currentMonth } = await supabase
                .from('transactions')
                .select('total_amount')
                .eq('user_id', userId)
                .eq('status', 'SUCCESS')
                .gte('created_at', currentMonthStart.toISOString());

            // Get last month successful transactions
            const { data: lastMonth } = await supabase
                .from('transactions')
                .select('total_amount')
                .eq('user_id', userId)
                .eq('status', 'SUCCESS')
                .gte('created_at', lastMonthStart.toISOString())
                .lte('created_at', lastMonthEnd.toISOString());

            const currentCount = currentMonth?.length || 0;
            const lastCount = lastMonth?.length || 0;

            if (lastCount === 0 && currentCount > 0) {
                setMonthlyGrowth(100); // New user with activity
            } else if (lastCount > 0) {
                const growth = ((currentCount - lastCount) / lastCount) * 100;
                setMonthlyGrowth(Math.round(growth));
            } else {
                setMonthlyGrowth(0);
            }
        } catch (error) {
            console.error('Error calculating monthly growth:', error);
            setMonthlyGrowth(0);
        }
    };

    useEffect(() => {
        if (userId) {
            loadDashboardData();
            calculateMonthlyGrowth(userId);
        }
    }, [userId]);

    const loadDashboardData = async () => {
        if (!userId) return;

        setIsLoading(true);

        try {
            // Load in parallel
            const [ordersResult, impactResult, itemsResult, favoritesResult] = await Promise.all([
                getActiveOrders({ userId }),
                getUserStats(userId),
                getAvailableItems({ perPage: 4 }),
                getFavorites(userId),
            ]);

            if (ordersResult.success && ordersResult.data) {
                setActiveOrders(ordersResult.data);
                const counts: Record<string, number> = {};
                ordersResult.data.forEach((o) => {
                    const key = `${o.food_item_id}:${o.merchant_id}`;
                    counts[key] = (counts[key] || 0) + (o.quantity || 1);
                });
                setReservedCountMap(counts);
            }

            if (impactResult.success && impactResult.data) {
                setUserImpact(impactResult.data);
            }

            if (itemsResult.success && itemsResult.data) {
                setFavoriteItems(itemsResult.data.data.slice(0, 4));
            }

            if (favoritesResult.success && favoritesResult.data) {
                setFavoritesCount(favoritesResult.data.length);
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            // Redirect to auth on error
            window.location.href = '/auth';
        } finally {
            setIsLoading(false);
        }
    };

    const handleReserve = async (item: FoodItem) => {
        if (!userId) {
            toast({
                title: "Erreur",
                description: "Vous devez être connecté pour réserver.",
                variant: "destructive",
            });
            return;
        }

        // Check if item is already being reserved
        if (reservingItemId === item.id) return;

        // Check if item has available quantity
        if (!item.quantity_available || item.quantity_available <= 0) {
            toast({
                title: "Stock épuisé",
                description: "Cet article n'est plus disponible.",
                variant: "destructive",
            });
            return;
        }

        setReservingItemId(item.id);

        try {
            const resp = await createReservation(userId, item.id, 1);

            if (resp.success && resp.data) {
                // Update active orders
                setActiveOrders((prev) => [resp.data as Order, ...prev]);

                // Update reserved count map
                const key = `${item.id}:${resp.data?.merchant_id}`;
                setReservedCountMap((prev) => ({
                    ...prev,
                    [key]: (prev[key] || 0) + 1,
                }));

                // Update item quantity
                setFavoriteItems((prev) =>
                    prev.map((fi) =>
                        fi.id === item.id
                            ? { ...fi, quantity_available: Math.max(0, (fi.quantity_available || 0) - 1) }
                            : fi
                    )
                );

                // Reload user stats to reflect new reservation
                const impactResult = await getUserStats(userId);
                if (impactResult.success && impactResult.data) {
                    setUserImpact(impactResult.data);
                }

                // Show success toast
                toast({
                    title: "✅ Réservation réussie !",
                    description: `${item.name} a été ajouté à vos réservations.`,
                });
            } else if (resp.error?.code === 'OFFLINE_QUEUED') {
                setFavoriteItems((prev) =>
                    prev.map((fi) =>
                        fi.id === item.id
                            ? { ...fi, quantity_available: Math.max(0, (fi.quantity_available || 0) - 1) }
                            : fi
                    )
                );

                toast({
                    title: "Reservation en attente",
                    description: "Vous etes hors ligne. La reservation sera synchronisee automatiquement.",
                });
            } else {
                // Handle API error
                throw new Error(resp.error?.message || "Échec de la réservation");
            }
        } catch (error: any) {
            console.error('Error creating reservation:', error);
            toast({
                title: "Erreur de réservation",
                description: error?.message || "Impossible de réserver cet article. Veuillez réessayer.",
                variant: "destructive",
            });
        } finally {
            setReservingItemId(null);
        }
    };

    const stats = [
        {
            icon: ShoppingBag,
            value: userImpact?.orders_count?.toString() || "0",
            label: "Commandes",
            color: "text-primary",
            bgColor: "bg-primary/10",
        },
        {
            icon: Wallet,
            value: userImpact ? formatPrice(userImpact.money_saved_xaf) : "0 XAF",
            label: "Économisés",
            color: "text-secondary",
            bgColor: "bg-secondary/10",
        },
        {
            icon: Leaf,
            value: userImpact ? `${(userImpact.co2_avoided_kg || 0).toFixed(1)}kg` : "0kg",
            label: "CO₂ évité",
            color: "text-green-600",
            bgColor: "bg-green-100",
        },
        {
            icon: Heart,
            value: (favoritesCount || 0).toString(),
            label: "Favoris",
            color: "text-destructive",
            bgColor: "bg-destructive/10",
        },
    ];
    const totalMealsSaved = userImpact?.total_meals_saved
        ?? Math.round((userImpact?.food_saved_kg || 0) / AVG_MEAL_WEIGHT_KG);

    const formatPickupWindow = (pickupStart?: string, pickupEnd?: string): string => {
        if (!pickupStart || !pickupEnd) return "Horaire non disponible";

        const start = new Date(pickupStart);
        const end = new Date(pickupEnd);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return `${pickupStart} - ${pickupEnd}`;
        }

        const sameDay = start.toDateString() === end.toDateString();
        const startTime = start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        const endTime = end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

        if (sameDay) {
            const dateLabel = start.toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
            });
            return `${dateLabel} • ${startTime} - ${endTime}`;
        }

        const startLabel = start.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
        });
        const endLabel = end.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
        });
        return `${startLabel} ${startTime} → ${endLabel} ${endTime}`;
    };

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
            distance: item.merchant?.quartier || "",
            slug: item.merchant?.slug || "",
        },
        slug: item.slug || "",
        pickupTime: formatPickupWindow(item.pickup_start, item.pickup_end),
        quantity: item.quantity_available,
        badges: (item.badges || []) as ("bio" | "free" | "lastItems")[],
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Title injected into layout context if possible or just rendered here */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
                <p className="text-muted-foreground">Bienvenue sur votre espace anti-gaspillage</p>
            </div>

            {/* Welcome Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-foreground mb-1">
                                    Bonjour, <span className="text-primary">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur'}</span> 👋
                                </h2>
                                <p className="text-muted-foreground">
                                    Vous avez {activeOrders.length} réservation(s) en cours
                                </p>
                            </div>
                            <div className="hidden md:flex items-center gap-2 text-primary">
                                <TrendingUp className="w-5 h-5" />
                                <span className="font-medium">
                                    {monthlyGrowth > 0 && '+'}
                                    {monthlyGrowth}% impact ce mois
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-foreground">{stat.value}</p>
                                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Active Reservations */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg">Réservations en cours</CardTitle>
                            <Link href="/user/reservations">
                                <Button variant="ghost" size="sm" className="gap-1">
                                    Voir tout <ArrowRight className="w-4 h-4" />
                                </Button>
                            </Link>
                        </CardHeader>
                        <CardContent>
                            {activeOrders.length > 0 ? (
                                <div className="space-y-3">
                                    {Object.values(
                                        activeOrders.reduce((acc, o) => {
                                            const key = `${o.food_item_id}:${o.merchant_id}`;
                                            if (!acc[key]) acc[key] = { order: o, total: 0 };
                                            acc[key].total += o.quantity || 1;
                                            return acc;
                                        }, {} as Record<string, { order: Order; total: number }>)
                                    )
                                        .slice(0, 3)
                                        .map(({ order, total }) => {
                                            const formatted = formatOrderForDisplay(order);
                                            return (
                                                <div
                                                    key={order.id}
                                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                                            <ShoppingBag className="w-5 h-5 text-primary" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-foreground text-sm">{formatted.merchantName}</p>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                <Clock className="w-3 h-3" />
                                                                {formatted.itemName} • x{total}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <Badge className={`${formatted.statusColor} text-xs`}>
                                                            {formatted.status}
                                                        </Badge>
                                                        <p className="text-sm font-bold text-foreground mt-1">
                                                            {formatted.totalPrice}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                                    <p className="text-muted-foreground text-sm">Aucune réservation en cours</p>
                                    <Link href="/search">
                                        <Button variant="link" size="sm" className="mt-2">
                                            Trouver des invendus
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Impact Summary */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg">Votre impact écologique</CardTitle>
                            <Link href="/user/impact">
                                <Button variant="ghost" size="sm" className="gap-1">
                                    Détails <ArrowRight className="w-4 h-4" />
                                </Button>
                            </Link>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                                    <div className="flex items-center gap-3">
                                        <Leaf className="w-8 h-8 text-green-600" />
                                        <div>
                                            <p className="text-2xl font-bold text-green-600">
                                                {userImpact ? (userImpact.co2_avoided_kg || 0).toFixed(1) : "0"} kg
                                            </p>
                                            <p className="text-xs text-muted-foreground">CO₂ évité</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                                        <p className="text-lg font-bold text-foreground">
                                            {totalMealsSaved}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Repas sauvés</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                                        <p className="text-lg font-bold text-foreground">
                                            {userImpact ? formatPrice(userImpact.money_saved_xaf) : "0 XAF"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Économisés</p>
                                    </div>
                                </div>

                                <p className="text-xs text-center text-muted-foreground">
                                    🌱 Équivalent à {co2KgToTrees(userImpact?.co2_avoided_kg || 0)} arbres plantés
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Suggested Items */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-foreground">Suggestions pour vous</h2>
                    <Link href="/search">
                        <Button variant="ghost" size="sm" className="gap-1">
                            Voir tout <ArrowRight className="w-4 h-4" />
                        </Button>
                    </Link>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {favoriteItems.map((item) => (
                        <FoodCard
                            key={item.id}
                            item={toFoodCardItem(item)}
                            onReserve={item.quantity_available > 0 ? () => handleReserve(item) : undefined}
                            reservedCount={reservedCountMap[`${item.id}:${item.merchant?.id || item.merchant_id}`] || 0}
                            isReserving={reservingItemId === item.id}
                        />
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
