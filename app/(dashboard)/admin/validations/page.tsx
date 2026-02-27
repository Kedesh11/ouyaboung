"use client";

// ============================================
// Admin Validations Page - Pending Merchants
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import MerchantValidationCard from "@/components/admin/MerchantValidationCard";
import MerchantValidationModal from "@/components/admin/MerchantValidationModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Clock, CheckCircle, Search, Store } from "lucide-react";
import { adminService } from "@/services/admin.service";
import type { MerchantRegistration } from "@/types/admin.types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const ITEMS_PER_PAGE = 3;

const AdminValidationsPage = () => {
  const { user } = useAuth();
  const [pendingMerchants, setPendingMerchants] = useState<MerchantRegistration[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRegistration | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadPendingMerchants();
  }, []);

  const loadPendingMerchants = async () => {
    setIsLoading(true);
    try {
      const data = await adminService.getMerchants('pending');
      setPendingMerchants(data);
    } catch (error) {
      console.error('Error loading pending merchants:', error);
      toast.error("Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMerchants = pendingMerchants.filter(merchant => {
    const query = searchQuery.toLowerCase();
    return (
      merchant.businessName.toLowerCase().includes(query) ||
      merchant.ownerName.toLowerCase().includes(query) ||
      merchant.city.toLowerCase().includes(query) ||
      merchant.email.toLowerCase().includes(query)
    );
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredMerchants.length / ITEMS_PER_PAGE);
  const paginatedMerchants = filteredMerchants.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleViewMerchant = (merchant: MerchantRegistration) => {
    setSelectedMerchant(merchant);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleValidateMerchant = (merchant: MerchantRegistration) => {
    setSelectedMerchant(merchant);
    setModalMode('validate');
    setIsModalOpen(true);
  };

  const handleRefuseMerchant = (merchant: MerchantRegistration) => {
    setSelectedMerchant(merchant);
    setModalMode('refuse');
    setIsModalOpen(true);
  };

  const handleConfirmAction = async (reason?: string) => {
    if (!selectedMerchant) return;
    if (!user?.id) {
      toast.error("Session admin invalide. Rechargez la page.");
      return;
    }
    if (modalMode === 'refuse' && !reason?.trim()) {
      toast.error("Le motif du refus est obligatoire.");
      return;
    }

    setIsProcessing(true);
    try {
      await adminService.updateMerchantStatus({
        merchantId: selectedMerchant.id,
        action: modalMode === 'validate' ? 'validate' : 'refuse',
        reason,
        adminId: user.id,
      });

      const { sendMerchantApprovalEmail, sendMerchantRejectionEmail, logEmailToConsole } =
        await import('@/services/email.service');

      if (modalMode === 'validate') {
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
        modalMode === 'validate'
          ? `Commerce validé avec succès. Email envoyé à ${selectedMerchant.email}`
          : 'Commerce refusé. Le marchand a été notifié.'
      );

      loadPendingMerchants();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error processing merchant:', error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Validations en attente</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Commerces nécessitant une validation
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingMerchants.length}</p>
              <p className="text-sm text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un commerce..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
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
                {searchQuery
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

      {/* Validation Modal */}
      <MerchantValidationModal
        merchant={selectedMerchant}
        mode={modalMode}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmAction}
        isLoading={isProcessing}
      />
    </div>
  );
};

export default AdminValidationsPage;
