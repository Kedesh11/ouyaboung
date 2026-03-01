"use client";

// ============================================
// Admin Transactions Page - Sales Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect } from "react";
import { createBrowserClient } from '@supabase/ssr';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShoppingBag, DollarSign, TrendingUp, Eye, Calendar, Receipt, Filter } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// Types
interface Transaction {
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
  // Order info
  order_id: string;
  order_quantity: number;
  order_status: string;
  pickup_code: string;
  consumed_at: string;
  consumed_by: string;
  // Product/Merchant/Customer
  product_name: string;
  merchant_name: string;
  customer_name: string;
  customer_phone: string;
}

const ADMIN_TRANSACTION_COLUMNS = [
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
  "order_id",
  "order_quantity",
  "order_status",
  "pickup_code",
  "consumed_at",
  "consumed_by",
  "product_name",
  "merchant_name",
  "customer_name",
  "customer_phone",
].join(",");

// Status mapping
const STATUS_MAP = {
  PENDING: { label: 'En attente', variant: 'secondary' as const },
  SUCCESS: { label: 'Terminé', variant: 'default' as const },
  FAILED: { label: 'Échoué', variant: 'destructive' as const },
  CANCELLED: { label: 'Annulé', variant: 'destructive' as const },
  TIMEOUT: { label: 'Expiré', variant: 'destructive' as const }
};

const ITEMS_PER_PAGE = 5;

const AdminTransactionsPage = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Initialize Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch transactions
  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('merchant_transactions')
        .select(ADMIN_TRANSACTION_COLUMNS)
        .order('transaction_date', { ascending: false })
        .range(0, 499);

      if (error) throw error;

      setTransactions((data || []) as unknown as Transaction[]);
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
    const channel = supabase
      .channel('admin-transactions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions'
      }, () => {
        fetchTransactions(); // Refresh on any change
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      tx.q_gabon_reference?.toLowerCase().includes(query) ||
      tx.customer_name?.toLowerCase().includes(query) ||
      tx.merchant_name?.toLowerCase().includes(query) ||
      tx.product_name?.toLowerCase().includes(query)
    );

    const matchesStatus = statusFilter === 'all'
      ? true
      : tx.payment_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalRevenue = transactions
    .filter(tx => tx.payment_status === 'SUCCESS')
    .reduce((sum, tx) => sum + tx.total_amount, 0);

  const completedCount = transactions.filter(tx => tx.payment_status === 'SUCCESS').length;
  const pendingCount = transactions.filter(tx => tx.payment_status === 'PENDING').length;

  // Pagination logic
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Suivi des ventes et transactions
        </p>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
                  <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
                  <p className="text-sm text-muted-foreground">Revenus</p>
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
                  <p className="text-2xl font-bold">{completedCount}</p>
                  <p className="text-sm text-muted-foreground">Complétées</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-600" />
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une transaction..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Statut" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="SUCCESS">Succès</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="FAILED">Échoué</SelectItem>
              <SelectItem value="CANCELLED">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liste des transactions</CardTitle>
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
              <p>Aucune transaction trouvée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Commerce</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.map((tx) => {
                    const status = STATUS_MAP[tx.payment_status as keyof typeof STATUS_MAP] ||
                      { label: tx.payment_status, variant: 'secondary' as const };

                    return (
                      <TableRow key={tx.transaction_id}>
                        <TableCell className="font-mono text-sm">
                          {tx.q_gabon_reference || 'N/A'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {tx.customer_name || 'Inconnu'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.merchant_name}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {tx.product_name}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(tx.total_amount)}
                        </TableCell>
                        <TableCell>
                          {format(new Date(tx.transaction_date), "d MMM yyyy HH:mm", { locale: fr })}
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
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i + 1}>
                      <PaginationLink
                        isActive={currentPage === i + 1}
                        onClick={() => setCurrentPage(i + 1)}
                        className="cursor-pointer"
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Details Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de la transaction</DialogTitle>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-6">
              {/* Référence */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">Référence Q-Gabon</h3>
                <p className="font-mono text-sm bg-muted p-2 rounded">
                  {selectedTransaction.q_gabon_reference}
                </p>
              </div>

              {/* Montants détaillés */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">💰 Détails Financiers</h3>
                <div className="bg-muted p-4 rounded space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Montant de base:</span>
                    <span className="font-medium">{formatCurrency(selectedTransaction.base_amount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Frais Airtel/Moov:</span>
                    <span>{formatCurrency(selectedTransaction.airtel_fees || 0)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Frais PVIT:</span>
                    <span>{formatCurrency(selectedTransaction.pvit_fees || 0)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Frais App:</span>
                    <span>{formatCurrency(selectedTransaction.app_fees || 0)}</span>
                  </div>
                  {selectedTransaction.q_gabon_fees > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>Frais Q-Gabon (total):</span>
                      <span className="font-medium">{formatCurrency(selectedTransaction.q_gabon_fees)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-bold">
                    <span>Total payé:</span>
                    <span>{formatCurrency(selectedTransaction.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Revenu commerce:</span>
                    <span className="font-medium">{formatCurrency(selectedTransaction.merchant_revenue)}</span>
                  </div>
                </div>
              </div>

              {/* Informations */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Client</p>
                  <p className="font-medium">{selectedTransaction.customer_name}</p>
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
                  <p className="text-muted-foreground">Commerce</p>
                  <p className="font-medium">{selectedTransaction.merchant_name}</p>
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
                  <Badge variant=  "secondary">
                    {selectedTransaction.order_status}
                  </Badge>
                </div>
              </div>

              {/* Q-Gabon Technical Data */}
              {(selectedTransaction.q_gabon_fees > 0 || selectedTransaction.operator_owner_charge) && (
                <div className="space-y-2 border-t pt-4">
                  <h3 className="font-semibold text-sm text-muted-foreground">🔧 Données Techniques Q-Gabon</h3>
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-xs space-y-1">
                    {selectedTransaction.operator_fees > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Frais opérateur:</span>
                        <span className="font-mono">{formatCurrency(selectedTransaction.operator_fees)}</span>
                      </div>
                    )}
                    {selectedTransaction.operator_owner_charge && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payeur frais:</span>
                        <span className="font-mono">{selectedTransaction.operator_owner_charge}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                    {selectedTransaction.consumed_at && (
                      <div className="mt-2 pt-2 border-t text-xs">
                        <div className="flex justify-between">
                          <span className="text-green-600">✓ Consommé le:</span>
                          <span>{format(new Date(selectedTransaction.consumed_at), "d MMM yyyy", { locale: fr })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Transaction IDs */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">Identifiants</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transaction ID:</span>
                    <span className="font-mono">{selectedTransaction.q_gabon_transaction_id || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Merchant Ref ID:</span>
                    <span className="font-mono">{selectedTransaction.merchant_reference_id || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order ID:</span>
                    <span className="font-mono">{selectedTransaction.order_id}</span>
                  </div>
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
                Transaction créée le {format(new Date(selectedTransaction.transaction_date), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTransactionsPage;
