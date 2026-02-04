// ============================================
// Add Product Modal - Create new products or baskets
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  ShoppingBasket,
  Package,
  Clock,
  Image as ImageIcon,
  X,
  Upload,
  Camera,
  Loader2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import type { FoodCategory, CreateFoodItemInput, BasketItem, FoodItem } from "@/types";
import { formatPrice, getCategoryName } from "@/services";
import { createListing, updateListing } from "@/services/inventory.service";
import { compressImage, validateImageFile, formatFileSize, getBase64Size } from "@/utils/imageCompression";



interface AddProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductCreated?: () => void;
  merchantId: string;
  productToEdit?: FoodItem | null;
}

const categories: { value: FoodCategory; label: string }[] = [
  { value: "bread_pastry", label: "Pains & Viennoiseries" },
  { value: "prepared_meals", label: "Plats préparés" },
  { value: "fruits_vegetables", label: "Fruits & Légumes" },
  { value: "dairy", label: "Produits laitiers" },
  { value: "meat_fish", label: "Viandes & Poissons" },
  { value: "beverages", label: "Boissons" },
  { value: "snacks", label: "Snacks & Gourmandises" },
  { value: "mixed_basket", label: "Panier surprise" },
  { value: "other", label: "Autres" },
];

const AddProductModal = ({
  open,
  onOpenChange,
  onProductCreated,
  merchantId,
  productToEdit,
}: AddProductModalProps) => {
  const [mode, setMode] = useState<"single" | "basket">("single");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const basketFileInputRef = useRef<HTMLInputElement>(null);

  // Single product form
  const [productForm, setProductForm] = useState<CreateFoodItemInput>({
    name: "",
    description: "",
    category: "other",
    original_price: 0,
    discounted_price: 0,
    quantity_available: 1,
    pickup_start: "12:00",
    pickup_end: "14:00",
    expiry_date: "",
    image_url: "",
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [basketImagePreview, setBasketImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<{ original: number; compressed: number } | null>(null);

  // Basket mode
  const [basketItems, setBasketItems] = useState<BasketItem[]>([]);
  const [basketName, setBasketName] = useState("");
  const [basketDescription, setBasketDescription] = useState("");
  const [basketQuantity, setBasketQuantity] = useState(1);
  const [basketDiscount, setBasketDiscount] = useState(30);
  const [basketPickupStart, setBasketPickupStart] = useState("12:00");
  const [basketPickupEnd, setBasketPickupEnd] = useState("14:00");
  const [basketExpiryDate, setBasketExpiryDate] = useState("");

  // Temp item for basket
  const [tempItem, setTempItem] = useState<Partial<BasketItem>>({
    name: "",
    category: "other",
    originalPrice: 0,
    quantity: 1,
  });

  useEffect(() => {
    if (open && productToEdit) {
      if (productToEdit.category === "mixed_basket") {
        setMode("basket");
        setBasketName(productToEdit.name);
        setBasketDescription(productToEdit.description || "");
        setBasketQuantity(productToEdit.quantity_available);
        setBasketPickupStart(productToEdit.pickup_start);
        setBasketPickupEnd(productToEdit.pickup_end);
        setBasketExpiryDate(productToEdit.expiry_date ? new Date(productToEdit.expiry_date).toISOString().slice(0, 16) : "");
        setBasketImagePreview(productToEdit.image_url || null);
        if (productToEdit.contents) {
            setBasketItems(productToEdit.contents);
        }
      } else {
        setMode("single");
        setProductForm({
          name: productToEdit.name,
          description: productToEdit.description || "",
          category: productToEdit.category,
          original_price: productToEdit.original_price,
          discounted_price: productToEdit.discounted_price,
          quantity_available: productToEdit.quantity_available,
          pickup_start: productToEdit.pickup_start,
          pickup_end: productToEdit.pickup_end,
          expiry_date: productToEdit.expiry_date ? new Date(productToEdit.expiry_date).toISOString().slice(0, 16) : "",
          image_url: productToEdit.image_url || "",
        });
        setImagePreview(productToEdit.image_url || null);
      }
    } else if (open && !productToEdit) {
        resetForm();
    }
  }, [open, productToEdit]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "single" | "basket") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image
    const validation = validateImageFile(file, 10);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setIsCompressing(true);
    const originalSize = file.size;

    try {
      // Compress image
      const compressedDataUrl = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8,
        mimeType: 'image/jpeg',
      });

      const compressedSize = getBase64Size(compressedDataUrl);
      setCompressionInfo({ original: originalSize, compressed: compressedSize });

      if (target === "single") {
        setImagePreview(compressedDataUrl);
        setProductForm({ ...productForm, image_url: compressedDataUrl });
      } else {
        setBasketImagePreview(compressedDataUrl);
      }

      const savings = Math.round((1 - compressedSize / originalSize) * 100);
      toast.success(`Image compressée (${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}, -${savings}%)`);
    } catch (error) {
      console.error("Image compression error:", error);
      toast.error("Erreur lors de la compression de l'image");
    } finally {
      setIsCompressing(false);
    }
  };

  const removeImage = (target: "single" | "basket") => {
    if (target === "single") {
      setImagePreview(null);
      setProductForm({ ...productForm, image_url: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setBasketImagePreview(null);
      if (basketFileInputRef.current) basketFileInputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setProductForm({
      name: "",
      description: "",
      category: "other",
      original_price: 0,
      discounted_price: 0,
      quantity_available: 1,
      pickup_start: "12:00",
      pickup_end: "14:00",
      expiry_date: "",
      image_url: "",
    });
    setImagePreview(null);
    setBasketImagePreview(null);
    setBasketItems([]);
    setBasketName("");
    setBasketDescription("");
    setBasketQuantity(1);
    setBasketDiscount(30);
    setBasketExpiryDate("");
    setTempItem({ name: "", category: "other", originalPrice: 0, quantity: 1 });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (basketFileInputRef.current) basketFileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const addItemToBasket = () => {
    if (!tempItem.name || !tempItem.originalPrice) {
      toast.error("Veuillez remplir le nom et le prix");
      return;
    }

    const newItem: BasketItem = {
      id: Date.now().toString(),
      name: tempItem.name!,
      category: tempItem.category as FoodCategory,
      originalPrice: tempItem.originalPrice!,
      quantity: tempItem.quantity || 1,
    };

    setBasketItems([...basketItems, newItem]);
    setTempItem({ name: "", category: "other", originalPrice: 0, quantity: 1 });
    toast.success("Produit ajouté au panier");
  };

  const removeItemFromBasket = (id: string) => {
    setBasketItems(basketItems.filter((item) => item.id !== id));
  };

  const basketTotalOriginal = basketItems.reduce(
    (sum, item) => sum + item.originalPrice * item.quantity,
    0
  );

  const basketTotalDiscounted = Math.round(
    basketTotalOriginal * (1 - basketDiscount / 100)
  );

  // Helper to combine date and time for pickup window
  const combineDateAndTime = (timeStr: string) => {
    if (!timeStr) return new Date().toISOString();

    const today = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(today);
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  };

  const handleSubmitSingle = async () => {
    if (!productForm.name || !productForm.original_price) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    setIsSubmitting(true);
    console.log("Submitting single product...", productForm);

    try {
        let response;
        if (productToEdit) {
            response = await updateListing(productToEdit.id, {
                name: productForm.name,
                description: productForm.description,
                category: productForm.category,
                originalPrice: productForm.original_price,
                discountedPrice: productForm.discounted_price,
                quantity: productForm.quantity_available,
                pickupStart: combineDateAndTime(productForm.pickup_start),
                pickupEnd: combineDateAndTime(productForm.pickup_end),
                expiryDate: productForm.expiry_date,
                imageUrl: productForm.image_url,
            });
        } else {
            response = await createListing(merchantId, {
                name: productForm.name,
                description: productForm.description,
                category: productForm.category,
                originalPrice: productForm.original_price,
                discountedPrice: productForm.discounted_price,
                quantity: productForm.quantity_available,
                pickupStart: combineDateAndTime(productForm.pickup_start),
                pickupEnd: combineDateAndTime(productForm.pickup_end),
                expiryDate: productForm.expiry_date,
                imageUrl: productForm.image_url,
            });
        }

      console.log("Submit listing response:", response);

      if (response.success) {
        toast.success(productToEdit ? `Produit "${productForm.name}" modifié` : `Produit "${productForm.name}" créé`);
        onProductCreated?.();
        handleClose();
      } else {
        toast.error(response.error?.message || "Erreur lors de l'enregistrement du produit");
        console.error("API Error:", response.error);
      }
    } catch (error) {
      console.error("Error creating/updating product:", error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitBasket = async () => {
    if (!basketName) {
      toast.error("Veuillez donner un nom au panier");
      return;
    }
    if (basketItems.length < 2) {
      toast.error("Un panier doit contenir au moins 2 produits");
      return;
    }

    setIsSubmitting(true);
    console.log("Submitting basket...", { basketName, basketItems });

    try {
        let response;
        if (productToEdit) {
             response = await updateListing(productToEdit.id, {
                name: basketName,
                description: basketDescription,
                originalPrice: basketTotalOriginal,
                discountedPrice: basketTotalDiscounted,
                quantity: basketQuantity,
                pickupStart: combineDateAndTime(basketPickupStart),
                pickupEnd: combineDateAndTime(basketPickupEnd),
                expiryDate: basketExpiryDate,
                imageUrl: basketImagePreview || undefined,
                contents: basketItems,
            });
        } else {
             response = await createListing(merchantId, {
                name: basketName,
                description: basketDescription,
                category: "mixed_basket",
                originalPrice: basketTotalOriginal,
                discountedPrice: basketTotalDiscounted,
                quantity: basketQuantity,
                pickupStart: combineDateAndTime(basketPickupStart),
                pickupEnd: combineDateAndTime(basketPickupEnd),
                expiryDate: basketExpiryDate,
                imageUrl: basketImagePreview || undefined,
                contents: basketItems,
            });
        }

      console.log("Submit basket response:", response);

      if (response.success) {
        toast.success(productToEdit ? `Panier "${basketName}" modifié` : `Panier "${basketName}" créé`);
        onProductCreated?.();
        handleClose();
      } else {
        toast.error(response.error?.message || "Erreur lors de l'enregistrement du panier");
        console.error("API Error:", response.error);
      }
    } catch (error) {
      console.error("Error creating/updating basket:", error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  const discountPercentage =
    productForm.original_price > 0
      ? Math.round(
        ((productForm.original_price - productForm.discounted_price) /
          productForm.original_price) *
        100
      )
      : 0;

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
             {productToEdit ? "Modifiez les informations de votre produit" : "Créez un produit individuel ou un panier composé de plusieurs articles"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => {
            if (!productToEdit) setMode(v as "single" | "basket");
        }}>
          {!productToEdit && (
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="single" className="gap-2">
                  <Package className="w-4 h-4" />
                  Produit unique
                </TabsTrigger>
                <TabsTrigger value="basket" className="gap-2">
                  <ShoppingBasket className="w-4 h-4" />
                  Créer un panier
                </TabsTrigger>
              </TabsList>
          )}

          {/* Single Product Tab */}
          <TabsContent value="single" className="space-y-4 mt-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du produit *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Croissant au beurre"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm({ ...productForm, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie *</Label>
                <Select
                  value={productForm.category}
                  onValueChange={(v) =>
                    setProductForm({ ...productForm, category: v as FoodCategory })
                  }
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
                value={productForm.description}
                onChange={(e) =>
                  setProductForm({ ...productForm, description: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="original_price">Prix original (XAF) *</Label>
                <Input
                  id="original_price"
                  type="number"
                  min="0"
                  placeholder="5000"
                  value={productForm.original_price || ""}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      original_price: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discounted_price">Prix réduit (XAF) *</Label>
                <Input
                  id="discounted_price"
                  type="number"
                  min="0"
                  placeholder="2500"
                  value={productForm.discounted_price || ""}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      discounted_price: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Aperçu de la réduction</Label>
                <div className="h-10 flex items-center gap-2 p-2 bg-muted/30 rounded-md border border-border/50">
                  <Badge
                    variant={discountPercentage >= 30 ? "default" : "secondary"}
                    className="text-sm"
                  >
                    -{discountPercentage}%
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Le client économise {formatPrice(productForm.original_price - productForm.discounted_price)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantité disponible *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={productForm.quantity_available}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      quantity_available: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry_date">Date de péremption (Optionnel)</Label>
                <Input
                  id="expiry_date"
                  type="datetime-local"
                  value={productForm.expiry_date || ""}
                  onChange={(e) =>
                    setProductForm({ ...productForm, expiry_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pickup_start">Début récupération *</Label>
                <Input
                  id="pickup_start"
                  type="time"
                  value={productForm.pickup_start}
                  onChange={(e) =>
                    setProductForm({ ...productForm, pickup_start: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pickup_end">Fin récupération *</Label>
                <Input
                  id="pickup_end"
                  type="time"
                  value={productForm.pickup_end}
                  onChange={(e) =>
                    setProductForm({ ...productForm, pickup_end: e.target.value })
                  }
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
                onChange={(e) => handleImageUpload(e, "single")}
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
                    onClick={() => removeImage("single")}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  {compressionInfo && (
                    <Badge className="absolute bottom-2 left-2 text-xs" variant="secondary">
                      {formatFileSize(compressionInfo.compressed)}
                    </Badge>
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
              <Button onClick={handleSubmitSingle} disabled={isSubmitting}>
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
          </TabsContent>

          {/* Basket Tab */}
          <TabsContent value="basket" className="space-y-4 mt-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="basket_name">Nom du panier *</Label>
                <Input
                  id="basket_name"
                  placeholder="Ex: Panier surprise du jour"
                  value={basketName}
                  onChange={(e) => setBasketName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basket_quantity">Nombre de paniers *</Label>
                <Input
                  id="basket_quantity"
                  type="number"
                  min="1"
                  value={basketQuantity}
                  onChange={(e) => setBasketQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="basket_description">Description du panier</Label>
              <Textarea
                id="basket_description"
                placeholder="Décrivez le contenu de votre panier..."
                value={basketDescription}
                onChange={(e) => setBasketDescription(e.target.value)}
              />
            </div>

            {/* Basket Image Upload */}
            <div className="space-y-2">
              <Label>Image du panier</Label>
              <input
                ref={basketFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(e, "basket")}
              />
              {basketImagePreview ? (
                <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                  <Image
                    src={basketImagePreview}
                    alt="Aperçu du panier"
                    fill
                    className="object-cover"
                    sizes="100vw"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={() => removeImage("basket")}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => basketFileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Importer une image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      if (basketFileInputRef.current) {
                        basketFileInputRef.current.setAttribute("capture", "environment");
                        basketFileInputRef.current.click();
                        basketFileInputRef.current.removeAttribute("capture");
                      }
                    }}
                  >
                    <Camera className="w-4 h-4" />
                    Photo
                  </Button>
                </div>
              )}
            </div>

            {/* Add items to basket */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-medium">Ajouter un article au panier</Label>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Input
                    placeholder="Nom de l'article"
                    value={tempItem.name}
                    onChange={(e) =>
                      setTempItem({ ...tempItem, name: e.target.value })
                    }
                  />
                  <Select
                    value={tempItem.category}
                    onValueChange={(v) =>
                      setTempItem({ ...tempItem, category: v as FoodCategory })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Prix (XAF)"
                    value={tempItem.originalPrice || ""}
                    onChange={(e) =>
                      setTempItem({
                        ...tempItem,
                        originalPrice: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <Button onClick={addItemToBasket} className="gap-1">
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Basket items list */}
            <AnimatePresence>
              {basketItems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label className="text-sm font-medium flex items-center gap-2">
                    Articles dans le panier ({basketItems.length})
                    {basketItems.length < 2 && (
                      <Badge variant="secondary" className="text-xs">
                        Minimum 2 produits requis
                      </Badge>
                    )}
                  </Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {basketItems.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {getCategoryName(item.category)} • x{item.quantity}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">
                            {formatPrice(item.originalPrice)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeItemFromBasket(item.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pricing & Pickup */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="basket_discount">Réduction (%)</Label>
                <Input
                  id="basket_discount"
                  type="number"
                  min="10"
                  max="70"
                  value={basketDiscount}
                  onChange={(e) =>
                    setBasketDiscount(parseInt(e.target.value) || 30)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basket_expiry">Date de péremption</Label>
                <Input
                  id="basket_expiry"
                  type="datetime-local"
                  value={basketExpiryDate}
                  onChange={(e) => setBasketExpiryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basket_pickup_start">Début récupération</Label>
                <Input
                  id="basket_pickup_start"
                  type="time"
                  value={basketPickupStart}
                  onChange={(e) => setBasketPickupStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basket_pickup_end">Fin récupération</Label>
                <Input
                  id="basket_pickup_end"
                  type="time"
                  value={basketPickupEnd}
                  onChange={(e) => setBasketPickupEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Basket Summary */}
            {basketItems.length > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Prix total original
                      </p>
                      <p className="font-medium line-through text-muted-foreground">
                        {formatPrice(basketTotalOriginal)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        Prix de vente
                      </p>
                      <p className="text-xl font-bold text-primary">
                        {formatPrice(basketTotalDiscounted)}
                      </p>
                    </div>
                    <Badge className="text-lg px-3 py-1">-{basketDiscount}%</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button
                onClick={handleSubmitBasket}
                disabled={basketItems.length < 2 || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {productToEdit ? "Modification..." : "Création..."}
                  </>
                ) : (
                  <>
                    {productToEdit ? <Edit className="w-4 h-4 mr-2" /> : <ShoppingBasket className="w-4 h-4 mr-2" />}
                    {productToEdit ? "Modifier" : <>{ "Créer le panier (" + basketItems.length + " articles)" }</>}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AddProductModal;
