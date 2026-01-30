"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from '@supabase/ssr';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Receipt, Eye, DollarSign, TrendingUp, Clock, CheckCircle } from "lucide-react";
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
    q_gabon_transaction_id: string;
    merchant_reference_id: string;
    operator: string;
    status_code: string;
    message: string;
    product_name: string;
    merchant_name: string;
    customer_phone: string;
    order_status: string;
}

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
                .select('*')
                .eq('customer_id', user.id)
                .order('transaction_date', { ascending: false });

            if (error) throw error;

            setTransactions(data || []);
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
                fetchTransactions();
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    };

    // Calculate stats
    const totalSpent = transactions
        .filter(tx => tx.payment_status === 'SUCCESS')
        .reduce((sum, tx) => sum + tx.total_amount, 0);

    const successCount = transactions.filter(tx => tx.payment_status === 'SUCCESS').length;
    const pendingCount = transactions.filter(tx => tx.payment_status === 'PENDING').length;

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Mes Transactions</h1>
                <p className="text-muted-foreground mt-2">
                    Historique de tous vos paiements sur ouyaboung
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                                    <p className="text-2xl font-bold">{transactions.length}</p>
                                    <p className="text-sm text-muted-foreground">Total</p>
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
                <CardHeader>
                    <CardTitle className="text-base">Historique des paiements</CardTitle>
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
                                {transactions.map((tx) => {
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
                                <h3 className="font-semibold text-sm text-muted-foreground">Détails du montant</h3>
                                <div className="bg-muted p-4 rounded space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Prix du produit:</span>
                                        <span className="font-medium">{formatCurrency(selectedTransaction.base_amount)}</span>
                                    </div>
                                    <div className="border-t my-2 pt-2">
                                        <p className="text-xs text-muted-foreground mb-2">Frais de transaction</p>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="text-xs">Frais Airtel (3%):</span>
                                            <span className="text-xs">{formatCurrency(selectedTransaction.airtel_fees)}</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="text-xs">Frais PVIT (3%):</span>
                                            <span className="text-xs">{formatCurrency(selectedTransaction.pvit_fees)}</span>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="text-xs">Frais plateforme (3%):</span>
                                            <span className="text-xs">{formatCurrency(selectedTransaction.app_fees)}</span>
                                        </div>
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
                                    <p className="text-muted-foreground">Opérateur</p>
                                    <p className="font-medium">{selectedTransaction.operator}</p>
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
