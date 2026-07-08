"use client";

// ============================================
// Admin Merchants Page - Directory Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Search, Store, Eye, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import MerchantValidationModal from "@/components/admin/MerchantValidationModal";
import { MerchantRegistration } from "@/types/admin.types";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAdminMerchants, useInvalidateAdminMerchants } from "@/hooks/useAdminData";

const ITEMS_PER_PAGE = 3;

const AdminMerchantsPage = () => {
  const { data: merchants = [], isLoading, error } = useAdminMerchants();
  const invalidateMerchants = useInvalidateAdminMerchants();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRegistration | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (error) {
      console.error("Error loading merchants:", error);
      toast.error("Erreur lors du chargement des commerces");
    }
  }, [error]);

  const handleValidationSuccess = (updatedMerchant: MerchantRegistration) => {
    invalidateMerchants();
    toast.success(`Statut du commerce mis à jour: ${updatedMerchant.status === 'validated' ? 'Validé' : 'Refusé'}`);
    setSelectedMerchant(null);
  };

  const filteredMerchants = merchants.filter(merchant => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      merchant.businessName.toLowerCase().includes(query) ||
      merchant.ownerName.toLowerCase().includes(query) ||
      merchant.email.toLowerCase().includes(query)
    );
    
    const matchesStatus = activeTab === 'all' 
      ? true 
      : activeTab === 'pending'
        ? merchant.status === 'pending'
        : activeTab === 'validated'
          ? merchant.status === 'validated'
          : merchant.status === 'refused';

    return matchesSearch && matchesStatus;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredMerchants.length / ITEMS_PER_PAGE);
  const paginatedMerchants = filteredMerchants.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const MerchantTable = ({ data }: { data: MerchantRegistration[] }) => (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead>Commerce</TableHead>
              <TableHead>Propriétaire</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Date d&apos;inscription</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((merchant) => (
              <TableRow key={merchant.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Store className="w-4 h-4 text-primary" />
                    </div>
                    {merchant.businessName}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">{merchant.ownerName}</p>
                    <p className="text-xs text-muted-foreground">{merchant.email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{merchant.businessType}</Badge>
                </TableCell>
                <TableCell>{merchant.city}</TableCell>
                <TableCell>
                  {format(merchant.createdAt, "d MMM yyyy", { locale: fr })}
                </TableCell>
                <TableCell>
                  {merchant.status === 'validated' && (
                    <Badge className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" /> Validé
                    </Badge>
                  )}
                  {merchant.status === 'pending' && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                      <Clock className="w-3 h-3 mr-1" /> En attente
                    </Badge>
                  )}
                  {merchant.status === 'refused' && (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" /> Refusé
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMerchant(merchant)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Aucun commerce trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
    </>
  );

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Gestion des commerces</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez tous les commerces de la plateforme
        </p>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{merchants.length}</p>
              <p className="text-sm text-muted-foreground">Total Commerces</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {merchants.filter(m => m.status === 'validated').length}
              </p>
              <p className="text-sm text-muted-foreground">Validés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {merchants.filter(m => m.status === 'pending').length}
              </p>
              <p className="text-sm text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un commerce..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4 w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">Tous ({merchants.length})</TabsTrigger>
          <TabsTrigger value="validated">
            Validés ({merchants.filter(m => m.status === 'validated').length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            En attente ({merchants.filter(m => m.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="refused">
            Refusés ({merchants.filter(m => m.status === 'refused').length})
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liste des commerces</CardTitle>
          </CardHeader>
          <CardContent>
            <TabsContent value="all" className="mt-0">
              <MerchantTable data={paginatedMerchants} />
            </TabsContent>
            <TabsContent value="validated" className="mt-0">
              <MerchantTable data={paginatedMerchants} />
            </TabsContent>
            <TabsContent value="pending" className="mt-0">
              <MerchantTable data={paginatedMerchants} />
            </TabsContent>
            <TabsContent value="refused" className="mt-0">
              <MerchantTable data={paginatedMerchants} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      <MerchantValidationModal
        merchant={selectedMerchant}
        mode="view"
        isOpen={!!selectedMerchant}
        onClose={() => setSelectedMerchant(null)}
        onConfirm={() => {}}
      />
    </div>
  );
};

export default AdminMerchantsPage;
