"use client";

// ============================================
// Admin Geographic Page - Geographic Distribution
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Store, ShoppingBag, TrendingUp } from "lucide-react";
import { adminService } from "@/services/admin.service";
import type { GeoDistribution } from "@/types/admin.types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const AdminGeoPage = () => {
  const [geoData, setGeoData] = useState<GeoDistribution[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await adminService.getGeoDistribution();
    setGeoData(data);
  };

  const totalMerchants = geoData.reduce((sum, g) => sum + g.merchantCount, 0);
  const totalSales = geoData.reduce((sum, g) => sum + g.salesCount, 0);

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Répartition géographique</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Distribution des commerces et ventes par ville
        </p>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{geoData.length}</p>
              <p className="text-sm text-muted-foreground">Villes couvertes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Store className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalMerchants}</p>
              <p className="text-sm text-muted-foreground">Commerces</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalSales}</p>
              <p className="text-sm text-muted-foreground">Ventes totales</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Merchants by City */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="w-4 h-4" />
              Commerces par ville
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={geoData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="city" type="category" className="text-xs fill-muted-foreground" width={100} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="merchantCount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Commerces" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Sales by City */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Ventes par ville
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={geoData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="city" type="category" className="text-xs fill-muted-foreground" width={100} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="salesCount" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} name="Ventes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* City Details */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Détails par ville</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {geoData.map((city) => (
              <div
                key={city.city}
                className="p-4 rounded-lg border border-border bg-card hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">{city.city}</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{city.merchantCount}</p>
                    <p className="text-xs text-muted-foreground">Commerces</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{city.salesCount}</p>
                    <p className="text-xs text-muted-foreground">Ventes</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Moy. {Math.round(city.salesCount / city.merchantCount)} ventes/commerce
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGeoPage;
