"use client";

// ============================================
// Farmer Profile Page - Edit exploitation info
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Sprout } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyFarmerProfile,
  updateFarmerProfile,
  updateFarmerLogoByUserId,
  uploadFarmerAsset,
} from "@/services";
import type { Farmer, FarmerType, GabonCity } from "@/types";

const farmerTypes: { value: FarmerType; label: string }[] = [
  { value: "agriculture", label: "Agriculture (cultures)" },
  { value: "elevage", label: "Élevage" },
  { value: "peche", label: "Pêche" },
  { value: "mixte", label: "Mixte" },
  { value: "other", label: "Autre" },
];

const cities: GabonCity[] = ["Libreville", "Port-Gentil", "Franceville", "Oyem", "Moanda"];

export default function FarmerProfilePage() {
  const { user } = useAuth();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [form, setForm] = useState({
    farm_name: "",
    farmer_type: "other" as FarmerType,
    description: "",
    address: "",
    city: "Libreville" as GabonCity,
    quartier: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await getMyFarmerProfile(user.id);
      if (result.success && result.data) {
        setFarmer(result.data);
        setForm({
          farm_name: result.data.farm_name,
          farmer_type: result.data.farmer_type,
          description: result.data.description || "",
          address: result.data.address,
          city: result.data.city as GabonCity,
          quartier: result.data.quartier,
          phone: result.data.phone,
          email: result.data.email,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du chargement du profil");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!farmer) return;
    setIsSaving(true);
    try {
      const result = await updateFarmerProfile(farmer.id, {
        farmName: form.farm_name,
        farmerType: form.farmer_type,
        description: form.description,
        address: form.address,
        city: form.city,
        quartier: form.quartier,
        phone: form.phone,
        email: form.email,
      });

      if (result.success) {
        toast.success("Profil mis à jour");
        setFarmer(result.data);
      } else {
        toast.error(result.error?.message || "Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error(error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Le fichier ne doit pas dépasser 5MB");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const uploadResult = await uploadFarmerAsset("farmer-logos", file);
      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error?.message || "Échec de l'upload");
      }

      const updateResult = await updateFarmerLogoByUserId(user.id, uploadResult.data.publicUrl);
      if (updateResult.success && updateResult.data) {
        setFarmer(updateResult.data);
        toast.success("Logo mis à jour");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erreur lors de l'upload du logo");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Mon exploitation</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez les informations de votre exploitation
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Visible sur votre fiche publique dans le répertoire</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center">
            {farmer?.logo_url ? (
              <Image src={farmer.logo_url} alt="Logo" fill className="object-cover" sizes="80px" />
            ) : (
              <Sprout className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div>
            <input
              type="file"
              accept="image/*"
              id="logo-upload"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <Label htmlFor="logo-upload">
              <Button asChild variant="outline" size="sm" disabled={isUploadingLogo}>
                <span className="cursor-pointer gap-2 inline-flex items-center">
                  {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Changer le logo
                </span>
              </Button>
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="farm_name">Nom de l'exploitation</Label>
              <Input
                id="farm_name"
                value={form.farm_name}
                onChange={(e) => setForm({ ...form, farm_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="farmer_type">Type d'exploitation</Label>
              <Select
                value={form.farmer_type}
                onValueChange={(v) => setForm({ ...form, farmer_type: v as FarmerType })}
              >
                <SelectTrigger id="farmer_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {farmerTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              className="min-h-[100px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ville</Label>
              <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v as GabonCity })}>
                <SelectTrigger id="city">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quartier">Quartier</Label>
              <Input
                id="quartier"
                value={form.quartier}
                onChange={(e) => setForm({ ...form, quartier: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
