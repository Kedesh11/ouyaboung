"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Leaf,
    Droplets,
    TreePine,
    Award,
    TrendingUp,
    ShoppingBag,
    Calendar,
} from "lucide-react";
import { getAuthUser } from "@/services";
import { getUserStats, getUserMonthlyImpact } from "@/services";
import {
    mealsToWaterL,
    mealsToEnergyKwh,
    co2KgToTrees,
    co2KgToCarKm,
} from "@/lib/impactCalculations";
import { toast } from "sonner";

const defaultMonthly = [
    { month: 'Jan', meals: 0, co2: 0 },
    { month: 'Fév', meals: 0, co2: 0 },
    { month: 'Mar', meals: 0, co2: 0 },
    { month: 'Avr', meals: 0, co2: 0 },
];

export default function ImpactPage() {
    const [loading, setLoading] = useState(true);
    const [impact, setImpact] = useState<any | null>(null);
    const [monthlyData, setMonthlyData] = useState<typeof defaultMonthly>(defaultMonthly);
    const [notifiedBadges, setNotifiedBadges] = useState<string[]>([]);
    const [newlyEarnedBadges, setNewlyEarnedBadges] = useState<string[]>([]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const { data: userData } = await getAuthUser();
                const userId = userData?.user?.id;
                if (!userId) {
                    setImpact(null);
                    setLoading(false);
                    return;
                }

                const resp = await getUserStats(userId);
                if (resp?.success && resp.data) {
                    setImpact(resp.data);
                } else {
                    setImpact(null);
                }
                // fetch monthly progression for the last 4 months
                try {
                    const mResp = await getUserMonthlyImpact(userId, 4);
                    if (mResp?.success && mResp.data) setMonthlyData(mResp.data as any);
                } catch (e) {
                    // ignore, keep defaults
                }
            } catch (err) {
                setImpact(null);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Load notified badges from localStorage
    useEffect(() => {
        const stored = localStorage.getItem('impact-notified-badges');
        if (stored) {
            try {
                setNotifiedBadges(JSON.parse(stored));
            } catch (e) {
                console.error('Error loading notified badges:', e);
            }
        }
    }, []);

    const impactData = impact
        ? {
            mealsRescued: impact.orders_count || 0,
            co2Saved: impact.co2_avoided_kg || 0,
            waterSaved: mealsToWaterL(impact.orders_count || 0),
            energySaved: mealsToEnergyKwh(impact.orders_count || 0),
            moneySaved: impact.money_saved_xaf || 0,
            treesEquivalent: co2KgToTrees(impact.co2_avoided_kg || 0),
            foodSavedKg: impact.food_saved_kg || 0,
        }
        : {
            mealsRescued: 0,
            co2Saved: 0,
            waterSaved: 0,
            energySaved: 0,
            moneySaved: 0,
            treesEquivalent: 0,
            foodSavedKg: 0,
        };

    // Dynamic monthly objective and badge thresholds
    const monthsToShow = monthlyData.length || 4;
    const monthsObserved = monthlyData.filter((m) => m.meals > 0).length || monthsToShow;
    const currentMonth = monthlyData[monthlyData.length - 1] || { meals: 0 };
    const monthlyObjective = Math.max(
        10,
        Math.ceil(((impactData.mealsRescued || 0) / Math.max(1, monthsObserved)) * 1.2)
    );
    const monthlyProgress = Math.min(
        100,
        Math.round(((currentMonth.meals || 0) / monthlyObjective) * 100)
    );

    const ecoThreshold = Math.max(10, Math.round((impactData.mealsRescued || 0) * 0.2) || 10);
    const moneyThreshold = Math.max(50000, Math.round((impactData.moneySaved || 0) * 0.5) || 50000);
    const co2Threshold = Math.max(50, Math.round((impactData.co2Saved || 0) * 0.5) || 50);

    const dynamicBadges = [
        {
            id: '1',
            name: 'Premier pas',
            description: 'Première réservation effectuée',
            icon: ShoppingBag,
            earned: impactData.mealsRescued > 0,
            earnedDate: impactData.mealsRescued > 0 ? new Date().toISOString() : undefined,
        },
        {
            id: '2',
            name: 'Éco-warrior',
            description: `${ecoThreshold} repas sauvés`,
            icon: Leaf,
            earned: impactData.mealsRescued >= ecoThreshold,
            earnedDate: impactData.mealsRescued >= ecoThreshold ? new Date().toISOString() : undefined,
        },
        {
            id: '3',
            name: 'Super saver',
            description: `${moneyThreshold.toLocaleString()} FCFA économisés`,
            icon: TrendingUp,
            earned: impactData.moneySaved >= moneyThreshold,
            earnedDate: impactData.moneySaved >= moneyThreshold ? new Date().toISOString() : undefined,
        },
        {
            id: '4',
            name: 'Champion vert',
            description: `${co2Threshold} kg de CO₂ évités`,
            icon: TreePine,
            earned: impactData.co2Saved >= co2Threshold,
            progress: Math.min(100, Math.round((impactData.co2Saved / co2Threshold) * 100)),
        },
    ];

    // Check for newly earned badges and show notifications
    useEffect(() => {
        if (loading || !impact) return;

        const earnedBadgeIds = dynamicBadges
            .filter(badge => badge.earned)
            .map(badge => badge.id);

        const newBadges = earnedBadgeIds.filter(id => !notifiedBadges.includes(id));

        if (newBadges.length > 0) {
            // Update notified badges
            const updated = [...notifiedBadges, ...newBadges];
            setNotifiedBadges(updated);
            localStorage.setItem('impact-notified-badges', JSON.stringify(updated));
            
            // Set newly earned for animation
            setNewlyEarnedBadges(newBadges);
            
            // Show toast notification for each new badge
            newBadges.forEach(badgeId => {
                const badge = dynamicBadges.find(b => b.id === badgeId);
                if (badge) {
                    toast.success(`🎉 Nouveau badge débloqué !`, {
                        description: `${badge.name}: ${badge.description}`,
                        duration: 5000,
                    });
                }
            });

            // Clear animation after 3 seconds
            setTimeout(() => {
                setNewlyEarnedBadges([]);
            }, 3000);
        }
    }, [impact, loading]);

    if (loading) {
        return (
            <div className="p-8 text-center text-muted-foreground">Chargement des statistiques...</div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Mon impact</h1>
                <p className="text-muted-foreground">Votre contribution à la planète</p>
            </div>

            {/* Main Impact Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <CardContent className="p-4 text-center">
                        <ShoppingBag className="h-8 w-8 text-green-500 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-green-500">{impactData.mealsRescued}</p>
                        <p className="text-xs text-muted-foreground">Commandes</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
                    <CardContent className="p-4 text-center">
                        <Leaf className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-emerald-500">{impactData.co2Saved.toFixed(1)} kg</p>
                        <p className="text-xs text-muted-foreground">CO₂ évités</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
                    <CardContent className="p-4 text-center">
                        <Droplets className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-blue-500">{impactData.foodSavedKg.toFixed(1)} kg</p>
                        <p className="text-xs text-muted-foreground">Nourriture sauvée</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                    <CardContent className="p-4 text-center">
                        <TrendingUp className="h-8 w-8 text-primary mx-auto mb-2" />
                        <p className="text-2xl font-bold text-primary">
                            {impactData.moneySaved > 0 ? `${(impactData.moneySaved / 1000).toFixed(0)}k` : '0'}
                        </p>
                        <p className="text-xs text-muted-foreground">FCFA économisés</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Impact Summary */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            Résumé de votre impact
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {monthlyData.map((month) => (
                                <div key={month.month} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{month.month}</span>
                                        <span className="text-muted-foreground">
                                            {month.meals} repas • {month.co2} kg CO₂
                                        </span>
                                    </div>
                                    <Progress value={(month.meals / 10) * 100} className="h-2" />
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 p-4 rounded-lg bg-muted/50">
                            <h4 className="font-semibold mb-2">🎯 Objectif du mois</h4>
                            <p className="text-sm text-muted-foreground mb-2">
                                Sauvez {monthlyObjective} repas ce mois-ci pour atteindre votre objectif
                            </p>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span>Progression</span>
                                <span className="font-medium">{currentMonth.meals}/{monthlyObjective} repas</span>
                            </div>
                            <Progress value={monthlyProgress} className="h-2" />
                        </div>
                    </CardContent>
                </Card>

                {/* Future Features */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Award className="h-5 w-5 text-primary" />
                            Prochaines fonctionnalités
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            {dynamicBadges.map((badge) => {
                                const isNewlyEarned = newlyEarnedBadges.includes(badge.id);
                                
                                return (
                                    <div
                                        key={badge.id}
                                        className={`p-4 rounded-lg border transition-all duration-500 ${
                                            badge.earned
                                                ? "bg-primary/5 border-primary/20"
                                                : "bg-muted/30 border-border opacity-60"
                                        } ${
                                            isNewlyEarned 
                                                ? "animate-pulse ring-2 ring-primary/50 shadow-lg shadow-primary/20" 
                                                : ""
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div
                                                className={`p-2 rounded-full transition-all duration-500 ${
                                                    badge.earned ? "bg-primary/10" : "bg-muted"
                                                } ${
                                                    isNewlyEarned 
                                                        ? "bg-gradient-to-br from-primary/20 to-primary/5 scale-110" 
                                                        : ""
                                                }`}
                                            >
                                                <badge.icon
                                                    className={`h-5 w-5 transition-all duration-500 ${
                                                        badge.earned ? "text-primary" : "text-muted-foreground"
                                                    } ${
                                                        isNewlyEarned ? "text-primary animate-bounce" : ""
                                                    }`}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-sm truncate">{badge.name}</h4>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {badge.description}
                                                </p>
                                            </div>
                                        </div>
                                        {badge.earned ? (
                                            <div className="flex items-center gap-1">
                                                <p className="text-xs text-primary font-medium">
                                                    ✓ Obtenu le {new Date(badge.earnedDate!).toLocaleDateString("fr-FR")}
                                                </p>
                                                {isNewlyEarned && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold animate-pulse">
                                                        Nouveau !
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <Progress 
                                                    value={badge.progress} 
                                                    className="h-1.5"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    {badge.progress}% complété
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Impact Summary */}
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="text-lg">Équivalents environnementaux</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {(() => {
                            const carKm = co2KgToCarKm(impactData.co2Saved || 0);
                            const ledHours = Math.round((impactData.energySaved || 0) * 100); // assume 10W LED -> 0.01 kW
                            const trees = co2KgToTrees(impactData.co2Saved || 0);
                            return (
                                <>
                                    <div className="text-center p-4 rounded-lg bg-muted/30">
                                        <p className="text-3xl mb-2">🚗</p>
                                        <p className="text-xl font-bold text-foreground">{carKm} km</p>
                                        <p className="text-sm text-muted-foreground">de trajet en voiture évités</p>
                                    </div>
                                    <div className="text-center p-4 rounded-lg bg-muted/30">
                                        <p className="text-3xl mb-2">💡</p>
                                        <p className="text-xl font-bold text-foreground">{ledHours} heures</p>
                                        <p className="text-sm text-muted-foreground">d'éclairage LED économisées</p>
                                    </div>
                                    <div className="text-center p-4 rounded-lg bg-muted/30">
                                        <p className="text-3xl mb-2">🌳</p>
                                        <p className="text-xl font-bold text-foreground">{trees} arbres</p>
                                        <p className="text-sm text-muted-foreground">plantés en équivalent CO₂</p>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
