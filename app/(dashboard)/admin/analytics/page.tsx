"use client";

// ============================================
// Admin Analytics Page - Statistics & Insights
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import KPICard from "@/components/admin/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Package,
  BarChart3,
  Eye,
  Smartphone,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { adminService } from "@/services/admin.service";
import type { AdminKPIs, SalesStats, TopMerchant, AdminTrafficMetrics } from "@/types/admin.types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ['hsl(var(--primary))', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(221, 83%, 53%)', 'hsl(280, 65%, 60%)'];

const AdminAnalyticsPage = () => {
  const [kpis, setKPIs] = useState<AdminKPIs | null>(null);
  const [salesStats, setSalesStats] = useState<SalesStats[]>([]);
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([]);
  const [trafficMetrics, setTrafficMetrics] = useState<AdminTrafficMetrics | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [kpisData, statsData, merchantsData, trafficData] = await Promise.all([
      adminService.getKPIs(),
      adminService.getSalesStats(),
      adminService.getTopMerchants(),
      adminService.getTrafficMetrics(14),
    ]);
    setKPIs(kpisData);
    setSalesStats(statsData);
    setTopMerchants(merchantsData);
    setTrafficMetrics(trafficData);
  };

  const pieData = topMerchants.map(m => ({
    name: m.name,
    value: m.sales,
  }));

  const trafficChartData = (trafficMetrics?.daily || []).map((point) => ({
    ...point,
    periodLabel: point.periodDate.slice(5),
  }));

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Analyses et performances de la plateforme
        </p>
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Chiffre d'affaires"
          value={kpis ? adminService.formatCurrency(kpis.totalRevenue) : '-'}
          icon={DollarSign}
          trend={{ value: 18, isPositive: true }}
          variant="success"
        />
        <KPICard
          title="Ventes totales"
          value={kpis?.totalSales?.toLocaleString() ?? '-'}
          icon={ShoppingBag}
          trend={{ value: 12, isPositive: true }}
        />
        <KPICard
          title="Taux de conversion"
          value={kpis ? adminService.formatPercentage(kpis.conversionRate) : '-'}
          icon={TrendingUp}
          trend={{ value: 5, isPositive: true }}
          variant="info"
        />
        <KPICard
          title="Panier moyen"
          value={kpis ? adminService.formatCurrency(kpis.averageOrderValue) : '-'}
          icon={Package}
          trend={{ value: 3, isPositive: true }}
          variant="warning"
        />
      </div>

      {/* Traffic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Visiteurs aujourd'hui"
          value={trafficMetrics?.visitorsToday?.toLocaleString() ?? '-'}
          icon={Eye}
          trend={{
            value: Math.abs(Number(trafficMetrics?.visitorsGrowthPercent || 0)),
            isPositive: Number(trafficMetrics?.visitorsGrowthPercent || 0) >= 0,
          }}
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
          icon={UserRoundCheck}
          variant="success"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-2">
            <ShoppingBag className="w-4 h-4" />
            Ventes
          </TabsTrigger>
          <TabsTrigger value="merchants" className="gap-2">
            <Store className="w-4 h-4" />
            Commerces
          </TabsTrigger>
          <TabsTrigger value="traffic" className="gap-2">
            <Eye className="w-4 h-4" />
            Trafic
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Sales */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventes hebdomadaires</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesStats}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="period" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Évolution du chiffre d'affaires</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesStats}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="period" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => adminService.formatCurrency(value)}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="hsl(142, 76%, 36%)" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(142, 76%, 36%)' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détail des ventes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs fill-muted-foreground" />
                    <YAxis dataKey="period" type="category" className="text-xs fill-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merchants">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Merchants Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition des ventes par commerce</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="hsl(var(--primary))"
                        dataKey="value"
                        label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Merchants List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 5 des commerces</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topMerchants.map((merchant, index) => (
                    <div 
                      key={merchant.id} 
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                    >
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {merchant.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {merchant.sales} ventes • {merchant.productsCount} produits
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600">
                          {adminService.formatCurrency(merchant.revenue)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="traffic">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Visiteurs et pages vues ({trafficMetrics?.windowDays ?? 14}j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trafficChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="periodLabel" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="visitors"
                        name="Visiteurs"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="pageViews"
                        name="Pages vues"
                        stroke="hsl(142, 76%, 36%)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Installations PWA (quotidien)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trafficChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="periodLabel" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="pwaInstalls" name="Installations" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Installations totales</p>
                    <p className="text-lg font-semibold">{trafficMetrics?.pwaInstallsTotal?.toLocaleString() ?? '-'}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Pages vues aujourd&apos;hui</p>
                    <p className="text-lg font-semibold">{trafficMetrics?.pageViewsToday?.toLocaleString() ?? '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAnalyticsPage;
