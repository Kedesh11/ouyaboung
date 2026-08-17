"use client";

// ============================================
// Admin Dashboard Page - Main Overview
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import KPICard from "@/components/admin/KPICard";
import ActivityFeed from "@/components/admin/ActivityFeed";
import MerchantValidationCard from "@/components/admin/MerchantValidationCard";
import MerchantValidationModal from "@/components/admin/MerchantValidationModal";
import FarmerValidationCard from "@/components/admin/FarmerValidationCard";
import FarmerValidationModal from "@/components/admin/FarmerValidationModal";
import DriverValidationCard from "@/components/admin/DriverValidationCard";
import DriverValidationModal from "@/components/admin/DriverValidationModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store,
  Sprout,
  Truck,
  Users,
  Package,
  ShoppingBag,
  TrendingUp,
  ArrowRight,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Smartphone,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { adminService } from "@/services/admin.service";
import type { AdminKPIs, MerchantRegistration, FarmerRegistration, DriverRegistration, AdminActivity, TopMerchant, GeoDistribution, AdminTrafficMetrics } from "@/types/admin.types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Dynamic import for Recharts - heavy library (~32kb)
const SalesChart = dynamic(() => import('@/components/charts/SalesChart'), {
  loading: () => <div className="h-[250px] w-full"><Skeleton className="h-full w-full" /></div>,
  ssr: false, // Charts don't need SSR
});

const AdminDashboardPage = () => {
  const { user } = useAuth();
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([]);
  const [geoDistribution, setGeoDistribution] = useState<GeoDistribution[]>([]);
  const [trafficMetrics, setTrafficMetrics] = useState<AdminTrafficMetrics | null>(null);

  const [kpis, setKPIs] = useState<AdminKPIs | null>(null);
  const [pendingMerchants, setPendingMerchants] = useState<MerchantRegistration[]>([]);
  const [pendingFarmers, setPendingFarmers] = useState<FarmerRegistration[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<DriverRegistration[]>([]);
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [salesStats, setSalesStats] = useState<{ period: string; sales: number; revenue: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRegistration | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedFarmer, setSelectedFarmer] = useState<FarmerRegistration | null>(null);
  const [farmerModalMode, setFarmerModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isFarmerModalOpen, setIsFarmerModalOpen] = useState(false);
  const [isFarmerProcessing, setIsFarmerProcessing] = useState(false);

  const [selectedDriver, setSelectedDriver] = useState<DriverRegistration | null>(null);
  const [driverModalMode, setDriverModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isDriverProcessing, setIsDriverProcessing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [kpisData, merchantsData, farmersData, driversData, activitiesData, statsData, topMerchantsData, geoData, trafficData] = await Promise.all([
        adminService.getKPIs(),
        adminService.getMerchants('pending'),
        adminService.getFarmers('pending'),
        adminService.getDrivers('pending'),
        adminService.getRecentActivities(5),
        adminService.getSalesStats(),
        adminService.getTopMerchants(5),
        adminService.getGeoDistribution(),
        adminService.getTrafficMetrics(14),
      ]);
      setKPIs(kpisData);
      setPendingMerchants(merchantsData);
      setPendingFarmers(farmersData);
      setPendingDrivers(driversData);
      setActivities(activitiesData);
      setSalesStats(statsData);
      setTopMerchants(topMerchantsData);
      setGeoDistribution(geoData);
      setTrafficMetrics(trafficData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setIsLoading(false);
    }
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
      const action = modalMode === 'validate' ? 'validate' : 'refuse';

      await adminService.updateMerchantStatus({
        merchantId: selectedMerchant.id,
        action,
        reason,
        adminId: user.id,
      });

      // Import email service dynamically
      const { sendMerchantApprovalEmail, sendMerchantRejectionEmail, logEmailToConsole } =
        await import('@/services/email.service');

      // Send email to merchant
      if (action === 'validate') {
        const emailResult = await sendMerchantApprovalEmail(
          selectedMerchant.email,
          selectedMerchant.businessName
        );

        if (!emailResult.success) {
          // Fallback: log to console if email fails
          logEmailToConsole('approval', selectedMerchant.email, selectedMerchant.businessName);
          console.warn('Email not sent, but validation succeeded:', emailResult.error);
        }
      } else {
        const emailResult = await sendMerchantRejectionEmail(
          selectedMerchant.email,
          selectedMerchant.businessName,
          reason
        );

        if (!emailResult.success) {
          // Fallback: log to console if email fails
          logEmailToConsole('rejection', selectedMerchant.email, selectedMerchant.businessName, reason);
          console.warn('Email not sent, but refusal succeeded:', emailResult.error);
        }
      }

      toast.success(
        modalMode === 'validate'
          ? 'Commerce validé avec succès. Un email a été envoyé au marchand.'
          : 'Commerce refusé. Un email a été envoyé au marchand.'
      );

      // Refresh data
      loadDashboardData();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error processing merchant:', error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsProcessing(false);
    }
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
        const emailResult = await sendFarmerApprovalEmail(selectedFarmer.email, selectedFarmer.farmName);
        if (!emailResult.success) {
          console.warn('Approval email failed:', emailResult.error);
        }
      } else {
        const emailResult = await sendFarmerRejectionEmail(selectedFarmer.email, selectedFarmer.farmName, reason);
        if (!emailResult.success) {
          console.warn('Rejection email failed:', emailResult.error);
        }
      }

      toast.success(
        farmerModalMode === 'validate'
          ? 'Agriculteur validé avec succès. Un email a été envoyé.'
          : 'Agriculteur refusé. Il a été notifié.'
      );

      loadDashboardData();
      setIsFarmerModalOpen(false);
    } catch (error) {
      console.error('Error processing farmer:', error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsFarmerProcessing(false);
    }
  };

  const handleViewDriver = (driver: DriverRegistration) => {
    setSelectedDriver(driver);
    setDriverModalMode('view');
    setIsDriverModalOpen(true);
  };

  const handleValidateDriver = (driver: DriverRegistration) => {
    setSelectedDriver(driver);
    setDriverModalMode('validate');
    setIsDriverModalOpen(true);
  };

  const handleRefuseDriver = (driver: DriverRegistration) => {
    setSelectedDriver(driver);
    setDriverModalMode('refuse');
    setIsDriverModalOpen(true);
  };

  const handleConfirmDriverAction = async (reason?: string) => {
    if (!selectedDriver) return;
    if (!user?.id) {
      toast.error("Session admin invalide. Rechargez la page.");
      return;
    }
    if (driverModalMode === 'refuse' && !reason?.trim()) {
      toast.error("Le motif du refus est obligatoire.");
      return;
    }

    setIsDriverProcessing(true);
    try {
      await adminService.updateDriverStatus({
        driverId: selectedDriver.id,
        action: driverModalMode === 'validate' ? 'validate' : 'refuse',
        reason,
        adminId: user.id,
      });

      const { sendDriverApprovalEmail, sendDriverRejectionEmail } =
        await import('@/services/email.service');

      if (driverModalMode === 'validate') {
        const emailResult = await sendDriverApprovalEmail(selectedDriver.email, selectedDriver.fullName);
        if (!emailResult.success) {
          console.warn('Approval email failed:', emailResult.error);
        }
      } else {
        const emailResult = await sendDriverRejectionEmail(selectedDriver.email, selectedDriver.fullName, reason);
        if (!emailResult.success) {
          console.warn('Rejection email failed:', emailResult.error);
        }
      }

      toast.success(
        driverModalMode === 'validate'
          ? 'Chauffeur validé avec succès. Un email a été envoyé.'
          : 'Chauffeur refusé. Il a été notifié.'
      );

      loadDashboardData();
      setIsDriverModalOpen(false);
    } catch (error) {
      console.error('Error processing driver:', error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsDriverProcessing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Vue d&apos;ensemble de la plateforme ouyaboung
        </p>
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Commerces actifs"
          value={kpis?.activeMerchants ?? '-'}
          icon={Store}
          trend={{ value: 12, isPositive: true }}
          variant="success"
        />
        <KPICard
          title="Clients inscrits"
          value={kpis?.totalClients?.toLocaleString() ?? '-'}
          icon={Users}
          trend={{ value: 8, isPositive: true }}
          variant="info"
        />
        <KPICard
          title="Produits actifs"
          value={kpis?.activeProducts ?? '-'}
          icon={Package}
          trend={{ value: 5, isPositive: true }}
          variant="warning"
        />
        <KPICard
          title="Ventes totales"
          value={kpis?.totalSales?.toLocaleString() ?? '-'}
          icon={ShoppingBag}
          trend={{ value: 15, isPositive: true }}
        />
      </div>

      {/* Traffic KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Visiteurs aujourd'hui"
          value={trafficMetrics?.visitorsToday?.toLocaleString() ?? '-'}
          icon={Eye}
          variant="info"
        />
        <KPICard
          title="Taux de visite"
          value={trafficMetrics ? adminService.formatPercentage(trafficMetrics.dailyVisitRatePercent) : '-'}
          icon={UsersRound}
          variant="default"
        />
        <KPICard
          title="Installations PWA (30j)"
          value={trafficMetrics?.pwaInstallsLast30d?.toLocaleString() ?? '-'}
          icon={Smartphone}
          variant="warning"
        />
        <KPICard
          title="Visiteurs récurrents (7j)"
          value={trafficMetrics?.recurringVisitors7d?.toLocaleString() ?? '-'}
          icon={TrendingUp}
          variant="success"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Chiffre d'affaires"
          value={kpis ? adminService.formatCurrency(kpis.totalRevenue) : '-'}
          icon={DollarSign}
          variant="success"
        />
        <KPICard
          title="Taux de conversion"
          value={kpis ? adminService.formatPercentage(kpis.conversionRate) : '-'}
          icon={TrendingUp}
          variant="info"
        />
        <KPICard
          title="En attente"
          value={kpis?.pendingMerchants ?? '-'}
          icon={Clock}
          variant="warning"
        />
        <KPICard
          title="Refusés"
          value={kpis?.refusedMerchants ?? '-'}
          icon={XCircle}
          variant="danger"
        />
      </div>

      {/* Farmer & Driver KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Agriculteurs actifs"
          value={kpis?.activeFarmers ?? '-'}
          icon={Sprout}
          variant="success"
        />
        <KPICard
          title="Agriculteurs en attente"
          value={kpis?.pendingFarmers ?? '-'}
          icon={Clock}
          variant="warning"
        />
        <KPICard
          title="Chauffeurs actifs"
          value={kpis?.activeDrivers ?? '-'}
          icon={Truck}
          variant="success"
        />
        <KPICard
          title="Chauffeurs en attente"
          value={kpis?.pendingDrivers ?? '-'}
          icon={Clock}
          variant="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Ventes cette semaine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={salesStats} />
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <ActivityFeed activities={activities} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Top Merchants */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Top Commerçants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topMerchants.map((merchant, index) => (
                <div key={merchant.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{merchant.name}</p>
                      <p className="text-xs text-muted-foreground">{merchant.productsCount} produits</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{adminService.formatCurrency(merchant.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{merchant.sales} ventes</p>
                  </div>
                </div>
              ))}
              {topMerchants.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Aucune donnée disponible</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Geo Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              Répartition Géographique
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {geoDistribution.map((geo) => {
                const geoTotal = geo.merchantCount + geo.farmerCount + geo.driverCount;
                const maxTotal = Math.max(
                  ...geoDistribution.map(g => g.merchantCount + g.farmerCount + g.driverCount),
                  1
                );
                return (
                  <div key={geo.city} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{geo.city}</span>
                      <span className="text-muted-foreground">
                        {geo.merchantCount} commerces · {geo.farmerCount} agriculteurs · {geo.driverCount} chauffeurs
                      </span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(geoTotal / maxTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {geoDistribution.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Aucune donnée disponible</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Validations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Commerces en attente de validation
          </CardTitle>
          <Link href="/admin/validations">
            <Button variant="ghost" size="sm" className="gap-1">
              Voir tout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {pendingMerchants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-muted-foreground">
                Aucune demande en attente
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingMerchants.slice(0, 3).map((merchant) => (
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
        </CardContent>
      </Card>

      {/* Pending Farmer Validations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Agriculteurs en attente de validation
          </CardTitle>
          <Link href="/admin/validations">
            <Button variant="ghost" size="sm" className="gap-1">
              Voir tout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {pendingFarmers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-muted-foreground">
                Aucune demande en attente
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingFarmers.slice(0, 3).map((farmer) => (
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
        </CardContent>
      </Card>

      {/* Pending Driver Validations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Chauffeurs en attente de validation
          </CardTitle>
          <Link href="/admin/validations">
            <Button variant="ghost" size="sm" className="gap-1">
              Voir tout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {pendingDrivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-muted-foreground">
                Aucune demande en attente
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDrivers.slice(0, 3).map((driver) => (
                <DriverValidationCard
                  key={driver.id}
                  driver={driver}
                  onView={handleViewDriver}
                  onValidate={handleValidateDriver}
                  onRefuse={handleRefuseDriver}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation Modals */}
      <MerchantValidationModal
        merchant={selectedMerchant}
        mode={modalMode}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmAction}
        isLoading={isProcessing}
      />
      <FarmerValidationModal
        farmer={selectedFarmer}
        mode={farmerModalMode}
        isOpen={isFarmerModalOpen}
        onClose={() => setIsFarmerModalOpen(false)}
        onConfirm={handleConfirmFarmerAction}
        isLoading={isFarmerProcessing}
      />
      <DriverValidationModal
        driver={selectedDriver}
        mode={driverModalMode}
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
        onConfirm={handleConfirmDriverAction}
        isLoading={isDriverProcessing}
      />
    </div>
  );
};

export default AdminDashboardPage;
