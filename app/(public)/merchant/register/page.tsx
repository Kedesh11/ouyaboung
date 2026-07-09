"use client";

// ============================================
// Merchant Registration Page - Business Signup Form
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Store,
  Upload,
  MapPin,
  Phone,
  Mail,
  FileText,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Leaf,
  Lock,
  LocateFixed,
} from "lucide-react";
import {
  register,
  registerMerchant,
  getMyMerchantProfile,
  updateMerchantProfile,
  updateMerchantLogoByUserId,
  resolveUserLocation,
  formatLocationAccuracy,
  isWithinGabonBounds,
  GABON_LOCATION_BOUNDS,
} from "@/services";
import { uploadMerchantDocument } from "@/services/storage.service";

// Validation schema
const merchantFormSchema = z.object({
  // Step 1: Business Info
  business_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  business_type: z.string().min(1, "Sélectionnez un type d'activité"),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(500),

  // Step 2: Contact Info
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  phone: z.string().min(8, "Numéro de téléphone invalide").max(20),
  address: z.string().min(5, "Adresse requise"),
  city: z.string().min(1, "Ville requise"),
  quartier: z.string().min(2, "Quartier requis"),
  latitude: z.number()
    .min(GABON_LOCATION_BOUNDS.minLatitude, "Position hors du Gabon")
    .max(GABON_LOCATION_BOUNDS.maxLatitude, "Position hors du Gabon")
    .optional()
    .refine((value) => typeof value === "number", "Position GPS obligatoire"),
  longitude: z.number()
    .min(GABON_LOCATION_BOUNDS.minLongitude, "Position hors du Gabon")
    .max(GABON_LOCATION_BOUNDS.maxLongitude, "Position hors du Gabon")
    .optional()
    .refine((value) => typeof value === "number", "Position GPS obligatoire"),

  // Step 3: Documents
  rccm_number: z.string().optional(),
  nif_number: z.string().optional(),

  // Terms
  accept_terms: z.boolean().refine(val => val === true, "Vous devez accepter les conditions"),
  accept_anti_waste: z.boolean().refine(val => val === true, "Vous devez vous engager contre le gaspillage"),
});

type MerchantFormData = z.infer<typeof merchantFormSchema>;

const businessTypes = [
  { value: "restaurant", label: "Restaurant" },
  { value: "bakery", label: "Boulangerie / Pâtisserie" },
  { value: "supermarket", label: "Supermarché" },
  { value: "grocery", label: "Épicerie" },
  { value: "hotel", label: "Hôtel" },
  { value: "caterer", label: "Traiteur" },
  { value: "other", label: "Autre" },
];

const cities = [
  { value: "Libreville", label: "Libreville" },
  { value: "Port-Gentil", label: "Port-Gentil" },
  { value: "Franceville", label: "Franceville" },
  { value: "Oyem", label: "Oyem" },
  { value: "Moanda", label: "Moanda" },
];

const MerchantRegisterPage = () => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{
    logo?: File;
    rccm?: File;
    nif?: File;
  }>({});

  const form = useForm<MerchantFormData>({
    resolver: zodResolver(merchantFormSchema),
    defaultValues: {
      business_name: "",
      business_type: "",
      description: "",
      email: "",
      password: "",
      phone: "",
      address: "",
      city: "",
      quartier: "",
      latitude: undefined,
      longitude: undefined,
      rccm_number: "",
      nif_number: "",
      accept_terms: false,
      accept_anti_waste: false,
    },
  });

  const totalSteps = 4;

  const handleFileUpload = (type: 'logo' | 'rccm' | 'nif') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Le fichier ne doit pas dépasser 5MB");
        return;
      }
      setUploadedFiles(prev => ({ ...prev, [type]: file }));
      toast.success(`${type === 'logo' ? 'Logo' : 'Document'} uploadé avec succès`);
    }
  };

  const uploadFileToSupabase = async (file: File, path: string) => {
    try {
      const uploadResult = await uploadMerchantDocument(path, file);
      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error?.message || 'Upload failed');
      }

      return uploadResult.data.publicUrl;
    } catch (error) {
      console.error('Supabase client error:', error);
      return null;
    }
  };

  const nextStep = async () => {
    let fieldsToValidate: (keyof MerchantFormData)[] = [];

    switch (currentStep) {
      case 1:
        fieldsToValidate = ['business_name', 'business_type', 'description'];
        break;
      case 2:
        fieldsToValidate = ['email', 'password', 'phone', 'address', 'city', 'quartier', 'latitude', 'longitude'];
        break;
      case 3:
        // Documents are optional
        break;
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleGeolocation = async () => {
    setIsLocating(true);
    toast.info("Acquisition de la position de votre boutique...");

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

      if (!result.success || !result.data) {
        toast.error(result.error?.message || "Impossible d'obtenir une position GPS fiable.");
        return;
      }

      // A GPS/IP fix outside Gabon (misconfigured device, VPN, coarse IP
      // lookup) is never a real shop location - reject it here instead of
      // letting a bogus pair reach the form/DB, which is how merchants ended
      // up saved at (0,0) in the past.
      if (!isWithinGabonBounds(result.data.latitude, result.data.longitude)) {
        toast.error("La position obtenue est hors du Gabon. Réessayez depuis l'emplacement de votre boutique.");
        return;
      }

      form.setValue("latitude", result.data.latitude, { shouldDirty: true, shouldValidate: true });
      form.setValue("longitude", result.data.longitude, { shouldDirty: true, shouldValidate: true });
      toast.success("Position GPS enregistrée", {
        description: formatLocationAccuracy(result.data),
      });
    } finally {
      setIsLocating(false);
    }
  };

  const renderStep3 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <FileText className="w-12 h-12 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Documents légaux (optionnel)</h2>
        <p className="text-muted-foreground text-sm">
          Ces documents sont nécessaires pour valider votre compte. Vous pouvez les ajouter plus tard.
        </p>
      </div>

      {/* RCCM Upload */}
      <div className="space-y-2">
        <FormLabel>Numéro RCCM</FormLabel>
        <FormField
          control={form.control}
          name="rccm_number"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder="Ex: RC 12345/A" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={handleFileUpload('rccm')}
            className="hidden"
            id="rccm-upload"
          />
          <label htmlFor="rccm-upload" className="cursor-pointer">
            {uploadedFiles.rccm ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span>{uploadedFiles.rccm.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Cliquez pour uploader votre RCCM
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, PNG, JPG jusqu'à 5MB
                </p>
              </>
            )}
          </label>
        </div>
      </div>

      {/* NIF Upload */}
      <div className="space-y-2">
        <FormLabel>Numéro NIF</FormLabel>
        <FormField
          control={form.control}
          name="nif_number"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder="Ex: 123456789" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={handleFileUpload('nif')}
            className="hidden"
            id="nif-upload"
          />
          <label htmlFor="nif-upload" className="cursor-pointer">
            {uploadedFiles.nif ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span>{uploadedFiles.nif.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Cliquez pour uploader votre NIF
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, PNG, JPG jusqu'à 5MB
                </p>
              </>
            )}
          </label>
        </div>
      </div>
    </motion.div>
  );

  const renderStep4 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <Leaf className="w-12 h-12 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Conditions Générales</h2>
        <p className="text-muted-foreground text-sm">
          Veuillez lire et accepter nos conditions pour finaliser votre inscription.
        </p>
      </div>

      <FormField
        control={form.control}
        name="accept_terms"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>
                J'accepte les <Link href="/legal/cgu" className="text-primary hover:underline">Conditions Générales d'Utilisation</Link>
              </FormLabel>
              <FormDescription>
                En cochant cette case, vous confirmez avoir lu et accepté nos CGU.
              </FormDescription>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="accept_anti_waste"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>
                Je m'engage activement dans la lutte contre le gaspillage alimentaire
              </FormLabel>
              <FormDescription>
                En cochant cette case, vous affirmez votre engagement à réduire le gaspillage alimentaire au sein de votre commerce.
              </FormDescription>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />
    </motion.div>
  );

  const onSubmit = async (data: MerchantFormData) => {
    setIsSubmitting(true);
    console.log("=== Registration Started (Robust Flow) ===");

    try {
      // Prepare metadata for the Trigger
      // We pass all textual data here so the Trigger handles the INSERT into 'merchants' table.
      const metadata = {
        business_name: data.business_name,
        business_type: data.business_type,
        description: data.description,
        phone: data.phone,
        address: data.address,
        city: data.city,
        quartier: data.quartier,
        latitude: data.latitude,
        longitude: data.longitude,
        // Logo URL will be updated later if immediate upload is possible
      };

      // 1. Register User
      console.log("Step 1: Registering User with Metadata...");
      const authResult = await register(data.email, data.password, {
        role: 'merchant',
        businessName: data.business_name,
        fullName: data.business_name,
        metadata: metadata
      });

      if (!authResult.success || !authResult.data?.user) {
        throw new Error(`Erreur Auth: ${authResult.error?.message || "Création de compte échouée"}`);
      }

      console.log("Step 1 Success. User created.");
      const session = authResult.data.session;
      const user = authResult.data.user;
      let merchantId: string | null = null;

      // 2. Ensure merchant row exists in pending state
      if (session) {
        const existingMerchantResult = await getMyMerchantProfile(user.id);
        const existingMerchant = existingMerchantResult.success ? existingMerchantResult.data : null;

        if (existingMerchant?.id) {
          merchantId = existingMerchant.id;

          if (!existingMerchant.is_verified) {
            const updateResult = await updateMerchantProfile(existingMerchant.id, {
              businessName: data.business_name,
              businessType: data.business_type as any,
              description: data.description,
              address: data.address,
              city: data.city as any,
              quartier: data.quartier,
              phone: data.phone,
              email: data.email,
              latitude: data.latitude,
              longitude: data.longitude,
              isActive: false,
            });

            if (!updateResult.success) {
              console.warn("[MerchantRegister] Failed to refresh pending merchant", updateResult.error);
            }
          }
        } else {
          const createResult = await registerMerchant({
            userId: user.id,
            businessName: data.business_name,
            businessType: data.business_type as any,
            description: data.description,
            address: data.address,
            city: data.city as any,
            quartier: data.quartier,
            phone: data.phone,
            email: data.email,
            latitude: data.latitude,
            longitude: data.longitude,
          });

          if (!createResult.success) {
            console.warn("[MerchantRegister] Failed to create merchant row", createResult.error);
          } else {
            merchantId = createResult.data?.id || null;
          }
        }
      }

      // 3. Upload Files (Only if we have a session/auto-login)
      if (session) {
        console.log("Session active, attempting file upload...");
        let logoUrl = null;
        if (uploadedFiles.logo) {
          try {
            // Use the supabase client which executes with the current session context
            // Note: 'uploadFileToSupabase' creates a new client, we might need to ensure it uses the session?
            // Actually 'requireSupabaseClient' should pick up the session if stored in cookie/localstorage by the auth call?
            // Safest is to rely on the fact that if 'register' returns session, the client might have updated.
            logoUrl = await uploadFileToSupabase(uploadedFiles.logo, 'logos');
          } catch (e) {
            console.error("Upload failed", e);
          }
        }

        // 4. Update Merchant Record with Logo if uploaded
        if (logoUrl) {
          console.log("Updating merchant with Logo URL...");
          await updateMerchantLogoByUserId(user.id, logoUrl);
        }

        // 5. Notify admins (internal notification + email)
        if (merchantId) {
          const notifyResponse = await fetch("/api/merchant/onboarding-notify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ merchantId }),
          });

          if (!notifyResponse.ok) {
            const notifyResult = await notifyResponse.json().catch(() => null);
            console.warn("[MerchantRegister] Admin notification failed", notifyResult);
          }
        }
      } else {
        console.log("No active session (Email confirmation required). Skipping file upload.");
        if (uploadedFiles.logo) {
          toast.info("Veuillez confirmer votre email", {
            description: "Vous pourrez ajouter votre logo après la connexion."
          });
        }
      }

      toast.success("Compte créé avec succès!", {
        description: session
          ? "Votre boutique a été créée avec le statut En attente de validation admin."
          : "Votre inscription est enregistrée. Veuillez vérifier votre email.",
        duration: 8000,
      });

      router.push("/auth?role=merchant");
    } catch (error: any) {
      console.error("Registration Process Failed:", error);
      toast.error("Échec de l'inscription", {
        description: error.message || "Une erreur inattendue est survenue.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step < currentStep
              ? "bg-primary text-primary-foreground"
              : step === currentStep
                ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                : "bg-muted text-muted-foreground"
              }`}
          >
            {step < currentStep ? <CheckCircle2 className="w-5 h-5" /> : step}
          </div>
          {step < 4 && (
            <div
              className={`w-12 h-1 mx-1 rounded ${step < currentStep ? "bg-primary" : "bg-muted"
                }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <Store className="w-12 h-12 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Informations sur votre commerce</h2>
        <p className="text-muted-foreground text-sm">Parlez-nous de votre activité</p>
      </div>

      <FormField
        control={form.control}
        name="business_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nom du commerce *</FormLabel>
            <FormControl>
              <Input placeholder="Ex: Boulangerie du Quartier" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="business_type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Type d'activité *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez votre type d'activité" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {businessTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description *</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Décrivez votre commerce et les types de produits que vous proposez..."
                className="min-h-[100px]"
                {...field}
              />
            </FormControl>
            <FormDescription>
              Cette description sera visible par les clients
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Logo Upload */}
      <div className="space-y-2">
        <FormLabel>Logo du commerce (optionnel)</FormLabel>
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload('logo')}
            className="hidden"
            id="logo-upload"
          />
          <label htmlFor="logo-upload" className="cursor-pointer">
            {uploadedFiles.logo ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span>{uploadedFiles.logo.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Cliquez pour uploader votre logo
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG jusqu'à 5MB
                </p>
              </>
            )}
          </label>
        </div>
      </div>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <MapPin className="w-12 h-12 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Coordonnées</h2>
        <p className="text-muted-foreground text-sm">Comment vous contacter et vous trouver</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email professionnel *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="contact@commerce.ga" className="pl-10" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mot de passe *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="pl-10"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Téléphone *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="+241 XX XX XX XX" className="pl-10" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Adresse complète *</FormLabel>
            <FormControl>
              <Input placeholder="Numéro, rue, bâtiment..." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ville *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez une ville" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.value} value={city.value}>
                      {city.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quartier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quartier *</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Louis, Nzeng-Ayong..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="latitude"
        render={() => (
          <FormItem>
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <FormLabel>Position GPS de la boutique *</FormLabel>
                  <FormDescription>
                    Cette position permet aux clients de voir votre boutique dans le bon rayon sur la carte.
                  </FormDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={handleGeolocation}
                  disabled={isLocating}
                >
                  {isLocating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LocateFixed className="w-4 h-4" />
                  )}
                  {isLocating ? "Localisation..." : "Obtenir la position"}
                </Button>
              </div>
              <div className="rounded-md bg-muted/50 p-2 text-xs font-mono">
                {typeof form.watch("latitude") === "number" && typeof form.watch("longitude") === "number" ? (
                  <span className="text-primary font-medium">
                    {form.watch("latitude")?.toFixed(6)}, {form.watch("longitude")?.toFixed(6)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Aucune position GPS enregistrée</span>
                )}
              </div>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="longitude"
        render={() => (
          <FormItem className="space-y-0">
            <FormMessage />
          </FormItem>
        )}
      />
    </motion.div>
  );



  return (
    <div className="min-h-screen bg-background">
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Devenir partenaire <span className="text-gradient">ouyaboung</span>
            </h1>
            <p className="text-muted-foreground">
              Rejoignez le mouvement anti-gaspillage et valorisez vos invendus
            </p>
          </motion.div>

          {renderStepIndicator()}

          <Card>
            <CardContent className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  {currentStep === 1 && renderStep1()}
                  {currentStep === 2 && renderStep2()}
                  {currentStep === 3 && renderStep3()}
                  {currentStep === 4 && renderStep4()}

                  <div className="flex justify-between mt-8">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      disabled={currentStep === 1}
                      className="gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Précédent
                    </Button>

                    {currentStep < totalSteps ? (
                      <Button type="button" onClick={nextStep} className="gap-2">
                        Suivant
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button type="submit" disabled={isSubmitting} className="gap-2">
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Envoi en cours...
                          </>
                        ) : (
                          <>
                            Soumettre ma demande
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Déjà partenaire ?{" "}
            <Link href="/auth" className="text-primary hover:underline">
              Connectez-vous
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default MerchantRegisterPage;
