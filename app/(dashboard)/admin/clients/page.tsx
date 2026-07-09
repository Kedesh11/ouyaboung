"use client";

// ============================================
// Admin Clients Page - User Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  SelectValueWithIcon,
} from "@/components/ui/select";
import { Search, Users, Eye, Mail, Filter, UserCog, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { adminService } from "@/services/admin.service";
import type { AdminClient, BulkActionResponse } from "@/types/admin.types";
import { toast } from "sonner";
import { ClientDetailsModal } from "@/components/admin/ClientDetailsModal";
import { useAuth } from "@/contexts/AuthContext";

const ITEMS_PER_PAGE = 5;

const ROLE_LABELS: Record<AdminClient["role"], string> = {
  user: "Client",
  merchant: "Marchand",
  admin: "Administrateur",
};

const BULK_REASON_LABELS: Record<string, string> = {
  HAS_TRANSACTIONS: "historique de transactions",
  LAST_ADMIN_GUARD: "dernier administrateur requis",
  USER_NOT_FOUND: "utilisateur introuvable",
  AUTH_DELETE_FAILED: "échec de suppression",
  DB_UPDATE_FAILED: "échec de mise à jour",
};

const AdminClientsPage = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<AdminClient | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<AdminClient["role"]>("user");
  const [confirmAction, setConfirmAction] = useState<null | "role" | "delete">(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const loadClients = async () => {
    try {
      const data = await adminService.getClients();
      setClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast.error("Erreur lors du chargement des clients");
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
  };

  const filteredClients = clients.filter((client) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      client.fullName.toLowerCase().includes(query) ||
      client.email.toLowerCase().includes(query) ||
      (client.phone || "").includes(query)
    );

    const matchesRole = roleFilter === 'all' ? true : client.role === roleFilter;

    const matchesStatus = statusFilter === 'all'
      ? true
      : client.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  // Selection persists across pagination/filter changes - only cleared
  // explicitly or after a successful bulk action.
  const pageIds = paginatedClients.map((c) => c.id);
  const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const headerCheckedState: boolean | "indeterminate" =
    pageIds.length === 0 || pageSelectedCount === 0
      ? false
      : pageSelectedCount === pageIds.length
        ? true
        : "indeterminate";

  const toggleSelectPage = (checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const reportBulkOutcome = (res: BulkActionResponse) => {
    const { succeeded, failed } = res.summary;
    if (failed === 0) {
      toast.success(`${succeeded} utilisateur(s) mis à jour avec succès`);
      return;
    }
    const firstIssue = res.results.find((r) => !r.ok);
    const reasonLabel = firstIssue?.detail || (firstIssue?.reason ? BULK_REASON_LABELS[firstIssue.reason] : undefined);
    toast.warning(
      `${succeeded} réussi(s), ${failed} échec(s)${reasonLabel ? ` (${reasonLabel})` : ""}`,
      { description: failed > 1 ? "Voir la console pour le détail complet." : undefined }
    );
    console.warn("Bulk action partial failures:", res.results.filter((r) => !r.ok));
  };

  const handleConfirmBulkRole = async () => {
    setIsBulkProcessing(true);
    try {
      const res = await adminService.bulkUpdateUserRole(Array.from(selectedIds), bulkRole);
      reportBulkOutcome(res);
      await loadClients();
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du changement de rôle");
    } finally {
      setIsBulkProcessing(false);
      setConfirmAction(null);
    }
  };

  const handleConfirmBulkDelete = async () => {
    setIsBulkProcessing(true);
    try {
      const res = await adminService.bulkDeleteUsers(Array.from(selectedIds));
      reportBulkOutcome(res);
      await loadClients();
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    } finally {
      setIsBulkProcessing(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Gestion des clients</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Consultez et gérez les clients de la plateforme
        </p>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{clients.length}</p>
              <p className="text-sm text-muted-foreground">Utilisateurs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {clients.filter(c => c.status === 'active').length}
              </p>
              <p className="text-sm text-muted-foreground">Actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(clients.reduce((acc, c) => acc + c.totalSpent, 0))}
              </p>
              <p className="text-sm text-muted-foreground">Dépenses totales</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-[150px]">
          <Select value={roleFilter} onValueChange={handleRoleChange}>
            <SelectTrigger>
              <SelectValueWithIcon icon={Filter} placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="user">Clients</SelectItem>
              <SelectItem value="merchant">Marchands</SelectItem>
              <SelectItem value="admin">Administrateurs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[150px]">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValueWithIcon icon={Filter} placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-muted/50 p-3 mb-4">
          <p className="text-sm font-medium">
            {selectedIds.size} utilisateur{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
          </p>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
            <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as AdminClient["role"])} disabled={isBulkProcessing}>
              <SelectTrigger className="w-[170px]">
                <SelectValueWithIcon icon={UserCog} placeholder="Nouveau rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Client</SelectItem>
                <SelectItem value="merchant">Marchand</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={isBulkProcessing} onClick={() => setConfirmAction("role")}>
              Changer le rôle
            </Button>
            <Button variant="destructive" size="sm" disabled={isBulkProcessing} onClick={() => setConfirmAction("delete")}>
              <Trash2 className="w-4 h-4 mr-1" />
              Supprimer
            </Button>
            <Button variant="ghost" size="sm" disabled={isBulkProcessing} onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4 mr-1" />
              Annuler la sélection
            </Button>
          </div>
        </div>
      )}

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liste des utilisateurs ({filteredClients.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Users className="w-10 h-10 mb-3 opacity-50" />
              <p>
                {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                  ? "Aucun client ne correspond à votre recherche"
                  : "Aucun client trouvé pour le moment"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={headerCheckedState}
                        onCheckedChange={toggleSelectPage}
                        disabled={isBulkProcessing}
                        aria-label="Sélectionner tous les utilisateurs de cette page"
                      />
                    </TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Inscription</TableHead>
                    <TableHead className="text-center">Commandes</TableHead>
                    <TableHead className="text-right">Total dépensé</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(client.id)}
                          onCheckedChange={(checked) => toggleSelectOne(client.id, checked)}
                          disabled={isBulkProcessing || client.id === user?.id}
                          aria-label={`Sélectionner ${client.fullName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {client.fullName
                                .split(" ")
                                .map((p) => p[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{client.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {client.phone || "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {client.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(client.createdAt, "d MMM yyyy", { locale: fr })}
                      </TableCell>
                      <TableCell className="text-center">
                        {client.ordersCount}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(client.totalSpent)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.role === 'admin' ? 'destructive' : client.role === 'merchant' ? 'default' : 'secondary'}>
                          {ROLE_LABELS[client.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            client.status === "active" ? "default" : "secondary"
                          }
                        >
                          {client.status === "active" ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedClient(client)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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

      <ClientDetailsModal
        client={selectedClient}
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
      />

      <AlertDialog open={confirmAction === "role"} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le changement de rôle</AlertDialogTitle>
            <AlertDialogDescription>
              Le rôle de {selectedIds.size} utilisateur{selectedIds.size > 1 ? "s" : ""} sera changé en «{" "}
              {ROLE_LABELS[bulkRole]} ». Cette action prend effet immédiatement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={isBulkProcessing} onClick={handleConfirmBulkRole}>
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === "delete"} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ces utilisateurs ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de supprimer définitivement {selectedIds.size} compte{selectedIds.size > 1 ? "s" : ""}.
              Cette action est irréversible : profil, commandes, favoris et historique associés seront supprimés.
              Les comptes ayant un historique de transaction seront automatiquement ignorés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkProcessing}
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleConfirmBulkDelete}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminClientsPage;
