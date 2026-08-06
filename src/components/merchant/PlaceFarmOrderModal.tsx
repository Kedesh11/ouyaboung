// ============================================
// Place Farm Order Modal - Merchant orders a farmer's product
// ouyaboung Platform - Marché B2B commerçant <-> agriculteur
// ============================================

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import type { FarmProduct } from "@/types";
import { createFarmOrder } from "@/services";

interface PlaceFarmOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: FarmProduct | null;
  onOrderPlaced?: () => void;
}

const PlaceFarmOrderModal = ({ open, onOpenChange, product, onOrderPlaced }: PlaceFarmOrderModalProps) => {
  const [quantity, setQuantity] = useState(1);
  const [specialRequest, setSpecialRequest] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!product) return null;

  const total = quantity * product.price_per_unit;

  const handleClose = () => {
    setQuantity(1);
    setSpecialRequest("");
    setRequestedDate("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!quantity || quantity <= 0) {
      toast.error("Veuillez indiquer une quantité valide");
      return;
    }
    if (quantity > product.quantity_available) {
      toast.error(`Quantité indisponible (max ${product.quantity_available} ${product.unit})`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createFarmOrder({
        farm_product_id: product.id,
        quantity,
        special_request: specialRequest || undefined,
        requested_date: requestedDate || undefined,
      });

      if (result.success) {
        toast.success("Commande envoyée à l'agriculteur");
        onOrderPlaced?.();
        handleClose();
      } else {
        toast.error(result.error?.message || "Erreur lors de la commande");
      }
    } catch (error) {
      console.error("Error placing farm order:", error);
      toast.error("Une erreur est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            Commander « {product.name} »
          </DialogTitle>
          <DialogDescription>
            {product.price_per_unit.toLocaleString()} XAF / {product.unit} · {product.quantity_available} {product.unit} disponible(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantité ({product.unit}) *</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              max={product.quantity_available}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requested_date">Date souhaitée (optionnel)</Label>
            <Input
              id="requested_date"
              type="date"
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="special_request">Demande spéciale (optionnel)</Label>
            <Textarea
              id="special_request"
              placeholder="Ex: livraison avant midi, produits calibrés..."
              value={specialRequest}
              onChange={(e) => setSpecialRequest(e.target.value)}
            />
          </div>

          <div className="p-3 bg-primary/5 rounded-lg flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total estimé</span>
            <span className="font-bold text-primary">{total.toLocaleString()} XAF</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Envoi...
              </>
            ) : (
              "Envoyer la commande"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlaceFarmOrderModal;
