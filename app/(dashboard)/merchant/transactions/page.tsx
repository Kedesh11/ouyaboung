"use client";

import { useState, useEffect } from "react";
import {
    getMerchantPaymentTransactions,
    syncSingPayTransactionStatus,
    subscribeToTransactions,
    unsubscribeChannel,
} from "@/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Receipt, Eye, DollarSign, TrendingUp, Clock, CheckCircle, ShoppingBag, RefreshCw, Filter } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Types
interface MerchantTransaction {
    transaction_id: string;
    transaction_date: string;
    payment_status: string;
    q_gabon_reference: string;
    provider_reference: string;
    provider: string;
    base_amount: number;
    total_amount: number;
    merchant_revenue: number;
    q_gabon_fees: number;
    payment_phone_number: string;
    operator: string;
    status_code: string;
    provider_transaction_id: string;
    provider_status: string;
    provider_result: string;
    platform_commission: number;
    settlement_status: string;
    disbursement_id: string;
    provider_transfer_reference: string;
    provider_transfer_status: string;
    product_name: string;
    customer_name: string;
    customer_phone: string;
    order_status: string;
    order_quantity: number;
    pickup_code: string;
    consumed_at: string;
}

const MERCHANT_TRANSACTION_COLUMNS = [
    "transaction_id",
    "transaction_date",
    "payment_status",
    "q_gabon_reference",
    "base_amount",
    "total_amount",
    "merchant_revenue",
    "q_gabon_fees",
    "payment_phone_number",
    "operator",
    "status_code",
    "product_name",
    "customer_name",
    "customer_phone",
    "order_status",
    "order_quantity",
    "pickup_code",
    "consumed_at",
].join(",");

// Status mapping
const STATUS_MAP = {
    PENDING: { label: 'En attente', variant: 'secondary' as const, icon: Clock },
    SUCCESS: { label: 'Payé', variant: 'default' as const, icon: CheckCircle },
    FAILED: { label: 'Échoué', variant: 'destructive' as const, icon: Receipt },
    CANCELLED: { label: 'Annulé', variant: 'destructive' as const, icon: Receipt },
    TIMEOUT: { label: 'Expiré', variant: 'destructive' as const, icon: Receipt }
};

const STATUS_FILTERS = [
    { value: "all", label: "Tous les statuts" },
    { value: "SUCCESS", label: "Payé" },
    { value: "PENDING", label: "En attente" },
    { value: "FAILED", label: "Échoué" },
    { value: "TIMEOUT", label: "Expiré" },
    { value: "CANCELLED", label: "Annulé" },
];

export default function MerchantTransactionsPage() {
    const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTransaction, setSelectedTransaction] = useState<MerchantTransaction | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [syncingReference, setSyncingReference] = useState<string | null>(null);

    const fetchTransactions = async () => {
        try {
            const result = await getMerchantPaymentTransactions(200);
            if (!result.success || !result.data) {
                throw new Error(result.error?.message || 'Erreur lors du chargement');
            }

            setTransactions(result.data as unknown as MerchantTransaction[]);
        } catch (error) {
            console.error('Error fetching transactions:', error);
            toast.error('Erreur lors du chargement des transactions');
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
        const channel = subscribeToTransactions('merchant-transactions', () => {
            fetchTransactions();
        });

        return () => {
            unsubscribeChannel(channel);
        };
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    };

    const filteredTransactions = transactions.filter((tx) => (
        statusFilter === "all" ? true : tx.payment_status === statusFilter
    ));

    const handleSyncTransaction = async (tx: MerchantTransaction) => {
        const reference = tx.provider_reference || tx.q_gabon_reference;
        if (!reference && !tx.provider_transaction_id) {
            toast.error("Reference SingPay indisponible");
            return;
        }

        setSyncingReference(reference || tx.provider_transaction_id);
        const result = await syncSingPayTransactionStatus({
            reference: reference || undefined,
            transactionId: tx.provider_transaction_id || undefined,
        });
        setSyncingReference(null);

        if (!result.success) {
            toast.error(result.error?.message || "Synchronisation impossible");
            return;
        }

        toast.success("Statut SingPay synchronise");
        fetchTransactions();
    };

    // Calculate stats
    const totalRevenue = transactions
        .filter(tx => tx.payment_status === 'SUCCESS')
        .reduce((sum, tx) => sum + tx.merchant_revenue, 0);

    const totalSales = transactions.filter(tx => tx.payment_status === 'SUCCESS').length;
    const pendingCount = transactions.filter(tx => tx.payment_status === 'PENDING').length;
    const totalFees = transactions
        .filter(tx => tx.payment_status === 'SUCCESS')
        .reduce((sum, tx) => sum + (tx.total_amount - tx.merchant_revenue), 0);

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-6">
            {/* Header */}
            <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Mes Ventes</h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
                    Historique et statistiques de vos ventes
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                                    <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground">Revenus totaux</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <ShoppingBag className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            {loading ? (
                                <Skeleton className="h-8 w-12" />
                            ) : (
                                <>
                                    <p className="text-xl sm:text-2xl font-bold">{totalSales}</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground">Ventes réussies</p>
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
                                    <p className="text-xl sm:text-2xl font-bold">{pendingCount}</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground">En attente</p>
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
                                <Skeleton className="h-8 w-24" />
                            ) : (
                                <>
                                    <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totalFees)}</p>
                                    <p className="text-xs sm:text-sm text-muted-foreground">Frais totaux</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-end">
                <div className="w-full sm:w-[220px]">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4" />
                                <SelectValue placeholder="Statut" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_FILTERS.map((filter) => (
                                <SelectItem key={filter.value} value={filter.value}>
                                    {filter.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Transactions Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm sm:text-base">Historique des ventes</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="font-medium">Aucune vente</p>
                            <p className="text-sm mt-1">Vos ventes apparaîtront ici</p>
                        </div>
                    ) : (
                        <div className="-mx-4 sm:mx-0 overflow-x-auto">
                            <div className="inline-block min-w-full align-middle">
                                <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Référence</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Produit</TableHead>
                                    <TableHead className="text-right">Revenu</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="text-right">Détails</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTransactions.map((tx) => {
                                    const status = STATUS_MAP[tx.payment_status as keyof typeof STATUS_MAP] ||
                                        { label: tx.payment_status, variant: 'secondary' as const, icon: Receipt };
                                    const reference = tx.provider_reference || tx.q_gabon_reference;

                                    return (
                                        <TableRow key={tx.transaction_id}>
                                            <TableCell className="font-mono text-sm">
                                                {reference || 'N/A'}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {tx.customer_name}
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate">
                                                {tx.product_name}
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-green-600">
                                                {formatCurrency(tx.merchant_revenue)}
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(tx.transaction_date), "d MMM yyyy", { locale: fr })}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={status.variant}>
                                                    {status.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleSyncTransaction(tx)}
                                                    disabled={syncingReference === reference}
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${syncingReference === reference ? "animate-spin" : ""}`} />
                                                </Button>
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
                    )}
                </CardContent>
            </Card>

            {/* Transaction Details Dialog */}
            <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
                <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>Détails de la vente</DialogTitle>
                    </DialogHeader>

                    {selectedTransaction && (
                        <div className="space-y-6">
                            {/* Référence */}
                            <div className="space-y-2">
                                <h3 className="font-semibold text-sm text-muted-foreground">Référence</h3>
                                <p className="font-mono text-sm bg-muted p-2 rounded">
                                    {selectedTransaction.provider_reference || selectedTransaction.q_gabon_reference}
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
                                    <div className="flex justify-between text-muted-foreground">
                                        <span className="text-xs">Commission plateforme:</span>
                                        <span className="text-xs">{formatCurrency(selectedTransaction.platform_commission || 0)}</span>
                                    </div>
                                    {selectedTransaction.q_gabon_fees > 0 && (
                                        <div className="flex justify-between text-blue-600">
                                            <span className="text-xs">Frais Q-Gabon:</span>
                                            <span className="text-xs font-medium">{formatCurrency(selectedTransaction.q_gabon_fees)}</span>
                                        </div>
                                    )}
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Total payé par client:</span>
                                        <span>{formatCurrency(selectedTransaction.total_amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600 font-bold">
                                        <span>Votre revenu:</span>
                                        <span>{formatCurrency(selectedTransaction.merchant_revenue)}</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>Reversement:</span>
                                        <span>{selectedTransaction.settlement_status || 'non cree'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Informations */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Client</p>
                                    <p className="font-medium">{selectedTransaction.customer_name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Téléphone</p>
                                    <p className="font-medium">{selectedTransaction.customer_phone}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Produit</p>
                                    <p className="font-medium">{selectedTransaction.product_name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Quantité</p>
                                    <p className="font-medium">{selectedTransaction.order_quantity}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Opérateur</p>
                                    <p className="font-medium">{selectedTransaction.operator}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Statut SingPay</p>
                                    <p className="font-medium">{selectedTransaction.provider_status || selectedTransaction.status_code || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Résultat SingPay</p>
                                    <p className="font-medium">{selectedTransaction.provider_result || 'N/A'}</p>
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

                            {/* QR Code Info */}
                            {selectedTransaction.pickup_code && (
                                <div className="space-y-2 border-t pt-4">
                                    <h3 className="font-semibold text-sm text-muted-foreground">📱 Code de Retrait</h3>
                                    <div className="bg-muted p-3 rounded text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Code:</span>
                                            <code className="font-mono text-xs bg-background px-2 py-1 rounded">
                                                {selectedTransaction.pickup_code}
                                            </code>
                                        </div>
                                        {selectedTransaction.consumed_at ? (
                                            <div className="mt-2 pt-2 border-t text-xs">
                                                <div className="flex justify-between">
                                                    <span className="text-green-600">✓ Récupéré le:</span>
                                                    <span>{format(new Date(selectedTransaction.consumed_at), "d MMM yyyy", { locale: fr })}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-2 pt-2 border-t text-xs text-amber-600">
                                                ⏳ En attente de récupération
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Date */}
                            <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                                Vente effectuée le {format(new Date(selectedTransaction.transaction_date), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
