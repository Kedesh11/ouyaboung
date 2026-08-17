"use client";

// ============================================
// Driver Registration Page - Chauffeurs / livraison
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
import { Card, CardContent } from "@/components/ui/card";
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
  Truck,
  Upload,
  MapPin,
  Phone,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Leaf,
  Lock,
} from "lucide-react";
import {
  register,
  registerDriver,
  getMyDriverProfile,
  updateDriverProfile,
  updateDriverPhotoByUserId,
  uploadDriverAsset,
} from "@/services";

const PLATE_NUMBER_REGEX = /^[A-Z]{2}-\d{4}-[A-Z]{2}$/;

// Formats raw keystrokes into the GA-1234-LB layout as the user types:
// scans left to right, routing each letter/digit into the next slot that
// still needs one (2 letters, then 4 digits, then 2 letters), and inserts
// the separating dashes automatically. Characters that don't fit any
// remaining slot (wrong type, or once all 8 slots are full) are dropped.
const formatPlateNumber = (raw: string) => {
  let letters1 = "";
  let digits = "";
  let letters2 = "";

  for (const char of raw.toUpperCase()) {
    if (/[A-Z]/.test(char)) {
      if (letters1.length < 2) letters1 += char;
      else if (digits.length === 4 && letters2.length < 2) letters2 += char;
    } else if (/[0-9]/.test(char)) {
      if (letters1.length === 2 && digits.length < 4) digits += char;
    }
  }

  return [letters1, digits, letters2].filter(Boolean).join("-");
};

const driverFormSchema = z.object({
  // Step 1: Driver Info
  full_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  vehicle_type: z.string().min(1, "Sélectionnez un type de véhicule"),
  plate_number: z
    .string()
    .optional()
    .refine((val) => !val || PLATE_NUMBER_REGEX.test(val), {
      message: "Format attendu : GA-1234-LB (2 lettres, 4 chiffres, 2 lettres)",
    }),

  // Step 2: Contact Info
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  phone: z.string().min(8, "Numéro de téléphone invalide").max(20),
  city: z.string().min(1, "Ville requise"),
  delivery_zone: z.string().optional(),

  // Terms
  accept_terms: z.boolean().refine(val => val === true, "Vous devez accepter les conditions"),
  accept_conduct: z.boolean().refine(val => val === true, "Vous devez vous engager à respecter les délais et la sécurité"),
});

type DriverFormData = z.infer<typeof driverFormSchema>;

const vehicleTypes = [
  { value: "moto", label: "Moto" },
  { value: "voiture", label: "Voiture" },
  { value: "camionnette", label: "Camionnette" },
  { value: "tricycle", label: "Tricycle" },
  { value: "other", label: "Autre" },
];

const cities = [
  { value: "Libreville", label: "Libreville" },
  { value: "Port-Gentil", label: "Port-Gentil" },
  { value: "Franceville", label: "Franceville" },
  { value: "Oyem", label: "Oyem" },
  { value: "Moanda", label: "Moanda" },
];

const DriverRegisterPage = () => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState<File | undefined>(undefined);

  const form = useForm<DriverFormData>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      full_name: "",
      vehicle_type: "",
      plate_number: "",
      email: "",
      password: "",
      phone: "",
      city: "",
      delivery_zone: "",
      accept_terms: false,
      accept_conduct: false,
    },
  });

  const totalSteps = 3;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Le fichier ne doit pas dépasser 5MB");
        return;
      }
      setUploadedPhoto(file);
      toast.success("Photo uploadée avec succès");
    }
  };

  const uploadFileToSupabase = async (file: File, path: string) => {
    try {
      const uploadResult = await uploadDriverAsset(path, file);
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
    let fieldsToValidate: (keyof DriverFormData)[] = [];

    switch (currentStep) {
      case 1:
        fieldsToValidate = ['full_name', 'vehicle_type'];
        break;
      case 2:
        fieldsToValidate = ['email', 'password', 'phone', 'city'];
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

  const renderStep3 = () => (
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
        name="accept_conduct"
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
                Je m'engage à respecter les délais de livraison et les règles de sécurité routière
              </FormLabel>
              <FormDescription>
                En cochant cette case, vous confirmez votre engagement envers les agriculteurs et commerçants de la plateforme.
              </FormDescription>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />
    </motion.div>
  );

  const onSubmit = async (data: DriverFormData) => {
    setIsSubmitting(true);

    try {
      const metadata = {
        full_name: data.full_name,
        vehicle_type: data.vehicle_type,
        plate_number: data.plate_number,
        phone: data.phone,
        city: data.city,
        delivery_zone: data.delivery_zone,
      };

      const authResult = await register(data.email, data.password, {
        role: 'driver',
        fullName: data.full_name,
        phone: data.phone,
        metadata,
      });

      if (!authResult.success || !authResult.data?.user) {
        throw new Error(`Erreur Auth: ${authResult.error?.message || "Création de compte échouée"}`);
      }

      const session = authResult.data.session;
      const user = authResult.data.user;
      let driverId: string | null = null;

      if (session) {
        const existingDriverResult = await getMyDriverProfile(user.id);
        const existingDriver = existingDriverResult.success ? existingDriverResult.data : null;

        if (existingDriver?.id) {
          driverId = existingDriver.id;

          if (!existingDriver.is_verified) {
            const updateResult = await updateDriverProfile(existingDriver.id, {
              fullName: data.full_name,
              vehicleType: data.vehicle_type as any,
              plateNumber: data.plate_number,
              phone: data.phone,
              email: data.email,
              city: data.city as any,
              deliveryZone: data.delivery_zone,
              isActive: false,
            });

            if (!updateResult.success) {
              console.warn("[DriverRegister] Failed to refresh pending driver", updateResult.error);
            }
          }
        } else {
          const createResult = await registerDriver({
            userId: user.id,
            fullName: data.full_name,
            vehicleType: data.vehicle_type as any,
            plateNumber: data.plate_number,
            phone: data.phone,
            email: data.email,
            city: data.city as any,
            deliveryZone: data.delivery_zone,
          });

          if (!createResult.success) {
            console.warn("[DriverRegister] Failed to create driver row", createResult.error);
          } else {
            driverId = createResult.data?.id || null;
          }
        }
      }

      if (session) {
        let photoUrl: string | null = null;
        if (uploadedPhoto) {
          try {
            photoUrl = await uploadFileToSupabase(uploadedPhoto, 'driver-photos');
          } catch (e) {
            console.error("Upload failed", e);
          }
        }

        if (photoUrl) {
          await updateDriverPhotoByUserId(user.id, photoUrl);
        }

        if (driverId) {
          const notifyResponse = await fetch("/api/driver/onboarding-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driverId }),
          });

          if (!notifyResponse.ok) {
            const notifyResult = await notifyResponse.json().catch(() => null);
            console.warn("[DriverRegister] Admin notification failed", notifyResult);
          }
        }
      } else if (uploadedPhoto) {
        toast.info("Veuillez confirmer votre email", {
          description: "Vous pourrez ajouter votre photo après la connexion."
        });
      }

      toast.success("Compte créé avec succès!", {
        description: session
          ? "Votre profil chauffeur a été créé avec le statut En attente de validation admin."
          : "Votre inscription est enregistrée. Veuillez vérifier votre email.",
        duration: 8000,
      });

      router.push("/auth?role=driver");
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
      {[1, 2, 3].map((step) => (
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
          {step < totalSteps && (
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
        <Truck className="w-12 h-12 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Vos informations de chauffeur</h2>
        <p className="text-muted-foreground text-sm">Parlez-nous de vous et de votre véhicule</p>
      </div>

      <FormField
        control={form.control}
        name="full_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nom complet *</FormLabel>
            <FormControl>
              <Input placeholder="Ex: Jean Mbadinga" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="vehicle_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type de véhicule *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez votre véhicule" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {vehicleTypes.map((type) => (
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
          name="plate_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plaque d'immatriculation</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ex: GA-1234-LB"
                  maxLength={10}
                  {...field}
                  onChange={(e) => field.onChange(formatPlateNumber(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <FormLabel>Photo (optionnel)</FormLabel>
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
            id="photo-upload"
          />
          <label htmlFor="photo-upload" className="cursor-pointer">
            {uploadedPhoto ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span>{uploadedPhoto.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Cliquez pour uploader une photo
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
        <p className="text-muted-foreground text-sm">Comment vous contacter et votre zone de livraison</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email *</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="contact@email.ga" className="pl-10" {...field} />
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
      </div>

      <FormField
        control={form.control}
        name="delivery_zone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Zone de livraison couverte</FormLabel>
            <FormControl>
              <Input placeholder="Ex: Louis, Nzeng-Ayong, Akanda..." {...field} />
            </FormControl>
            <FormDescription>
              Les quartiers où vous pouvez effectuer des livraisons.
            </FormDescription>
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
              Devenir <span className="text-gradient">chauffeur partenaire</span>
            </h1>
            <p className="text-muted-foreground">
              Livrez les commandes entre agriculteurs et commerçants sur Ouyaboung
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
            Déjà inscrit ?{" "}
            <Link href="/auth" className="text-primary hover:underline">
              Connectez-vous
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default DriverRegisterPage;
