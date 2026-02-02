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
} from "lucide-react";
import { toast } from "sonner";
import type { MerchantType, GabonCity, DayHours, OpeningHours } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { getMyMerchantProfile, updateMerchantProfile } from "@/services/merchant.service";
import { supabaseClient } from "@/api/supabaseClient";

const MERCHANT_TYPES: { value: MerchantType; label: string }[] = [
  { value: "bakery", label: "Boulangerie" },
  { value: "restaurant", label: "Restaurant" },
  { value: "grocery", label: "Épicerie" },
  { value: "supermarket", label: "Supermarché" },
  { value: "hotel", label: "Hôtel" },
  { value: "caterer", label: "Traiteur" },
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
  const [merchantId, setMerchantId] = useState<string | null>(null);

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
    latitude: 0,
    longitude: 0,
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
        setMerchantId(m.id);
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
          latitude: m.latitude || 0,
          longitude: m.longitude || 0,
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
      }
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du chargement du profil");
    }
  };

  const handleSave = async () => {
    if (!merchantId) return;
    setIsLoading(true);

    try {
      const result = await updateMerchantProfile(merchantId, {
        businessName: profile.business_name,
        description: profile.description,
        // @ts-ignore - city type mismatch potential
        city: profile.city,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        logoUrl: profile.logo_url,
        latitude: profile.latitude,
        longitude: profile.longitude,
        openingHours: hours as OpeningHours,
      });

      if (result.success) {
        toast.success("Profil mis à jour avec succès");
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error(error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    toast.info("Acquisition de la position...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setProfile({
          ...profile,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        toast.success("Position mise à jour avec précision satellitaire");
      },
      (error) => {
        console.error(error);
        toast.error("Impossible d'obtenir votre position. Vérifiez vos autorisations.");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !supabaseClient) return;

    try {
      setIsLoading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `merchants/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabaseClient.storage.from('avatars').getPublicUrl(filePath);

      setProfile(prev => ({ ...prev, logo_url: data.publicUrl }));
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
                    {profile.latitude !== 0 ? (
                      <span className="text-primary font-medium">
                        {profile.latitude.toFixed(6)}, {profile.longitude.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Aucune position définie</span>
                    )}
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleGeolocation} type="button">
                    <MapPin className="w-4 h-4 mr-2" />
                    Obtenir ma position
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
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Vérifié
                </Badge>
                <Badge variant="secondary">En ligne</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Save className="w-4 h-4" />
            {isLoading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default MerchantProfilePage;
