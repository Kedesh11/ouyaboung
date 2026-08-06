"use client";

// ============================================
// Admin Validations Page - Pending Merchants & Farmers
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import MerchantValidationCard from "@/components/admin/MerchantValidationCard";
import MerchantValidationModal from "@/components/admin/MerchantValidationModal";
import FarmerValidationCard from "@/components/admin/FarmerValidationCard";
import FarmerValidationModal from "@/components/admin/FarmerValidationModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, Store, Sprout } from "lucide-react";
import { adminService } from "@/services/admin.service";
import type { MerchantRegistration, FarmerRegistration } from "@/types/admin.types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const ITEMS_PER_PAGE = 3;

const AdminValidationsPage = () => {
  const { user } = useAuth();
  const [activeEntityTab, setActiveEntityTab] = useState<"merchants" | "farmers">("merchants");

  // ---- Merchants ----
  const [pendingMerchants, setPendingMerchants] = useState<MerchantRegistration[]>([]);
  const [merchantSearchQuery, setMerchantSearchQuery] = useState("");
  const [isMerchantsLoading, setIsMerchantsLoading] = useState(true);
  const [merchantPage, setMerchantPage] = useState(1);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRegistration | null>(null);
  const [merchantModalMode, setMerchantModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isMerchantModalOpen, setIsMerchantModalOpen] = useState(false);
  const [isMerchantProcessing, setIsMerchantProcessing] = useState(false);

  // ---- Farmers ----
  const [pendingFarmers, setPendingFarmers] = useState<FarmerRegistration[]>([]);
  const [farmerSearchQuery, setFarmerSearchQuery] = useState("");
  const [isFarmersLoading, setIsFarmersLoading] = useState(true);
  const [farmerPage, setFarmerPage] = useState(1);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerRegistration | null>(null);
  const [farmerModalMode, setFarmerModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isFarmerModalOpen, setIsFarmerModalOpen] = useState(false);
  const [isFarmerProcessing, setIsFarmerProcessing] = useState(false);

  useEffect(() => {
    loadPendingMerchants();
    loadPendingFarmers();
  }, []);

  const loadPendingMerchants = async () => {
    setIsMerchantsLoading(true);
    try {
      const data = await adminService.getMerchants('pending');
      setPendingMerchants(data);
    } catch (error) {
      console.error('Error loading pending merchants:', error);
      toast.error("Erreur lors du chargement");
    } finally {
      setIsMerchantsLoading(false);
    }
  };

  const loadPendingFarmers = async () => {
    setIsFarmersLoading(true);
    try {
      const data = await adminService.getFarmers('pending');
      setPendingFarmers(data);
    } catch (error) {
      console.error('Error loading pending farmers:', error);
      toast.error("Erreur lors du chargement");
    } finally {
      setIsFarmersLoading(false);
    }
  };

  // ---- Merchants filtering/pagination ----
  const filteredMerchants = pendingMerchants.filter(merchant => {
    const query = merchantSearchQuery.toLowerCase();
    return (
      merchant.businessName.toLowerCase().includes(query) ||
      merchant.ownerName.toLowerCase().includes(query) ||
      merchant.city.toLowerCase().includes(query) ||
      merchant.email.toLowerCase().includes(query)
    );
  });
  const merchantTotalPages = Math.ceil(filteredMerchants.length / ITEMS_PER_PAGE);
  const paginatedMerchants = filteredMerchants.slice(
    (merchantPage - 1) * ITEMS_PER_PAGE,
    merchantPage * ITEMS_PER_PAGE
  );

  const handleMerchantSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMerchantSearchQuery(e.target.value);
    setMerchantPage(1);
  };

  const handleViewMerchant = (merchant: MerchantRegistration) => {
    setSelectedMerchant(merchant);
    setMerchantModalMode('view');
    setIsMerchantModalOpen(true);
  };

  const handleValidateMerchant = (merchant: MerchantRegistration) => {
    setSelectedMerchant(merchant);
    setMerchantModalMode('validate');
    setIsMerchantModalOpen(true);
  };

  const handleRefuseMerchant = (merchant: MerchantRegistration) => {
    setSelectedMerchant(merchant);
    setMerchantModalMode('refuse');
    setIsMerchantModalOpen(true);
  };

  const handleConfirmMerchantAction = async (reason?: string) => {
    if (!selectedMerchant) return;
    if (!user?.id) {
      toast.error("Session admin invalide. Rechargez la page.");
      return;
    }
    if (merchantModalMode === 'refuse' && !reason?.trim()) {
      toast.error("Le motif du refus est obligatoire.");
      return;
    }

    setIsMerchantProcessing(true);
    try {
      await adminService.updateMerchantStatus({
        merchantId: selectedMerchant.id,
        action: merchantModalMode === 'validate' ? 'validate' : 'refuse',
        reason,
        adminId: user.id,
      });

      const { sendMerchantApprovalEmail, sendMerchantRejectionEmail, logEmailToConsole } =
        await import('@/services/email.service');

      if (merchantModalMode === 'validate') {
        const emailResult = await sendMerchantApprovalEmail(
          selectedMerchant.email,
          selectedMerchant.businessName
        );
        if (!emailResult.success) {
          logEmailToConsole('approval', selectedMerchant.email, selectedMerchant.businessName);
          console.warn('Approval email failed:', emailResult.error);
        }
      } else {
        const emailResult = await sendMerchantRejectionEmail(
          selectedMerchant.email,
          selectedMerchant.businessName,
          reason
        );
        if (!emailResult.success) {
          logEmailToConsole('rejection', selectedMerchant.email, selectedMerchant.businessName, reason);
          console.warn('Rejection email failed:', emailResult.error);
        }
      }

      toast.success(
        merchantModalMode === 'validate'
          ? `Commerce validé avec succès. Email envoyé à ${selectedMerchant.email}`
          : 'Commerce refusé. Le marchand a été notifié.'
      );

      loadPendingMerchants();
      setIsMerchantModalOpen(false);
    } catch (error) {
      console.error('Error processing merchant:', error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsMerchantProcessing(false);
    }
  };

  // ---- Farmers filtering/pagination ----
  const filteredFarmers = pendingFarmers.filter(farmer => {
    const query = farmerSearchQuery.toLowerCase();
    return (
      farmer.farmName.toLowerCase().includes(query) ||
      farmer.ownerName.toLowerCase().includes(query) ||
      farmer.city.toLowerCase().includes(query) ||
      farmer.email.toLowerCase().includes(query)
    );
  });
  const farmerTotalPages = Math.ceil(filteredFarmers.length / ITEMS_PER_PAGE);
  const paginatedFarmers = filteredFarmers.slice(
    (farmerPage - 1) * ITEMS_PER_PAGE,
    farmerPage * ITEMS_PER_PAGE
  );

  const handleFarmerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFarmerSearchQuery(e.target.value);
    setFarmerPage(1);
  };

  const handleViewFarmer = (farmer: FarmerRegistration) => {
    setSelectedFarmer(farmer);
    setFarmerModalMode('view');
    setIsFarmerModalOpen(true);
  };

  const handleValidateFarmer = (farmer: FarmerRegistration) => {
    setSelectedFarmer(farmer);
    setFarmerModalMode('validate');
    setIsFarmerModalOpen(true);
  };

  const handleRefuseFarmer = (farmer: FarmerRegistration) => {
    setSelectedFarmer(farmer);
    setFarmerModalMode('refuse');
    setIsFarmerModalOpen(true);
  };

  const handleConfirmFarmerAction = async (reason?: string) => {
    if (!selectedFarmer) return;
    if (!user?.id) {
      toast.error("Session admin invalide. Rechargez la page.");
      return;
    }
    if (farmerModalMode === 'refuse' && !reason?.trim()) {
      toast.error("Le motif du refus est obligatoire.");
      return;
    }

    setIsFarmerProcessing(true);
    try {
      await adminService.updateFarmerStatus({
        farmerId: selectedFarmer.id,
        action: farmerModalMode === 'validate' ? 'validate' : 'refuse',
        reason,
        adminId: user.id,
      });

      const { sendFarmerApprovalEmail, sendFarmerRejectionEmail } =
        await import('@/services/email.service');

      if (farmerModalMode === 'validate') {
        const emailResult = await sendFarmerApprovalEmail(
          selectedFarmer.email,
          selectedFarmer.farmName
        );
        if (!emailResult.success) {
          console.warn('Approval email failed:', emailResult.error);
        }
      } else {
        const emailResult = await sendFarmerRejectionEmail(
          selectedFarmer.email,
          selectedFarmer.farmName,
          reason
        );
        if (!emailResult.success) {
          console.warn('Rejection email failed:', emailResult.error);
        }
      }

      toast.success(
        farmerModalMode === 'validate'
          ? `Agriculteur validé avec succès. Email envoyé à ${selectedFarmer.email}`
          : 'Agriculteur refusé. Il a été notifié.'
      );

      loadPendingFarmers();
      setIsFarmerModalOpen(false);
    } catch (error) {
      console.error('Error processing farmer:', error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsFarmerProcessing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Validations en attente</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Commerces et agriculteurs nécessitant une validation
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingMerchants.length}</p>
              <p className="text-sm text-muted-foreground">Commerçants en attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sprout className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingFarmers.length}</p>
              <p className="text-sm text-muted-foreground">Agriculteurs en attente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeEntityTab} onValueChange={(v) => setActiveEntityTab(v as "merchants" | "farmers")}>
        <TabsList>
          <TabsTrigger value="merchants" className="gap-2">
            <Store className="w-4 h-4" />
            Commerçants ({pendingMerchants.length})
          </TabsTrigger>
          <TabsTrigger value="farmers" className="gap-2">
            <Sprout className="w-4 h-4" />
            Agriculteurs ({pendingFarmers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="merchants" className="space-y-4 mt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un commerce..."
              value={merchantSearchQuery}
              onChange={handleMerchantSearchChange}
              className="pl-9"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demandes en attente</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredMerchants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Store className="w-12 h-12 mb-3 opacity-50" />
                  <p>
                    {merchantSearchQuery
                      ? "Aucune demande ne correspond à votre recherche"
                      : "Aucune demande de validation en attente"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedMerchants.map((merchant) => (
                    <MerchantValidationCard
                      key={merchant.id}
                      merchant={merchant}
                      onView={handleViewMerchant}
                      onValidate={handleValidateMerchant}
                      onRefuse={handleRefuseMerchant}
                    />
                  ))}
                </div>
              )}

              {merchantTotalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setMerchantPage(p => Math.max(1, p - 1))}
                          className={merchantPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {[...Array(merchantTotalPages)].map((_, i) => (
                        <PaginationItem key={i + 1}>
                          <PaginationLink
                            isActive={merchantPage === i + 1}
                            onClick={() => setMerchantPage(i + 1)}
                            className="cursor-pointer"
                          >
                            {i + 1}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setMerchantPage(p => Math.min(merchantTotalPages, p + 1))}
                          className={merchantPage === merchantTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="farmers" className="space-y-4 mt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un agriculteur..."
              value={farmerSearchQuery}
              onChange={handleFarmerSearchChange}
              className="pl-9"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demandes en attente</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredFarmers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Sprout className="w-12 h-12 mb-3 opacity-50" />
                  <p>
                    {farmerSearchQuery
                      ? "Aucune demande ne correspond à votre recherche"
                      : "Aucune demande de validation en attente"}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedFarmers.map((farmer) => (
                    <FarmerValidationCard
                      key={farmer.id}
                      farmer={farmer}
                      onView={handleViewFarmer}
                      onValidate={handleValidateFarmer}
                      onRefuse={handleRefuseFarmer}
                    />
                  ))}
                </div>
              )}

              {farmerTotalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setFarmerPage(p => Math.max(1, p - 1))}
                          className={farmerPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {[...Array(farmerTotalPages)].map((_, i) => (
                        <PaginationItem key={i + 1}>
                          <PaginationLink
                            isActive={farmerPage === i + 1}
                            onClick={() => setFarmerPage(i + 1)}
                            className="cursor-pointer"
                          >
                            {i + 1}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setFarmerPage(p => Math.min(farmerTotalPages, p + 1))}
                          className={farmerPage === farmerTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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

      <MerchantValidationModal
        merchant={selectedMerchant}
        mode={merchantModalMode}
        isOpen={isMerchantModalOpen}
        onClose={() => setIsMerchantModalOpen(false)}
        onConfirm={handleConfirmMerchantAction}
        isLoading={isMerchantProcessing}
      />

      <FarmerValidationModal
        farmer={selectedFarmer}
        mode={farmerModalMode}
        isOpen={isFarmerModalOpen}
        onClose={() => setIsFarmerModalOpen(false)}
        onConfirm={handleConfirmFarmerAction}
        isLoading={isFarmerProcessing}
      />
    </div>
  );
};

export default AdminValidationsPage;
