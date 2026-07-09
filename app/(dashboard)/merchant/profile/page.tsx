"use client";

// ============================================
// Merchant Profile Page - Business Settings
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import {
  Store,
  MapPin,
  Phone,
  Clock,
  Camera,
  Save,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { MerchantType, GabonCity, DayHours, OpeningHours } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { getMyMerchantProfile, updateMerchantProfile } from "@/services/merchant.service";
import { resolveUserLocation, isWithinGabonBounds } from "@/services";
import { createDefaultMerchantProfile } from "@/services/merchant.service";
import { uploadMerchantAsset } from "@/services/storage.service";

const MERCHANT_TYPES: { value: MerchantType; label: string }[] = [
  { value: "bakery", label: "Boulangerie" },
  { value: "restaurant", label: "Restaurant" },
  { value: "grocery", label: "Épicerie" },
  { value: "supermarket", label: "Supermarché" },
  { value: "hotel", label: "Hôtel" },
  { value: "caterer", label: "Traiteur" },
  { value: "other", label: "Autre" },
];

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

const MerchantProfilePage = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [isProfileMissing, setIsProfileMissing] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState<"pending" | "approved" | "rejected">("pending");

  const [profile, setProfile] = useState({
    business_name: "",
    business_type: "restaurant" as MerchantType,
    description: "",
    city: "Libreville" as GabonCity,
    quartier: "",
    address: "",
    phone: "",
    email: "",
    is_active: true,
    logo_url: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hours, setHours] = useState<Record<string, DayHours>>({
    monday: { open: "08:00", close: "18:00", is_closed: false },
    tuesday: { open: "08:00", close: "18:00", is_closed: false },
    wednesday: { open: "08:00", close: "18:00", is_closed: false },
    thursday: { open: "08:00", close: "18:00", is_closed: false },
    friday: { open: "08:00", close: "18:00", is_closed: false },
    saturday: { open: "09:00", close: "14:00", is_closed: false },
    sunday: { open: "09:00", close: "12:00", is_closed: true },
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const result = await getMyMerchantProfile(user.id);
      if (result.success && result.data) {
        const m = result.data;
        setIsProfileMissing(false);
        setMerchantId(m.id);
        setMerchantStatus(
          m.is_verified ? "approved" : m.is_refused ? "rejected" : "pending"
        );
        setProfile({
          business_name: m.business_name || "",
          business_type: m.business_type,
          description: m.description || "",
          city: (m.city as GabonCity) || "Libreville",
          quartier: m.quartier || "",
          address: m.address || "",
          phone: m.phone || "",
          email: m.email || "",
          is_active: m.is_active,
          logo_url: m.logo_url || "",
          latitude: m.latitude ?? null,
          longitude: m.longitude ?? null,
        });

        if (m.opening_hours) {
          // Merge with defaults to ensure all days exist
          // Ensure we map any legacy 'closed' to 'is_closed' if necessary
          const mappedHours = Object.entries(m.opening_hours).reduce((acc, [day, time]: [string, any]) => {
            acc[day] = {
              ...time,
              // Map legacy property if it exists, otherwise use is_closed or default to false
              is_closed: time.is_closed !== undefined ? time.is_closed : (time.closed || false)
            };
            return acc;
          }, {} as Record<string, DayHours>);

          setHours(prev => ({ ...prev, ...mappedHours }));
        }
      } else {
        setMerchantId(null);
        setIsProfileMissing(true);
        console.warn("[MerchantProfile] Merchant profile missing for user", { userId: user.id });
      }
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du chargement du profil");
    }
  };

  const handleCreateProfile = async () => {
    if (!user) return;

    setIsCreatingProfile(true);
    try {
      const businessName =
        profile.business_name.trim() ||
        user.user_metadata?.business_name ||
        user.user_metadata?.full_name ||
        "Mon Commerce";

      const result = await createDefaultMerchantProfile({
        userId: user.id,
        businessName,
        businessType: profile.business_type || "other",
        description: profile.description || "",
        address: profile.address || "À compléter",
        city: profile.city || "Libreville",
        quartier: profile.quartier || "À compléter",
        phone: profile.phone || user.user_metadata?.phone || "À compléter",
        email: profile.email || user.email || "",
        latitude: profile.latitude,
        longitude: profile.longitude,
        logoUrl: profile.logo_url || null,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || "Erreur lors de la création du profil");
      }

      const data = result.data;
      setMerchantId(data.id);
      setIsProfileMissing(false);
      setMerchantStatus("pending");
      toast.success("Profil marchand créé. Il est en attente de validation.");

      await fetch("/api/merchant/onboarding-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: data.id }),
      }).catch((notifyError) => {
        console.warn("[MerchantProfile] Failed to notify admins for new merchant", notifyError);
      });
    } catch (error: any) {
      console.error("[MerchantProfile] Failed to create merchant profile", error);
      toast.error(error?.message || "Impossible de créer le profil marchand");
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const validateProfile = () => {
    if (!profile.business_name.trim()) {
      return "Le nom du commerce est obligatoire";
    }
    if (!profile.address.trim()) {
      return "L'adresse est obligatoire";
    }
    if (!profile.phone.trim()) {
      return "Le numéro de téléphone est obligatoire";
    }
    if (!profile.email.trim()) {
      return "L'email est obligatoire";
    }
    if (profile.latitude === null || profile.longitude === null) {
      return "La position GPS de la boutique est obligatoire";
    }
    if (!isWithinGabonBounds(profile.latitude, profile.longitude)) {
      return "La position GPS de la boutique doit se trouver au Gabon";
    }
    return null;
  };

  const handleSave = async () => {
    if (!merchantId) {
      toast.error("Profil marchand introuvable. Créez-le d'abord.");
      return;
    }

    const validationError = validateProfile();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        businessName: profile.business_name,
        businessType: profile.business_type,
        description: profile.description,
        city: profile.city,
        quartier: profile.quartier,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        logoUrl: profile.logo_url,
        latitude: profile.latitude,
        longitude: profile.longitude,
        isActive: profile.is_active,
        openingHours: hours as OpeningHours,
      };

      console.info("[MerchantProfile] Saving profile", {
        merchantId,
        payloadKeys: Object.keys(payload),
      });

      const result = await updateMerchantProfile(merchantId, payload);

      if (result.success) {
        toast.success("Profil mis à jour avec succès");
        if (result.data) {
          setMerchantStatus(
            result.data.is_verified
              ? "approved"
              : result.data.is_refused
                ? "rejected"
                : "pending"
          );
        }
      } else {
        console.warn("[MerchantProfile] Update failed", result.error);
        toast.error(result.error?.message || "Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error(error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeolocation = async () => {
    setIsLocating(true);
    toast.info("Acquisition de la position...");

    try {
      const result = await resolveUserLocation({
        forceRefresh: true,
        timeoutMs: 15000,
        maximumAgeMs: 0,
        enableHighAccuracy: true,
        fallbackToIp: false,
        requestBrowserPermission: true,
        retryLowAccuracy: true,
      });

      if (result.success && result.data) {
        const nextLatitude = result.data.latitude;
        const nextLongitude = result.data.longitude;

        // Reject a fix outside Gabon (misconfigured device, VPN, coarse IP
        // lookup) instead of silently saving a bogus location - this is how
        // merchants ended up stored at (0,0) in the past.
        if (!isWithinGabonBounds(nextLatitude, nextLongitude)) {
          toast.error("La position obtenue est hors du Gabon. Réessayez depuis l'emplacement de votre boutique.");
          return;
        }

        setProfile((prev) => ({
          ...prev,
          latitude: nextLatitude,
          longitude: nextLongitude,
        }));

        console.info("[MerchantProfile] Geolocation acquired", {
          latitude: nextLatitude,
          longitude: nextLongitude,
          source: result.data.source,
          approximate: result.data.isApproximate,
          accuracy: result.data.accuracy,
        });

        if (result.data.isApproximate) {
          toast.warning("Position approximative récupérée. Activez le GPS pour une précision maximale.");
        } else {
          toast.success("Position récupérée. Enregistrez pour la sauvegarder.");
        }
        return;
      }

      toast.error(result.error?.message || "Impossible d'obtenir votre position.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsLoading(true);
      const uploadResult = await uploadMerchantAsset('merchants', file);
      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error?.message || "Erreur lors de l'upload");
      }

      const publicUrl = uploadResult.data.publicUrl;
      setProfile(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success("Logo téléchargé avec succès");
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du téléchargement de l'image");
    } finally {
      setIsLoading(false);
    }
  };

  const dayLabels: Record<string, string> = {
    monday: "Lundi",
    tuesday: "Mardi",
    wednesday: "Mercredi",
    thursday: "Jeudi",
    friday: "Vendredi",
    saturday: "Samedi",
    sunday: "Dimanche",
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Mon commerce</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez les informations de votre établissement
        </p>
      </div>
      {isProfileMissing && (
        <Card className="border-amber-300/60 bg-amber-50/40">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600" />
              <div>
                <p className="font-medium text-foreground">Profil marchand introuvable</p>
                <p className="text-sm text-muted-foreground">
                  Votre compte marchand existe, mais la fiche boutique n&apos;a pas encore été créée.
                </p>
              </div>
            </div>
            <Button onClick={handleCreateProfile} disabled={isCreatingProfile}>
              {isCreatingProfile ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                "Créer ma fiche"
              )}
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 space-y-6"
        >
          {/* Business Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Store className="w-5 h-5 text-primary" />
                Informations générales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business_name">Nom du commerce</Label>
                  <Input
                    id="business_name"
                    value={profile.business_name}
                    onChange={(e) =>
                      setProfile({ ...profile, business_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_type">Type de commerce</Label>
                  <Select
                    value={profile.business_type}
                    onValueChange={(v) =>
                      setProfile({ ...profile, business_type: v as MerchantType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MERCHANT_TYPES.map((type) => (
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
                  value={profile.description}
                  onChange={(e) =>
                    setProfile({ ...profile, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Localisation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Ville</Label>
                  <Select
                    value={profile.city}
                    onValueChange={(v) =>
                      setProfile({ ...profile, city: v as GabonCity })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GABON_CITIES.map((city) => (
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
                    value={profile.quartier}
                    onChange={(e) =>
                      setProfile({ ...profile, quartier: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Adresse complète</Label>
                <Input
                  id="address"
                  value={profile.address}
                  onChange={(e) =>
                    setProfile({ ...profile, address: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Position GPS (Satellitaire)</Label>
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1 p-2 bg-muted/50 rounded-md text-xs font-mono border border-input flex items-center justify-center">
                    {profile.latitude !== null && profile.longitude !== null ? (
                      <span className="text-primary font-medium">
                        {profile.latitude.toFixed(6)}, {profile.longitude.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Aucune position définie</span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGeolocation}
                    type="button"
                    disabled={isLocating}
                  >
                    {isLocating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <MapPin className="w-4 h-4 mr-2" />
                    )}
                    {isLocating ? "Localisation..." : "Obtenir ma position"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Activez la localisation de votre appareil pour obtenir une précision satellitaire exacte.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5 text-primary" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Opening Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Horaires d'ouverture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(hours).map(([day, time]) => (
                  <div
                    key={day}
                    className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg"
                  >
                    <span className="w-24 font-medium text-foreground capitalize">
                      {dayLabels[day]}
                    </span>
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={time.open}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [day]: { ...time, open: e.target.value },
                          })
                        }
                        disabled={time.is_closed}
                        className="w-28"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="time"
                        value={time.close}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [day]: { ...time, close: e.target.value },
                          })
                        }
                        disabled={time.is_closed}
                        className="w-28"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`closed-${day}`} className="text-sm cursor-pointer">
                        Fermé
                      </Label>
                      <Switch
                        id={`closed-${day}`}
                        checked={time.is_closed}
                        onCheckedChange={(checked) =>
                          setHours({
                            ...hours,
                            [day]: { ...time, is_closed: checked },
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Profile Picture */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Photo de profil</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div
                className="w-32 h-32 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-4 overflow-hidden cursor-pointer relative group border-2 border-transparent hover:border-primary transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                {profile.logo_url ? (
                  <Image
                    src={profile.logo_url}
                    alt="Logo"
                    fill
                    className="object-cover"
                    sizes="128px"
                  />
                ) : (
                  <Store className="w-16 h-16 text-primary" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
              <Button variant="outline" className="gap-2 w-full" onClick={() => fileInputRef.current?.click()}>
                <Camera className="w-4 h-4" />
                Changer la photo
              </Button>
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Commerce actif</span>
                <Switch
                  checked={profile.is_active}
                  onCheckedChange={(checked) =>
                    setProfile({ ...profile, is_active: checked })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    merchantStatus === "approved"
                      ? "default"
                      : merchantStatus === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                  className="gap-1"
                >
                  <CheckCircle className="w-3 h-3" />
                  {merchantStatus === "approved"
                    ? "Approuvé"
                    : merchantStatus === "rejected"
                      ? "Refusé"
                      : "En attente"}
                </Badge>
                <Badge variant="secondary">{profile.is_active ? "En ligne" : "Hors ligne"}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={handleSave}
            disabled={isLoading || !merchantId}
          >
            <Save className="w-4 h-4" />
            {isLoading ? "Enregistrement..." : !merchantId ? "Profil introuvable" : "Enregistrer"}
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default MerchantProfilePage;
