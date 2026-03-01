"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from '@supabase/ssr';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Receipt, Eye, DollarSign, TrendingUp, Clock, CheckCircle, Filter, X, Search } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Types
interface UserTransaction {
    transaction_id: string;
    transaction_date: string;
    payment_status: string;
    q_gabon_reference: string;
    base_amount: number;
    airtel_fees: number;
    pvit_fees: number;
    app_fees: number;
    total_amount: number;
    merchant_revenue: number;
    // New Q-Gabon fields
    q_gabon_fees: number;
    payment_phone_number: string;
    operator_owner_charge: string;
    // Q-Gabon technical
    q_gabon_transaction_id: string;
    merchant_reference_id: string;
    operator: string;
    operator_fees: number;
    status_code: string;
    message: string;
    product_name: string;
    merchant_name: string;
    customer_phone: string;
    order_status: string;
}

const USER_TRANSACTION_COLUMNS = [
    "transaction_id",
    "transaction_date",
    "payment_status",
    "q_gabon_reference",
    "base_amount",
    "airtel_fees",
    "pvit_fees",
    "app_fees",
    "total_amount",
    "merchant_revenue",
    "q_gabon_fees",
    "payment_phone_number",
    "operator_owner_charge",
    "q_gabon_transaction_id",
    "merchant_reference_id",
    "operator",
    "operator_fees",
    "status_code",
    "message",
    "product_name",
    "merchant_name",
    "customer_phone",
    "order_status",
].join(",");

// Status mapping
const STATUS_MAP = {
    PENDING: { label: 'En attente', variant: 'secondary' as const, icon: Clock },
    SUCCESS: { label: 'Payé', variant: 'default' as const, icon: CheckCircle },
    FAILED: { label: 'Échoué', variant: 'destructive' as const, icon: Receipt },
    CANCELLED: { label: 'Annulé', variant: 'destructive' as const, icon: Receipt },
    TIMEOUT: { label: 'Expiré', variant: 'destructive' as const, icon: Receipt }
};

export default function UserTransactionsPage() {
    const [transactions, setTransactions] = useState<UserTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTransaction, setSelectedTransaction] = useState<UserTransaction | null>(null);
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [hasNewTransactions, setHasNewTransactions] = useState(false);
    const itemsPerPage = 5;

    // Filter states
    const [dateFilter, setDateFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'SUCCESS' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'TIMEOUT'>('all');
    const [searchText, setSearchText] = useState('');

    // Initialize Supabase client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Fetch user transactions
    const fetchTransactions = async () => {
        try {
            // Get current user
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) {
                throw new Error('Non authentifié');
            }

            // Fetch transactions for this user
            const { data, error } = await supabase
                .from('merchant_transactions')
                .select(USER_TRANSACTION_COLUMNS)
                .eq('customer_id', user.id)
                .order('transaction_date', { ascending: false })
                .range(0, 499);

            if (error) throw error;

            setTransactions((data || []) as unknown as UserTransaction[]);
        } catch (error) {
            console.error('Error fetching transactions:', error);
            toast.error('Erreur lors du chargement de vos transactions');
        } finally {
            setLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        fetchTransactions();
    }, []);

    // Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel('user-transactions')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transactions'
            }, () => {
                // If on page 1, refresh immediately
                if (currentPage === 1) {
                    fetchTransactions();
                } else {
                    // Otherwise, show a notification badge
                    setHasNewTransactions(true);
                }
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [currentPage]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    };

    // Apply filters
    const filteredTransactions = transactions.filter((tx) => {
        // Date filter
        if (dateFilter !== 'all') {
            const txDate = new Date(tx.transaction_date);
            const now = new Date();
            const diffMs = now.getTime() - txDate.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            const diffDays = diffHours / 24;

            if (dateFilter === '24h' && diffHours > 24) return false;
            if (dateFilter === '7d' && diffDays > 7) return false;
            if (dateFilter === '30d' && diffDays > 30) return false;
        }

        // Status filter
        if (statusFilter !== 'all' && tx.payment_status !== statusFilter) {
            return false;
        }

        // Text search filter
        if (searchText.trim()) {
            const search = searchText.toLowerCase();
            const matchesReference = tx.q_gabon_reference?.toLowerCase().includes(search);
            const matchesMerchant = tx.merchant_name?.toLowerCase().includes(search);
            const matchesProduct = tx.product_name?.toLowerCase().includes(search);
            
            if (!matchesReference && !matchesMerchant && !matchesProduct) {
                return false;
            }
        }

        return true;
    });

    // Calculate stats from filtered results
    const totalSpent = filteredTransactions
        .filter(tx => tx.payment_status === 'SUCCESS')
        .reduce((sum, tx) => sum + tx.total_amount, 0);

    const successCount = filteredTransactions.filter(tx => tx.payment_status === 'SUCCESS').length;
    const pendingCount = filteredTransactions.filter(tx => tx.payment_status === 'PENDING').length;

    // Pagination calculations on filtered results
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

    // Handler to go to page 1 when new transactions arrive
    const handleGoToNewTransactions = () => {
        setCurrentPage(1);
        setHasNewTransactions(false);
        fetchTransactions();
    };

    // Reset filters
    const handleResetFilters = () => {
        setDateFilter('all');
        setStatusFilter('all');
        setSearchText('');
        setCurrentPage(1);
    };

    // Check if any filter is active
    const hasActiveFilters = dateFilter !== 'all' || statusFilter !== 'all' || searchText.trim() !== '';

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [dateFilter, statusFilter, searchText]);

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-6">
            {/* Header */}
            <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Mes Transactions</h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
                    Historique de tous vos paiements sur ouyaboung
                </p>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                        <Filter className="w-3 h-3 sm:w-4 sm:h-4" />
                        Filtres de recherche
                        {hasActiveFilters && (
                            <Badge variant="secondary" className="ml-auto">
                                {[dateFilter !== 'all', statusFilter !== 'all', searchText.trim()].filter(Boolean).length} actif(s)
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Date Filter */}
                        <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Période" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Toutes les dates</SelectItem>
                                <SelectItem value="24h">Dernières 24h</SelectItem>
                                <SelectItem value="7d">7 derniers jours</SelectItem>
                                <SelectItem value="30d">30 derniers jours</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Statut" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts</SelectItem>
                                <SelectItem value="SUCCESS">Payé</SelectItem>
                                <SelectItem value="PENDING">En attente</SelectItem>
                                <SelectItem value="FAILED">Échoué</SelectItem>
                                <SelectItem value="CANCELLED">Annulé</SelectItem>
                                <SelectItem value="TIMEOUT">Expiré</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Reset Button */}
                        <Button
                            variant="outline"
                            onClick={handleResetFilters}
                            disabled={!hasActiveFilters}
                            className="w-full sm:w-auto h-10"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Réinitialiser
                        </Button>
                    </div>

                    {/* Active Filters Display */}
                    {hasActiveFilters && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            <span className="text-sm text-muted-foreground">Filtres actifs:</span>
                            {dateFilter !== 'all' && (
                                <Badge variant="secondary" className="gap-1">
                                    Période: {dateFilter === '24h' ? '24h' : dateFilter === '7d' ? '7 jours' : '30 jours'}
                                    <X 
                                        className="w-3 h-3 cursor-pointer hover:text-destructive" 
                                        onClick={() => setDateFilter('all')}
                                    />
                                </Badge>
                            )}
                            {statusFilter !== 'all' && (
                                <Badge variant="secondary" className="gap-1">
                                    Statut: {STATUS_MAP[statusFilter]?.label || statusFilter}
                                    <X 
                                        className="w-3 h-3 cursor-pointer hover:text-destructive" 
                                        onClick={() => setStatusFilter('all')}
                                    />
                                </Badge>
                            )}
                            {searchText.trim() && (
                                <Badge variant="secondary" className="gap-1">
                                    Recherche: "{searchText}"
                                    <X 
                                        className="w-3 h-3 cursor-pointer hover:text-destructive" 
                                        onClick={() => setSearchText('')}
                                    />
                                </Badge>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            {loading ? (
                                <Skeleton className="h-8 w-12" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold">{filteredTransactions.length}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {hasActiveFilters ? 'Filtrées' : 'Total'}
                                        {hasActiveFilters && <span className="text-xs ml-1">sur {transactions.length}</span>}
                                    </p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            {loading ? (
                                <Skeleton className="h-8 w-24" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
                                    <p className="text-sm text-muted-foreground">Total dépensé</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            {loading ? (
                                <Skeleton className="h-8 w-12" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold">{successCount}</p>
                                    <p className="text-sm text-muted-foreground">Réussies</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            {loading ? (
                                <Skeleton className="h-8 w-12" />
                            ) : (
                                <>
                                    <p className="text-2xl font-bold">{pendingCount}</p>
                                    <p className="text-sm text-muted-foreground">En attente</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Transactions Table */}
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className="text-sm sm:text-base">Historique des paiements</CardTitle>
                    {hasNewTransactions && currentPage > 1 && (
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleGoToNewTransactions}
                            className="text-xs w-full sm:w-auto h-10 sm:h-9"
                        >
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Nouvelles transactions
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="font-medium">Aucune transaction</p>
                            <p className="text-sm mt-1">Vos paiements apparaîtront ici</p>
                        </div>
                    ) : (
                        <>
                            {/* Table with horizontal scroll on mobile */}
                            <div className="-mx-4 sm:mx-0 overflow-x-auto">
                                <div className="inline-block min-w-full align-middle">
                                    <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Référence</TableHead>
                                        <TableHead>Commerce</TableHead>
                                        <TableHead>Produit</TableHead>
                                        <TableHead className="text-right">Montant</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead className="text-right">Détails</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {currentTransactions.map((tx) => {
                                        const status = STATUS_MAP[tx.payment_status as keyof typeof STATUS_MAP] ||
                                            { label: tx.payment_status, variant: 'secondary' as const, icon: Receipt };

                                        return (
                                            <TableRow key={tx.transaction_id}>
                                                <TableCell className="font-mono text-sm">
                                                    {tx.q_gabon_reference || 'N/A'}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {tx.merchant_name}
                                                </TableCell>
                                                <TableCell className="max-w-[200px] truncate">
                                                    {tx.product_name}
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {formatCurrency(tx.total_amount)}
                                                </TableCell>
                                                <TableCell>
                                                    {format(new Date(tx.transaction_date), "d MMM yyyy", { locale: fr })}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={status.variant}>
                                                        {status.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSelectedTransaction(tx)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                                </div>
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="mt-6 space-y-3">
                                    {/* Info text */}
                                    <div className="text-sm text-muted-foreground text-center">
                                        Affichage {startIndex + 1} - {Math.min(endIndex, filteredTransactions.length)} sur {filteredTransactions.length} transactions
                                        {hasActiveFilters && <span className="ml-1 text-xs">(filtrées sur {transactions.length} au total)</span>}
                                    </div>

                                    {/* Pagination */}
                                    <Pagination>
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious 
                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                                />
                                            </PaginationItem>

                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                                                // Show first page, last page, current page, and pages around current
                                                const showPage = 
                                                    page === 1 || 
                                                    page === totalPages || 
                                                    (page >= currentPage - 1 && page <= currentPage + 1);

                                                const showEllipsisBefore = page === currentPage - 2 && currentPage > 3;
                                                const showEllipsisAfter = page === currentPage + 2 && currentPage < totalPages - 2;

                                                if (showEllipsisBefore || showEllipsisAfter) {
                                                    return (
                                                        <PaginationItem key={page}>
                                                            <PaginationEllipsis />
                                                        </PaginationItem>
                                                    );
                                                }

                                                if (!showPage) return null;

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

                                            <PaginationItem>
                                                <PaginationNext 
                                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Transaction Details Dialog */}
            <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Détails du paiement</DialogTitle>
                    </DialogHeader>

                    {selectedTransaction && (
                        <div className="space-y-6">
                            {/* Référence */}
                            <div className="space-y-2">
                                <h3 className="font-semibold text-sm text-muted-foreground">Référence</h3>
                                <p className="font-mono text-sm bg-muted p-2 rounded">
                                    {selectedTransaction.q_gabon_reference}
                                </p>
                            </div>

                            {/* Montants détaillés */}
                            <div className="space-y-2">
                                <h3 className="font-semibold text-sm text-muted-foreground">💰 Détails Financiers</h3>
                                <div className="bg-muted p-4 rounded space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Prix du produit:</span>
                                        <span className="font-medium">{formatCurrency(selectedTransaction.base_amount)}</span>
                                    </div>
                                    <div className="border-t my-2 pt-2">
                                        <p className="text-xs text-muted-foreground mb-2">Frais de transaction</p>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="text-xs">Frais Airtel/Moov:</span>
                                            <span className="text-xs">{formatCurrency(selectedTransaction.airtel_fees || 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="text-xs">Frais PVIT:</span>
                                            <span className="text-xs">{formatCurrency(selectedTransaction.pvit_fees || 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="text-xs">Frais plateforme:</span>
                                            <span className="text-xs">{formatCurrency(selectedTransaction.app_fees || 0)}</span>
                                        </div>
                                        {selectedTransaction.q_gabon_fees > 0 && (
                                            <div className="flex justify-between text-blue-600">
                                                <span className="text-xs">Frais Q-Gabon (total):</span>
                                                <span className="text-xs font-medium">{formatCurrency(selectedTransaction.q_gabon_fees)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Total payé:</span>
                                        <span className="text-green-600">{formatCurrency(selectedTransaction.total_amount)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Informations */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Commerce</p>
                                    <p className="font-medium">{selectedTransaction.merchant_name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Produit</p>
                                    <p className="font-medium">{selectedTransaction.product_name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Téléphone</p>
                                    <p className="font-medium">{selectedTransaction.customer_phone}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Numéro paiement</p>
                                    <p className="font-medium font-mono text-xs">{selectedTransaction.payment_phone_number || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Opérateur</p>
                                    <p className="font-medium">{selectedTransaction.operator}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Code statut</p>
                                    <Badge variant={selectedTransaction.status_code === '200' ? 'default' : 'destructive'}>
                                        {selectedTransaction.status_code || 'N/A'}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Statut paiement</p>
                                    <Badge variant={STATUS_MAP[selectedTransaction.payment_status as keyof typeof STATUS_MAP]?.variant}>
                                        {STATUS_MAP[selectedTransaction.payment_status as keyof typeof STATUS_MAP]?.label}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Statut commande</p>
                                    <Badge variant="secondary">
                                        {selectedTransaction.order_status}
                                    </Badge>
                                </div>
                            </div>

                            {/* Message */}
                            {selectedTransaction.message && (
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-sm text-muted-foreground">Message</h3>
                                    <p className="text-sm bg-muted p-3 rounded">
                                        {selectedTransaction.message}
                                    </p>
                                </div>
                            )}

                            {/* Date */}
                            <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                                Paiement effectué le {format(new Date(selectedTransaction.transaction_date), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
