"use client";

// ============================================
// Admin Farmers Page - Directory Management
// ouyaboung Platform - Répertoire des agriculteurs
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
import { Search, Sprout, Eye, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import FarmerValidationModal from "@/components/admin/FarmerValidationModal";
import { FarmerRegistration } from "@/types/admin.types";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAdminFarmers, useInvalidateAdminFarmers } from "@/hooks/useAdminData";

const ITEMS_PER_PAGE = 3;

const AdminFarmersPage = () => {
  const { data: farmers = [], isLoading, error } = useAdminFarmers();
  const invalidateFarmers = useInvalidateAdminFarmers();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerRegistration | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (error) {
      console.error("Error loading farmers:", error);
      toast.error("Erreur lors du chargement des agriculteurs");
    }
  }, [error]);

  const filteredFarmers = farmers.filter(farmer => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      farmer.farmName.toLowerCase().includes(query) ||
      farmer.ownerName.toLowerCase().includes(query) ||
      farmer.email.toLowerCase().includes(query)
    );

    const matchesStatus = activeTab === 'all'
      ? true
      : activeTab === 'pending'
        ? farmer.status === 'pending'
        : activeTab === 'validated'
          ? farmer.status === 'validated'
          : farmer.status === 'refused';

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredFarmers.length / ITEMS_PER_PAGE);
  const paginatedFarmers = filteredFarmers.slice(
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

  const FarmerTable = ({ data }: { data: FarmerRegistration[] }) => (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead>Exploitation</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Date d&apos;inscription</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((farmer) => (
              <TableRow key={farmer.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sprout className="w-4 h-4 text-primary" />
                    </div>
                    {farmer.farmName}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">{farmer.ownerName}</p>
                    <p className="text-xs text-muted-foreground">{farmer.email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{farmer.farmerType}</Badge>
                </TableCell>
                <TableCell>{farmer.city}</TableCell>
                <TableCell>
                  {format(farmer.createdAt, "d MMM yyyy", { locale: fr })}
                </TableCell>
                <TableCell>
                  {farmer.status === 'validated' && (
                    <Badge className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" /> Validé
                    </Badge>
                  )}
                  {farmer.status === 'pending' && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                      <Clock className="w-3 h-3 mr-1" /> En attente
                    </Badge>
                  )}
                  {farmer.status === 'refused' && (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" /> Refusé
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFarmer(farmer)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Aucun agriculteur trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Gestion des agriculteurs</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez le répertoire des agriculteurs de la plateforme
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sprout className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{farmers.length}</p>
              <p className="text-sm text-muted-foreground">Total Agriculteurs</p>
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
                {farmers.filter(f => f.status === 'validated').length}
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
                {farmers.filter(f => f.status === 'pending').length}
              </p>
              <p className="text-sm text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un agriculteur..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4 w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">Tous ({farmers.length})</TabsTrigger>
          <TabsTrigger value="validated">
            Validés ({farmers.filter(f => f.status === 'validated').length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            En attente ({farmers.filter(f => f.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="refused">
            Refusés ({farmers.filter(f => f.status === 'refused').length})
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liste des agriculteurs</CardTitle>
          </CardHeader>
          <CardContent>
            <TabsContent value="all" className="mt-0">
              <FarmerTable data={paginatedFarmers} />
            </TabsContent>
            <TabsContent value="validated" className="mt-0">
              <FarmerTable data={paginatedFarmers} />
            </TabsContent>
            <TabsContent value="pending" className="mt-0">
              <FarmerTable data={paginatedFarmers} />
            </TabsContent>
            <TabsContent value="refused" className="mt-0">
              <FarmerTable data={paginatedFarmers} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      <FarmerValidationModal
        farmer={selectedFarmer}
        mode="view"
        isOpen={!!selectedFarmer}
        onClose={() => setSelectedFarmer(null)}
        onConfirm={() => {}}
      />
    </div>
  );
};

export default AdminFarmersPage;
