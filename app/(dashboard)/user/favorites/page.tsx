"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Heart,
    MapPin,
    Star,
    Clock,
    Trash2,
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

import { getAuthUser, getFavorites, removeFavorite, getMerchant, getMerchantItems, createReservation } from '@/services';
import { useRouter } from 'next/navigation';

export default function FavoritesPage() {
    const [favoritesList, setFavoritesList] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [selectedToDelete, setSelectedToDelete] = useState<string | null>(null);
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const { data: userData } = await getAuthUser();
                const userId = userData?.user?.id;
                if (!userId) {
                    setFavoritesList([]);
                    setLoading(false);
                    return;
                }

                const favResp = await getFavorites(userId);
                if (!favResp || !favResp.success) {
                    setError(favResp?.error?.message || 'Impossible de charger les favoris');
                    setFavoritesList([]);
                    setLoading(false);
                    return;
                }

                const merchantIds: string[] = favResp.data || [];

                const mapped: any[] = [];
                for (const mid of merchantIds) {
                    const mresp = await getMerchant(mid);
                    if (!mresp || !mresp.success || !mresp.data) continue;
                    const merchant = mresp.data;

                    // fetch merchant items to find an active offer
                    const itemsResp = await getMerchantItems(mid, false);
                    const items = itemsResp?.data || [];
                    const activeItem = items.find((it: any) => it.is_available && (it.discounted_price < it.original_price));

                    mapped.push({
                        id: merchant.id,
                        merchantName: merchant.business_name,
                        category: merchant.business_type || 'commerce',
                        address: merchant.address || '',
                        rating: merchant.rating || 0,
                        reviewCount: merchant.total_reviews || 0,
                        distance: '',
                        image: merchant.logo_url || '/placeholder.svg',
                        hasActiveOffer: !!activeItem,
                        currentOffer: activeItem
                            ? {
                                id: activeItem.id,
                                name: activeItem.name,
                                price: activeItem.discounted_price,
                                originalPrice: activeItem.original_price,
                                pickupTime: `${activeItem.pickup_start} - ${activeItem.pickup_end}`,
                            }
                            : null,
                    });
                }

                setFavoritesList(mapped);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    const handleRemove = async (merchantId: string) => {
        try {
            setActionLoading(merchantId);
            setError(null);
            const { data: userData } = await getAuthUser();
            const userId = userData?.user?.id;
            if (!userId) throw new Error('Utilisateur non authentifié');

            const resp = await removeFavorite(userId, merchantId);
            if (!resp || !resp.success) {
                throw new Error(resp?.error?.message || 'Impossible de supprimer le favori');
            }

            setFavoritesList((s) => s.filter((f) => f.id !== merchantId));
            toast({ title: 'Favori supprimé', description: "Le commerce a été retiré de vos favoris." });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erreur inconnue';
            setError(msg);
            toast({ title: 'Erreur', description: msg, variant: 'destructive' });
        } finally {
            setActionLoading(null);
        }
    };

    const handleReserve = async (merchantId: string, itemId: string) => {
        try {
            setActionLoading(itemId);
            const { data: userData } = await getAuthUser();
            const userId = userData?.user?.id;
            if (!userId) throw new Error('Utilisateur non authentifié');

            const resp = await createReservation(userId, itemId, 1);
            if (resp?.error?.code === 'OFFLINE_QUEUED') {
                toast({
                    title: 'Reservation en attente',
                    description: 'Vous etes hors ligne. La reservation sera synchronisee automatiquement.',
                });
                return;
            }

            if (!resp || !resp.success) {
                throw new Error(resp?.error?.message || 'Impossible de réserver');
            }

            // Navigate to reservations page
            router.push('/user/reservations');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur de réservation');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Mes favoris</h1>
                <p className="text-muted-foreground">Commerces que vous avez sauvegardés</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{favoritesList.length}</p>
                        <p className="text-sm text-muted-foreground">Favoris</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-primary">{favoritesList.filter(f => f.hasActiveOffer).length}</p>
                        <p className="text-sm text-muted-foreground">Avec offres actives</p>
                    </CardContent>
                </Card>
            </div>

            {/* Favorites List */}
            {loading ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-semibold text-lg mb-2">Chargement...</h3>
                        <p className="text-muted-foreground mb-4">Patientez pendant le chargement de vos favoris.</p>
                    </CardContent>
                </Card>
            ) : error ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <h3 className="font-semibold text-lg mb-2">Erreur</h3>
                        <p className="text-muted-foreground mb-4">{error}</p>
                    </CardContent>
                </Card>
            ) : favoritesList.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-semibold text-lg mb-2">Aucun favori</h3>
                        <p className="text-muted-foreground mb-4">Vous n'avez pas encore ajouté de commerce à vos favoris.</p>
                        <Button asChild>
                            <a href="/search">Explorer les commerces</a>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {favoritesList.map((favorite) => (
                        <Card key={favorite.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                            <CardContent className="p-0">
                                <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5">
                                    <Badge className="absolute top-2 left-2">{favorite.category}</Badge>
                                    <AlertDialog open={confirmOpen && selectedToDelete === favorite.id} onOpenChange={(open) => { if (!open) { setSelectedToDelete(null); } setConfirmOpen(open); }}>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute top-2 right-2 bg-background/80 hover:bg-background text-destructive"
                                                onClick={() => { setSelectedToDelete(favorite.id); setConfirmOpen(true); }}
                                                disabled={actionLoading === favorite.id}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>

                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Voulez-vous vraiment supprimer ce commerce de vos favoris ? Cette action est irréversible.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                                <AlertDialogAction onClick={async () => { if (selectedToDelete) { await handleRemove(selectedToDelete); setConfirmOpen(false); } }}>
                                                    Supprimer
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    {favorite.hasActiveOffer && (
                                        <Badge className="absolute bottom-2 left-2 bg-green-500 text-white">Offre disponible</Badge>
                                    )}
                                </div>

                                <div className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="font-semibold text-foreground">{favorite.merchantName}</h3>
                                        <div className="flex items-center gap-1">
                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                            <span className="text-sm font-medium">{favorite.rating}</span>
                                            <span className="text-xs text-muted-foreground">({favorite.reviewCount})</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                        <MapPin className="h-4 w-4" />
                                        <span className="truncate">{favorite.address}</span>
                                        <span className="text-primary font-medium ml-auto">{favorite.distance}</span>
                                    </div>

                                    {favorite.hasActiveOffer && favorite.currentOffer && (
                                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium">{favorite.currentOffer.name}</span>
                                                <span className="text-primary font-bold">{favorite.currentOffer.price.toLocaleString()} FCFA</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span>{favorite.currentOffer.pickupTime}</span>
                                                </div>
                                                <span className="line-through">{favorite.currentOffer.originalPrice.toLocaleString()} FCFA</span>
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        className="w-full mt-4"
                                        variant={favorite.hasActiveOffer ? "default" : "outline"}
                                        onClick={() => favorite.hasActiveOffer && handleReserve(favorite.id, favorite.currentOffer.id)}
                                        disabled={!favorite.hasActiveOffer || actionLoading !== null}
                                    >
                                        {actionLoading === favorite.currentOffer?.id ? 'Réservation...' : (favorite.hasActiveOffer ? 'Réserver' : 'Voir le commerce')}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
