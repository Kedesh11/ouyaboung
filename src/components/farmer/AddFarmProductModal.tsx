// ============================================
// Add Farm Product Modal - Create/Edit catalogue entries
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Plus,
  X,
  Upload,
  Camera,
  Loader2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import type { FarmProductCategory, FarmProduct } from "@/types";
import { createListing as createFarmProductListing, updateListing as updateFarmProductListing } from "@/services/farm-product.service";
import { compressImage, validateImageFile, formatFileSize, getBase64Size } from "@/utils/imageCompression";

interface AddFarmProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductCreated?: () => void;
  farmerId: string;
  productToEdit?: FarmProduct | null;
}

const categories: { value: FarmProductCategory; label: string }[] = [
  { value: "tubercules", label: "Tubercules (manioc, igname...)" },
  { value: "legumes_feuilles", label: "Légumes & feuilles" },
  { value: "fruits", label: "Fruits" },
  { value: "cereales", label: "Céréales" },
  { value: "elevage_volaille", label: "Volaille" },
  { value: "elevage_betail", label: "Bétail" },
  { value: "peche", label: "Pêche" },
  { value: "autre", label: "Autre" },
];

const units = ["kg", "sac", "caisse", "unite", "botte", "litre"];

interface FarmProductFormState {
  name: string;
  description: string;
  category: FarmProductCategory;
  unit: string;
  price_per_unit: number;
  quantity_available: number;
  available_from: string;
  available_until: string;
  image_url: string;
}

const emptyForm: FarmProductFormState = {
  name: "",
  description: "",
  category: "autre",
  unit: "kg",
  price_per_unit: 0,
  quantity_available: 1,
  available_from: "",
  available_until: "",
  image_url: "",
};

const AddFarmProductModal = ({
  open,
  onOpenChange,
  onProductCreated,
  farmerId,
  productToEdit,
}: AddFarmProductModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FarmProductFormState>(emptyForm);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{ original: number; compressed: number } | null>(null);

  useEffect(() => {
    if (open && productToEdit) {
      setForm({
        name: productToEdit.name,
        description: productToEdit.description || "",
        category: productToEdit.category,
        unit: productToEdit.unit,
        price_per_unit: productToEdit.price_per_unit,
        quantity_available: productToEdit.quantity_available,
        available_from: productToEdit.available_from ? productToEdit.available_from.slice(0, 10) : "",
        available_until: productToEdit.available_until ? productToEdit.available_until.slice(0, 10) : "",
        image_url: productToEdit.image_url || "",
      });
      setImagePreview(productToEdit.image_url || null);
    } else if (open && !productToEdit) {
      resetForm();
    }
  }, [open, productToEdit]);

  const resetForm = () => {
    setForm(emptyForm);
    setImagePreview(null);
    setCompressionInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file, 10);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setIsCompressing(true);
    const originalSize = file.size;

    try {
      const compressedDataUrl = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8,
        mimeType: 'image/jpeg',
      });

      const compressedSize = getBase64Size(compressedDataUrl);
      setCompressionInfo({ original: originalSize, compressed: compressedSize });
      setImagePreview(compressedDataUrl);
      setForm((prev) => ({ ...prev, image_url: compressedDataUrl }));

      const savings = Math.round((1 - compressedSize / originalSize) * 100);
      toast.success(`Image compressée (${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}, -${savings}%)`);
    } catch (error) {
      console.error("Image compression error:", error);
      toast.error("Erreur lors de la compression de l'image");
    } finally {
      setIsCompressing(false);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setForm((prev) => ({ ...prev, image_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price_per_unit) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name,
        description: form.description,
        category: form.category,
        unit: form.unit,
        pricePerUnit: form.price_per_unit,
        quantity: form.quantity_available,
        availableFrom: form.available_from || undefined,
        availableUntil: form.available_until || undefined,
        imageUrl: form.image_url || undefined,
      };

      const response = productToEdit
        ? await updateFarmProductListing(productToEdit.id, payload)
        : await createFarmProductListing(farmerId, payload);

      if (response.success) {
        toast.success(productToEdit ? `Produit "${form.name}" modifié` : `Produit "${form.name}" créé`);
        onProductCreated?.();
        handleClose();
      } else {
        toast.error(response.error?.message || "Erreur lors de l'enregistrement du produit");
      }
    } catch (error) {
      console.error("Error creating/updating farm product:", error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {productToEdit ? (
              <Edit className="w-5 h-5 text-primary" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
            {productToEdit ? "Modifier le produit" : "Ajouter un produit"}
          </DialogTitle>
          <DialogDescription>
            {productToEdit
              ? "Modifiez les informations de votre produit"
              : "Ajoutez une récolte ou un produit disponible dans votre catalogue"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du produit *</Label>
              <Input
                id="name"
                placeholder="Ex: Manioc frais"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Catégorie *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as FarmProductCategory })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
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
              placeholder="Décrivez votre produit..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit">Unité *</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Unité" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_per_unit">Prix par unité (XAF) *</Label>
              <Input
                id="price_per_unit"
                type="number"
                min="0"
                placeholder="1000"
                value={form.price_per_unit || ""}
                onChange={(e) => setForm({ ...form, price_per_unit: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantité disponible *</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={form.quantity_available}
                onChange={(e) => setForm({ ...form, quantity_available: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="available_from">Disponible à partir du</Label>
              <Input
                id="available_from"
                type="date"
                value={form.available_from}
                onChange={(e) => setForm({ ...form, available_from: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="available_until">Disponible jusqu'au</Label>
              <Input
                id="available_until"
                type="date"
                value={form.available_until}
                onChange={(e) => setForm({ ...form, available_until: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Image du produit</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            {isCompressing ? (
              <div className="flex items-center justify-center h-32 rounded-lg border border-border bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Compression en cours...</span>
                </div>
              </div>
            ) : imagePreview ? (
              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                <Image
                  src={imagePreview}
                  alt="Aperçu"
                  fill
                  className="object-cover"
                  sizes="100vw"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={removeImage}
                >
                  <X className="w-4 h-4" />
                </Button>
                {compressionInfo && (
                  <span className="absolute bottom-2 left-2 text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
                    {formatFileSize(compressionInfo.compressed)}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Importer une image
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute("capture", "environment");
                      fileInputRef.current.click();
                      fileInputRef.current.removeAttribute("capture");
                    }
                  }}
                >
                  <Camera className="w-4 h-4" />
                  Photo
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {productToEdit ? "Modification..." : "Création..."}
                </>
              ) : (
                <>
                  {productToEdit ? <Edit className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  {productToEdit ? "Modifier" : "Créer le produit"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddFarmProductModal;
