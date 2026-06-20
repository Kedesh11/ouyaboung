"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Clock,
    MapPin,
    Phone,
    CheckCircle,
    XCircle,
    AlertCircle,
    Package,
    Loader2,
} from "lucide-react";
import {
    getAuthUser,
    getUserOrders,
    cancelOrderViaRPC,
    subscribeToOrders,
    unsubscribeChannel,
} from "@/services";
import PaymentModal from "@/components/payment/PaymentModal";
import { toast } from "sonner";

// Dynamic import for QRCodeModal - only loads when needed
const QRCodeModal = dynamic(() => import('@/components/QRCodeModal'), {
  loading: () => <div className="h-64 w-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>,
  ssr: false, // QR generation is client-side only
});

const getStatusBadge = (status: string) => {
    switch (status) {
        case "confirmed":
            return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Confirmée</Badge>;
        case "pending":
            return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">En attente de paiement</Badge>;
        case "processing":
            return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Paiement en cours</Badge>;
        case "ready":
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Prête</Badge>;
        case "completed":
        case "picked_up":
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Récupérée</Badge>;
        case "cancelled":
            return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Annulée</Badge>;
        default:
            return <Badge variant="secondary">{status}</Badge>;
    }
};

const getStatusIcon = (status: string) => {
    switch (status) {
        case "confirmed":
            return <AlertCircle className="h-5 w-5 text-blue-500" />;
        case "pending":
            return <Clock className="h-5 w-5 text-yellow-500" />;
        case "processing":
            return <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />;
        case "ready":
            return <Package className="h-5 w-5 text-green-500" />;
        case "completed":
        case "picked_up":
            return <CheckCircle className="h-5 w-5 text-green-500" />;
        case "cancelled":
            return <XCircle className="h-5 w-5 text-red-500" />;
        default:
            return <Package className="h-5 w-5" />;
    }
};

interface SelectedReservation {
    id: string;
    amount: number;
    merchantName?: string;
    merchantAddress?: string;
    merchantPhone?: string;
    merchantLatitude?: number | null;
    merchantLongitude?: number | null;
}

const parseCoordinate = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const extractMerchantLatitude = (merchant: any): number | null =>
    parseCoordinate(merchant?.latitude ?? merchant?.lat ?? merchant?.location_lat ?? merchant?.location?.lat);

const extractMerchantLongitude = (merchant: any): number | null =>
    parseCoordinate(merchant?.longitude ?? merchant?.lng ?? merchant?.location_lng ?? merchant?.location?.lng);

export default function ReservationsPage() {
    const [activeTab, setActiveTab] = useState("all");
    const [reservations, setReservations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [realtimeStatus, setRealtimeStatus] = useState<string>('CONNECTING');

    // Payment Modal State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedReservation, setSelectedReservation] = useState<SelectedReservation | null>(null);
    
    // QR Code Modal State
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [selectedQROrder, setSelectedQROrder] = useState<any | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [hasNewReservations, setHasNewReservations] = useState(false);
    const itemsPerPage = 3;

    const openPaymentModal = (reservation: any) => {
        setSelectedReservation({
            id: reservation.id,
            amount: reservation.price,
            merchantName: reservation.merchantName,
            merchantAddress: reservation.merchantAddress,
            merchantPhone: reservation.merchantPhone,
            merchantLatitude: extractMerchantLatitude(reservation.merchant),
            merchantLongitude: extractMerchantLongitude(reservation.merchant),
        });
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSuccess = (transactionId: string) => {
        // Optimistically update the reservation status to processing
        if (selectedReservation) {
            setReservations((prev) =>
                prev.map((r) =>
                    r.id === selectedReservation.id ? { ...r, status: 'processing' } : r
                )
            );
        }
    };

    const openQRModal = (reservation: any) => {
        setSelectedQROrder(reservation);
        setIsQRModalOpen(true);
    };

    useEffect(() => {
        const loadReservations = async () => {
            // ... (keep existing load logic)
            console.log('[ReservationsPage] Starting to load reservations...');
            setIsLoading(true);
            setError(null);

            try {
                console.log('👤 [ReservationsPage] Fetching auth user...');
                const { data: userData } = await getAuthUser();
                const userId = userData?.user?.id;
                console.log('[ReservationsPage] User ID:', userId);

                if (!userId) {
                    console.warn('[ReservationsPage] No user ID found');
                    setReservations([]);
                    setIsLoading(false);
                    return;
                }

                console.log('[ReservationsPage] Fetching orders for user:', userId);
                const resp = await getUserOrders(userId);
                
                 if (!resp || !resp.success) {
                    // ... error handling
                     console.error('[ReservationsPage] Failed to load orders:', resp?.error);
                    setError(resp?.error?.message || 'Impossible de charger les réservations');
                    setReservations([]);
                    setIsLoading(false);
                    return;
                }

                // ... mapping logic
                 const orders = resp.data?.data || [];
                console.log('[ReservationsPage] Orders loaded:', orders.length, 'orders');

                const mapped = orders.map((o: any) => {
                     // ... mapping code
                    const pickupStart = o.food_item?.pickup_start ? new Date(o.food_item.pickup_start) : null;
                    const pickupEnd = o.food_item?.pickup_end ? new Date(o.food_item.pickup_end) : null;

                    // Format pickup time range
                    let pickupTimeDisplay = o.pickup_time || '';
                    if (!pickupTimeDisplay && pickupStart && pickupEnd) {
                        const startStr = pickupStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        const endStr = pickupEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        pickupTimeDisplay = `${startStr} - ${endStr}`;
                    }

                    // Format pickup date (use pickup_start or pickup_time, fallback to created_at)
                    let pickupDateDisplay = '';
                    if (o.pickup_time) {
                        pickupDateDisplay = new Date(o.pickup_time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                    } else if (pickupStart) {
                        pickupDateDisplay = pickupStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                    } else {
                        pickupDateDisplay = new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                    }

                    return {
                        id: o.id,
                        merchantName: o.merchant?.business_name || o.merchant?.name || 'Commerçant inconnu',
                        merchantAddress: o.merchant?.address || 'Adresse non disponible',
                        merchantPhone: o.merchant?.phone || '',
                        productName: o.food_item?.name || o.food_item?.title || 'Panier Surprise',
                        description: o.food_item?.description || 'Contenu surprise',
                        price: o.total_price || 0,
                        originalPrice: o.original_total || o.food_item?.original_price || 0,
                        pickupTime: pickupTimeDisplay,
                        pickupDate: pickupDateDisplay,
                        status: o.status,
                        createdAt: o.created_at,
                        merchant: o.merchant,
                        pk: o.pickup_code // Ensure pickup code is passed if needed
                    };
                });
                
                setReservations(mapped);
            } catch (err) {
                // ...
                 console.error("[ReservationsPage] Unexpected error:", err);
                setError(err instanceof Error ? err.message : 'Erreur inconnue lors du chargement');
                 setReservations([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadReservations();
    }, []);

    // Use ref to access current page inside effect without dependency
    const currentPageRef = React.useRef(currentPage);
    
    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    // Realtime Subscription
    useEffect(() => {
        const channel = subscribeToOrders((payload) => {
            const change = payload as { eventType?: string; new?: { id?: string; status?: string; pickup_code?: string } };
            console.log('[ReservationsPage] Realtime update received:', change);

            if (change.eventType === 'INSERT') {
                if (currentPageRef.current === 1) {
                    toast.info('Nouvelle réservation créée !');
                } else {
                    setHasNewReservations(true);
                }
                return;
            }

            if (change.eventType === 'UPDATE') {
                const updatedOrder = change.new;
                if (!updatedOrder?.id) return;

                setReservations((prev) =>
                    prev.map((r) => {
                        if (r.id === updatedOrder.id) {
                            if (r.status !== 'confirmed' && updatedOrder.status === 'confirmed') {
                                toast.success(`La commande pour ${r.productName} a été confirmée !`);
                            }
                            return {
                                ...r,
                                status: updatedOrder.status || r.status,
                                pk: updatedOrder.pickup_code || r.pk,
                            };
                        }
                        return r;
                    })
                );
            }
        }, (status) => {
            console.log('[ReservationsPage] Realtime subscription status:', status);
            setRealtimeStatus(status);
        });

        return () => {
            unsubscribeChannel(channel);
        };
    }, []);

    const handleCancel = async (reservationId: string) => {
        if (!confirm('Êtes-vous sûr de vouloir annuler cette réservation ?')) {
            return;
        }

        try {
            const resp = await cancelOrderViaRPC(reservationId);
            if (resp && resp.success) {
                setReservations((prev) =>
                    prev.map((r) => (r.id === reservationId ? { ...r, status: 'cancelled' } : r))
                );
            } else if (resp?.error?.code === 'OFFLINE_QUEUED') {
                toast.info("Annulation enregistree hors ligne. Elle sera synchronisee automatiquement.");
            } else {
                alert('Erreur lors de l\'annulation: ' + (resp?.error?.message || 'Erreur inconnue'));
            }
        } catch (err) {
            console.error('Error cancelling reservation:', err);
            alert('Erreur lors de l\'annulation de la réservation');
        }
    };

    const filteredReservations = reservations.filter((reservation) => {
        if (activeTab === "all") return true;
        if (activeTab === "active") return ["confirmed", "pending", "ready", "processing"].includes(reservation.status);
        if (activeTab === "completed") return ["completed", "picked_up"].includes(reservation.status);
        if (activeTab === "cancelled") return reservation.status === "cancelled";
        return true;
    });

    // Pagination calculations
    const totalPages = Math.ceil(filteredReservations.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentReservations = filteredReservations.slice(startIndex, endIndex);

    // Handler to go to page 1 when new reservations arrive
    const handleGoToNewReservations = () => {
        setCurrentPage(1);
        setHasNewReservations(false);
    };

    // Reset to page 1 when tab changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-6">
            <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Mes réservations</h1>
                    <p className="text-sm sm:text-base text-muted-foreground">Historique et suivi de vos commandes</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full ${realtimeStatus === 'SUBSCRIBED' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                        {realtimeStatus === 'SUBSCRIBED' ? 'Live WebSocket' : 'Déconnecté'}
                    </span>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{reservations.length}</p>
                        <p className="text-sm text-muted-foreground">Total</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-blue-500">
                            {reservations.filter((r) => ["confirmed", "pending", "ready", "processing"].includes(r.status)).length}
                        </p>
                        <p className="text-sm text-muted-foreground">En cours</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-green-500">
                            {reservations.filter((r) => ["completed", "picked_up"].includes(r.status)).length}
                        </p>
                        <p className="text-sm text-muted-foreground">Récupérées</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-red-500">
                            {reservations.filter((r) => r.status === "cancelled").length}
                        </p>
                        <p className="text-sm text-muted-foreground">Annulées</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4 md:mb-6 h-9 sm:h-10">
                    <TabsTrigger value="all" className="text-xs sm:text-sm">Toutes</TabsTrigger>
                    <TabsTrigger value="active" className="text-xs sm:text-sm">En cours</TabsTrigger>
                    <TabsTrigger value="completed" className="text-xs sm:text-sm">Récupérées</TabsTrigger>
                    <TabsTrigger value="cancelled" className="text-xs sm:text-sm">Annulées</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="space-y-3 md:space-y-4">
                    {isLoading ? (
                        <Card>
                            <CardContent className="p-8 text-center">
                                <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
                                <h3 className="font-semibold text-lg mb-2">Chargement...</h3>
                                <p className="text-muted-foreground mb-4">Veuillez patienter pendant le chargement de vos réservations.</p>
                            </CardContent>
                        </Card>
                    ) : error ? (
                        <Card>
                            <CardContent className="p-8 text-center">
                                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                                <h3 className="font-semibold text-lg mb-2">Erreur</h3>
                                <p className="text-muted-foreground mb-4">{error}</p>
                            </CardContent>
                        </Card>
                    ) : filteredReservations.length === 0 ? (
                        <Card>
                            <CardContent className="p-8 text-center">
                                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <h3 className="font-semibold text-lg mb-2">Aucune réservation</h3>
                                <p className="text-muted-foreground mb-4">Vous n'avez pas encore de réservation dans cette catégorie.</p>
                                <Button asChild>
                                    <a href="/search">Explorer les offres</a>
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        currentReservations.map((reservation) => (
                            <Card key={reservation.id} className="overflow-hidden">
                                <CardContent className="p-0">
                                    <div className="flex flex-col sm:flex-row">
                                        {/* Left side - Status indicator */}
                                        <div className="p-3 sm:p-4 flex items-center justify-center bg-muted/30 sm:w-16">
                                            {getStatusIcon(reservation.status)}
                                        </div>

                                        {/* Main content */}
                                        <div className="flex-1 p-3 sm:p-4">
                                            <div className="flex flex-col gap-3 sm:gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <h3 className="font-semibold text-foreground">{reservation.productName}</h3>
                                                        {getStatusBadge(reservation.status)}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mb-3">{reservation.description}</p>

                                                    {/* Merchant info */}
                                                    <div className="space-y-1 text-sm">
                                                        <p className="font-medium text-foreground">{reservation.merchantName}</p>
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <MapPin className="h-4 w-4" />
                                                            <span>{reservation.merchantAddress || ''}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Phone className="h-4 w-4" />
                                                            <span>{reservation.merchantPhone || ''}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Clock className="h-4 w-4" />
                                                            <span>Récupération: {reservation.pickupDate} • {reservation.pickupTime}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Price and actions - now beside content on larger screens */}
                                                <div className="border-t sm:border-t-0 sm:border-l sm:pl-4 pt-3 sm:pt-0 sm:text-right space-y-2 sm:min-w-[200px]">
                                                    <p className="text-xs text-muted-foreground">Réf: {reservation.id}</p>
                                                    <p className="text-2xl font-bold text-primary">{reservation.price.toLocaleString()} FCFA</p>
                                                    <p className="text-sm text-muted-foreground line-through">{reservation.originalPrice.toLocaleString()} FCFA</p>

                                                    {["confirmed", "ready"].includes(reservation.status) && reservation.pk && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="w-full sm:w-auto h-10 sm:h-9"
                                                            onClick={() => openQRModal(reservation)}
                                                        >
                                                            Voir le QR Code
                                                        </Button>
                                                    )}
                                                    {reservation.status === "pending" && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                className="w-full sm:w-auto h-10 sm:h-9"
                                                                onClick={() => openPaymentModal(reservation)}
                                                            >
                                                                Payer
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                className="w-full sm:w-auto h-10 sm:h-9"
                                                                onClick={() => handleCancel(reservation.id)}
                                                            >
                                                                Annuler
                                                            </Button>
                                                        </>
                                                    )}
                                                    {reservation.status === "processing" && (
                                                        <Button variant="outline" size="sm" className="w-full mt-2" disabled>
                                                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                                            En cours...
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}

                    {/* Pagination Controls */}
                    {!isLoading && !error && filteredReservations.length > itemsPerPage && (
                        <div className="mt-6 space-y-3">
                            {/* New Reservations Notification */}
                            {hasNewReservations && currentPage > 1 && (
                                <div className="flex justify-center">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={handleGoToNewReservations}
                                        className="text-xs gap-2"
                                    >
                                        <Package className="w-3 h-3" />
                                        Nouvelles réservations
                                    </Button>
                                </div>
                            )}

                            {/* Info text */}
                            <div className="text-sm text-muted-foreground text-center">
                                Affichage {startIndex + 1} - {Math.min(endIndex, filteredReservations.length)} sur {filteredReservations.length} réservations
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <Pagination>
                                    <PaginationContent>
                                        {/* Previous Button */}
                                        <PaginationItem>
                                            <PaginationPrevious 
                                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                            />
                                        </PaginationItem>

                                        {/* Page Numbers */}
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                                            // Show first page, last page, current page, and pages around current
                                            const showPage = 
                                                page === 1 || 
                                                page === totalPages || 
                                                (page >= currentPage - 1 && page <= currentPage + 1);

                                            if (!showPage) {
                                                // Show ellipsis
                                                if (page === currentPage - 2 || page === currentPage + 2) {
                                                    return (
                                                        <PaginationItem key={page}>
                                                            <PaginationEllipsis />
                                                        </PaginationItem>
                                                    );
                                                }
                                                return null;
                                            }

                                            return (
                                                <PaginationItem key={page}>
                                                    <PaginationLink
                                                        onClick={() => setCurrentPage(page)}
                                                        isActive={currentPage === page}
                                                        className="cursor-pointer"
                                                    >
                                                        {page}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            );
                                        })}

                                        {/* Next Button */}
                                        <PaginationItem>
                                            <PaginationNext 
                                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            )}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Payment Modal */}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                orderId={selectedReservation?.id || ''}
                amount={selectedReservation?.amount || 0}
                onSuccess={handlePaymentSuccess}
                merchant={{
                    name: selectedReservation?.merchantName,
                    address: selectedReservation?.merchantAddress,
                    phone: selectedReservation?.merchantPhone,
                    latitude: selectedReservation?.merchantLatitude,
                    longitude: selectedReservation?.merchantLongitude,
                }}
            />

            {/* QR Code Modal */}
            {selectedQROrder && (
                <QRCodeModal
                    open={isQRModalOpen}
                    onClose={() => setIsQRModalOpen(false)}
                    order={{
                        id: selectedQROrder.id,
                        pickup_code: selectedQROrder.pk,
                        productName: selectedQROrder.productName,
                        merchantName: selectedQROrder.merchantName,
                        merchantAddress: selectedQROrder.merchantAddress,
                        totalPrice: selectedQROrder.price,
                        pickupTime: selectedQROrder.pickupTime,
                        confirmedAt: selectedQROrder.createdAt
                    }}
                />
            )}
        </div>
    );
}
