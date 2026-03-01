"use client";

// ============================================
// Merchant Analytics Page - Statistics & Insights
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingBag,
  Wallet,
  Users,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { getMyMerchantProfile, getMerchantStats } from "@/services/merchant.service";
import { getMerchantOrders } from "@/services/order.service";
import { getCategoryName } from "@/services/inventory.service";
import type { MerchantImpact, Order, FoodCategory } from "@/types";
import { toast } from "sonner";

// Helper to get day name
const getDayName = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", { weekday: "short" });
};

// Helper colors for categories
const CATEGORY_COLORS: Record<string, string> = {
  bread_pastry: "hsl(35, 90%, 60%)", // Gold/Orange
  prepared_meals: "hsl(28, 85%, 55%)", // Orange
  fruits_vegetables: "hsl(145, 65%, 42%)", // Green
  dairy: "hsl(210, 90%, 60%)", // Blue
  meat_fish: "hsl(350, 80%, 60%)", // Red
  beverages: "hsl(190, 80%, 50%)", // Cyan
  snacks: "hsl(280, 70%, 60%)", // Purple
  mixed_basket: "hsl(160, 60%, 40%)", // Teal
  other: "hsl(0, 0%, 60%)", // Gray
};

const MerchantAnalyticsPage = () => {
  const [period, setPeriod] = useState("week");
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [impact, setImpact] = useState<MerchantImpact | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic Chart State
  const [salesData, setSalesData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      // 1. Get Merchant ID
      const profileRes = await getMyMerchantProfile(user.id);
      if (profileRes.success && profileRes.data) {
        const mId = profileRes.data.id;
        setMerchantId(mId);

        // 2. Get Stats using mId
        const statsRes = await getMerchantStats(mId);
        if (statsRes.success && statsRes.data) {
          setImpact(statsRes.data);
        }

        // 3. Get Orders for Charts (fetch last 100 to approximate recent analytics)
        const ordersRes = await getMerchantOrders(mId, { perPage: 100 });
        if (ordersRes.success && ordersRes.data) {
          processChartData(ordersRes.data.data);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du chargement des statistiques");
    } finally {
      setLoading(false);
    }
  };

  const processChartData = (orders: Order[]) => {
    // Process Sales Over Time (Last 7 Days Logic Simplified to Weekday aggregation)
    const salesMap = new Map<string, { count: number; revenue: number }>();
    const weekDays = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

    // Initialize map
    weekDays.forEach(day => salesMap.set(day, { count: 0, revenue: 0 }));

    orders.forEach(order => {
      const dayName = getDayName(order.created_at).toLowerCase();
      // Try to match short name, default to mon if fails (simple logic)
      if (salesMap.has(dayName)) {
        const current = salesMap.get(dayName)!;
        salesMap.set(dayName, {
          count: current.count + 1,
          revenue: current.revenue + order.total_price
        });
      }
    });

    const processedSales = Array.from(salesMap.entries()).map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      ventes: data.count,
      revenus: data.revenue
    }));
    setSalesData(processedSales);


    // Process Category Distribution
    const catMap = new Map<string, number>();
    orders.forEach(order => {
      if (order.food_item?.category) {
        const cat = order.food_item.category;
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      }
    });

    const totalOrders = orders.length || 1;
    const processedCats = Array.from(catMap.entries()).map(([cat, count]) => ({
      name: getCategoryName(cat as FoodCategory),
      value: Math.round((count / totalOrders) * 100),
      color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
    })).sort((a, b) => b.value - a.value); // Sort descending

    // Fallback if empty
    if (processedCats.length === 0) {
      processedCats.push({ name: "Aucune donnée", value: 100, color: CATEGORY_COLORS.other });
    }
    setCategoryData(processedCats);


    // Process Hourly Traffic
    const hourMap = new Map<string, number>();
    // Initialize common trading hours (10h to 21h)
    for (let i = 8; i <= 21; i++) {
      hourMap.set(`${i}h`, 0);
    }

    orders.forEach(order => {
      const date = new Date(order.created_at);
      const hourKey = `${date.getHours()}h`;
      if (hourMap.has(hourKey)) {
        hourMap.set(hourKey, (hourMap.get(hourKey) || 0) + 1);
      }
    });

    const processedHourly = Array.from(hourMap.entries()).map(([hour, count]) => ({
      hour,
      orders: count
    }));
    setHourlyData(processedHourly);
  };

  const stats = [
    {
      title: "Commandes livrées",
      value: impact ? impact.orders_fulfilled.toString() : "0",
      change: "+0%", // Needs historical data for real change
      trend: "neutral",
      icon: ShoppingBag,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Revenus (Anti-gaspi)",
      value: impact ? `${impact.revenue_from_waste_xaf.toLocaleString()} XAF` : "0 XAF",
      change: "+0%",
      trend: "up",
      icon: Wallet,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      title: "Note moyenne",
      value: impact ? impact.average_rating.toFixed(1) : "0.0",
      change: "N/A",
      trend: "neutral",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Nourriture sauvée",
      value: impact ? `${impact.food_saved_kg.toFixed(1)} kg` : "0 kg",
      change: `${impact ? impact.co2_avoided_kg.toFixed(1) : 0} kg CO₂ évités`,
      trend: "up",
      icon: Package,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Analysez vos performances
        </p>
      </div>
      {/* Period Selector */}
      <Tabs value={period} onValueChange={setPeriod} className="mb-6">
        <TabsList>
          <TabsTrigger value="today">Aujourd'hui</TabsTrigger>
          <TabsTrigger value="week">Cette semaine</TabsTrigger>
          <TabsTrigger value="month">Ce mois</TabsTrigger>
          <TabsTrigger value="year">Cette année</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div
                    className={`flex items-center text-xs font-medium ${stat.trend === "up" ? "text-green-600" : "text-destructive"
                      }`}
                  >
                    {stat.trend === "up" ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {stat.change}
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Sales Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Évolution des ventes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesData}>
                    <defs>
                      <linearGradient id="colorVentes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(145, 65%, 42%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(145, 65%, 42%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ventes"
                      stroke="hsl(145, 65%, 42%)"
                      fillOpacity={1}
                      fill="url(#colorVentes)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Répartition par catégorie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center">
                <div className="w-1/2">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-3">
                  {categoryData.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm text-foreground flex-1 truncate">
                        {cat.name}
                      </span>
                      <span className="text-sm font-medium">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Hourly Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Répartition horaire des commandes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar
                    dataKey="orders"
                    fill="hsl(145, 65%, 42%)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Les pics de commandes sont à 13h et 18h - Optimisez vos horaires de récupération !
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default MerchantAnalyticsPage;
