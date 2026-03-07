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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store,
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
import type { AdminKPIs, MerchantRegistration, AdminActivity, TopMerchant, GeoDistribution, AdminTrafficMetrics } from "@/types/admin.types";
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
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [salesStats, setSalesStats] = useState<{ period: string; sales: number; revenue: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRegistration | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'validate' | 'refuse'>('view');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [kpisData, merchantsData, activitiesData, statsData, topMerchantsData, geoData, trafficData] = await Promise.all([
        adminService.getKPIs(),
        adminService.getMerchants('pending'),
        adminService.getRecentActivities(5),
        adminService.getSalesStats(),
        adminService.getTopMerchants(5),
        adminService.getGeoDistribution(),
        adminService.getTrafficMetrics(14),
      ]);
      setKPIs(kpisData);
      setPendingMerchants(merchantsData);
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
              {geoDistribution.map((geo) => (
                <div key={geo.city} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{geo.city}</span>
                    <span className="text-muted-foreground">{geo.merchantCount} commerces</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(geo.merchantCount / Math.max(...geoDistribution.map(g => g.merchantCount), 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
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

export default AdminDashboardPage;
