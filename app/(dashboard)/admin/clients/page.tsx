"use client";

// ============================================
// Admin Clients Page - User Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Search, Users, Eye, Mail, Filter } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { adminService } from "@/services/admin.service";
import type { AdminClient } from "@/types/admin.types";
import { toast } from "sonner";
import { ClientDetailsModal } from "@/components/admin/ClientDetailsModal";

const ITEMS_PER_PAGE = 5;

const AdminClientsPage = () => {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<AdminClient | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      try {
        const data = await adminService.getClients();
        setClients(data);
      } catch (error) {
        console.error("Error loading clients:", error);
        toast.error("Erreur lors du chargement des clients");
      }
    };

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

    const matchesRole = roleFilter === 'all'
      ? true
      : roleFilter === 'merchant'
        ? client.role === 'merchant'
        : client.role === 'user';

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
                        <Badge variant={client.role === 'merchant' ? 'default' : 'secondary'}>
                          {client.role === 'merchant' ? 'Marchand' : 'Client'}
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
    </div>
  );
};

export default AdminClientsPage;
