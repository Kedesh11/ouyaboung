"use client";

// ============================================
// Merchant - Browse Farmers Directory (B2B)
// ouyaboung Platform - Marché B2B commerçant <-> agriculteur
// ============================================

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Sprout, Loader2 } from "lucide-react";
import FarmerCard from "@/components/FarmerCard";
import { listFarmers } from "@/services/farmer.service";
import type { Farmer, FarmerType, GabonCity } from "@/types";

const GABON_CITIES: GabonCity[] = [
  "Libreville",
  "Port-Gentil",
  "Franceville",
  "Oyem",
  "Moanda",
  "Mouila",
  "Lambaréné",
  "Tchibanga",
  "Koulamoutou",
  "Makokou",
];

const farmerTypes: { value: FarmerType; label: string }[] = [
  { value: "agriculture", label: "Agriculture" },
  { value: "elevage", label: "Élevage" },
  { value: "peche", label: "Pêche" },
  { value: "mixte", label: "Mixte" },
  { value: "other", label: "Autre" },
];

export default function MerchantFarmersPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<GabonCity | "all">("all");
  const [selectedType, setSelectedType] = useState<FarmerType | "all">("all");

  useEffect(() => {
    loadFarmers();
  }, []);

  const loadFarmers = async () => {
    setIsLoading(true);
    try {
      const result = await listFarmers({ verifiedOnly: true, activeOnly: true, perPage: 100 });
      if (result.success && result.data) {
        setFarmers(result.data.data);
      }
    } catch (error) {
      console.error("Failed to load farmers directory", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFarmers = farmers.filter((farmer) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      farmer.farm_name.toLowerCase().includes(query) ||
      farmer.quartier.toLowerCase().includes(query);
    const matchesCity = selectedCity === "all" || farmer.city === selectedCity;
    const matchesType = selectedType === "all" || farmer.farmer_type === selectedType;
    return matchesSearch && matchesCity && matchesType;
  });

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Marché agriculteurs</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Parcourez le catalogue des exploitations partenaires et passez commande
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une exploitation..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={selectedCity} onValueChange={(v) => setSelectedCity(v as GabonCity | "all")}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Ville" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les villes</SelectItem>
            {GABON_CITIES.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedType} onValueChange={(v) => setSelectedType(v as FarmerType | "all")}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {farmerTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredFarmers.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFarmers.map((farmer) => (
            <FarmerCard key={farmer.id} farmer={farmer} basePath="/merchant/farmers" />
          ))}
        </div>
      ) : (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Sprout className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="font-medium text-foreground mb-2">Aucun agriculteur trouvé</h3>
            <p className="text-sm">
              {searchQuery || selectedCity !== "all" || selectedType !== "all"
                ? "Essayez d'autres filtres"
                : "Le répertoire sera bientôt disponible"}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
