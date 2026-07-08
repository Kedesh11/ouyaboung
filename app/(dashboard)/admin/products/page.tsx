"use client";

// ============================================
// Admin Products Page - Products & Baskets
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueWithIcon,
} from "@/components/ui/select";
import { Search, Package, ShoppingBasket, Eye, Store, Loader2, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import { toast } from "sonner";
import { AdminProduct } from "@/types/admin.types";

const ITEMS_PER_PAGE = 5;

const AdminProductsPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("products");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: allItems, isLoading, error } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => adminService.getProducts(),
  });

  if (error) {
    toast.error("Erreur lors du chargement des produits");
  }

  const products = allItems?.filter(item => item.category !== 'mixed_basket') || [];
  const baskets = allItems?.filter(item => item.category === 'mixed_basket') || [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
  };

  const filterItems = (items: AdminProduct[]) => {
    return items.filter(item => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        item.name.toLowerCase().includes(query) ||
        (item.merchantName?.toLowerCase() || '').includes(query)
      );
      
      const matchesStatus = statusFilter === 'all' 
        ? true 
        : statusFilter === 'active' 
          ? item.isAvailable 
          : !item.isAvailable;

      return matchesSearch && matchesStatus;
    });
  };

  const filteredProducts = filterItems(products);
  const filteredBaskets = filterItems(baskets);

  // Pagination logic
  const totalPagesProducts = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const totalPagesBaskets = Math.ceil(filteredBaskets.length / ITEMS_PER_PAGE);

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const paginatedBaskets = filteredBaskets.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
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

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Produits & Paniers</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Vue d&apos;ensemble du catalogue (Lecture seule)
        </p>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-sm text-muted-foreground">Produits</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <ShoppingBasket className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{baskets.length}</p>
              <p className="text-sm text-muted-foreground">Paniers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Store className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {products.filter(p => p.isAvailable).length +
                  baskets.filter(b => b.isAvailable).length}
              </p>
              <p className="text-sm text-muted-foreground">Actifs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou commerce..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValueWithIcon icon={Filter} placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="inactive">Épuisés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="products" className="gap-2">
            <Package className="w-4 h-4" />
            Produits ({filteredProducts.length})
          </TabsTrigger>
          <TabsTrigger value="baskets" className="gap-2">
            <ShoppingBasket className="w-4 h-4" />
            Paniers ({filteredBaskets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Catalogue des produits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead>Commerce</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead className="text-right">Prix original</TableHead>
                      <TableHead className="text-right">Prix réduit</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Détails</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.merchantName || 'Inconnu'}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell className="text-right line-through text-muted-foreground">
                          {formatCurrency(product.originalPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(product.discountPrice)}
                        </TableCell>
                        <TableCell className="text-center">{product.quantity}</TableCell>
                        <TableCell>
                          <Badge variant={product.isAvailable ? 'default' : 'secondary'}>
                            {product.isAvailable ? 'Actif' : 'Épuisé'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" title="Détails (à venir)">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Aucun produit trouvé
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPagesProducts > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {[...Array(totalPagesProducts)].map((_, i) => (
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
                          onClick={() => setCurrentPage(p => Math.min(totalPagesProducts, p + 1))}
                          className={currentPage === totalPagesProducts ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="baskets">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Catalogue des paniers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Panier</TableHead>
                      <TableHead>Commerce</TableHead>
                      <TableHead>Contenu</TableHead>
                      <TableHead className="text-right">Prix original</TableHead>
                      <TableHead className="text-right">Prix réduit</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Détails</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBaskets.map((basket) => (
                      <TableRow key={basket.id}>
                        <TableCell className="font-medium">{basket.name}</TableCell>
                        <TableCell className="text-muted-foreground">{basket.merchantName || 'Inconnu'}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {basket.description || 'Aucun contenu spécifié'}
                        </TableCell>
                        <TableCell className="text-right line-through text-muted-foreground">
                          {formatCurrency(basket.originalPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(basket.discountPrice)}
                        </TableCell>
                        <TableCell className="text-center">{basket.quantity}</TableCell>
                        <TableCell>
                          <Badge variant={basket.isAvailable ? 'default' : 'secondary'}>
                            {basket.isAvailable ? 'Actif' : 'Épuisé'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" title="Détails (à venir)">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredBaskets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Aucun panier trouvé
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPagesBaskets > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {[...Array(totalPagesBaskets)].map((_, i) => (
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
                          onClick={() => setCurrentPage(p => Math.min(totalPagesBaskets, p + 1))}
                          className={currentPage === totalPagesBaskets ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminProductsPage;
