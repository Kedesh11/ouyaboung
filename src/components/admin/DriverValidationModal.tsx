// ============================================
// Driver Validation Modal - Validation/Refusal Dialog
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { useState } from "react";
import { DriverRegistration } from "@/types/admin.types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Truck,
  MapPin,
  Phone,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface DriverValidationModalProps {
  driver: DriverRegistration | null;
  mode: 'view' | 'validate' | 'refuse';
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  isLoading?: boolean;
}

const DriverValidationModal = ({
  driver,
  mode,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: DriverValidationModalProps) => {
  const [refusalReason, setRefusalReason] = useState("");

  if (!driver) return null;

  const handleConfirm = () => {
    if (mode === 'refuse' && !refusalReason.trim()) {
      return;
    }
    onConfirm(mode === 'refuse' ? refusalReason : undefined);
    setRefusalReason("");
  };

  const handleClose = () => {
    setRefusalReason("");
    onClose();
  };

  const getTitle = () => {
    switch (mode) {
      case 'validate':
        return 'Valider le chauffeur';
      case 'refuse':
        return 'Refuser le chauffeur';
      default:
        return 'Détails du chauffeur';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'validate':
        return 'Confirmez-vous la validation de ce chauffeur ?';
      case 'refuse':
        return 'Veuillez indiquer le motif du refus.';
      default:
        return 'Informations complètes sur le chauffeur.';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'validate' && <CheckCircle className="w-5 h-5 text-green-600" />}
            {mode === 'refuse' && <XCircle className="w-5 h-5 text-destructive" />}
            {mode === 'view' && <Truck className="w-5 h-5 text-primary" />}
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Truck className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">
                {driver.fullName}
              </h3>
              <p className="text-sm text-muted-foreground">
                {driver.vehicleType}{driver.plateNumber ? ` • ${driver.plateNumber}` : ''}
              </p>
            </div>
            <Badge
              variant={driver.status === 'pending' ? 'secondary' :
                       driver.status === 'validated' ? 'default' : 'destructive'}
              className="ml-auto"
            >
              {driver.status === 'pending' ? 'En attente' :
               driver.status === 'validated' ? 'Validé' : 'Refusé'}
            </Badge>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-medium text-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Contact
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  {driver.email}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  {driver.phone}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Zone de livraison
              </h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{driver.city}</p>
                {driver.deliveryZone && <p>{driver.deliveryZone}</p>}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date d'inscription
              </h4>
              <p className="text-sm text-muted-foreground">
                {format(driver.createdAt, "d MMMM yyyy 'à' HH:mm", { locale: fr })}
              </p>
            </div>
          </div>

          {mode === 'refuse' && (
            <div className="space-y-2">
              <Label htmlFor="refusal-reason" className="text-destructive">
                Motif du refus *
              </Label>
              <Textarea
                id="refusal-reason"
                placeholder="Indiquez le motif du refus (obligatoire)..."
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                className="min-h-[100px] border-destructive/50 focus:border-destructive"
              />
              {!refusalReason.trim() && (
                <p className="text-xs text-destructive">
                  Le motif du refus est obligatoire
                </p>
              )}
            </div>
          )}

          {driver.status === 'refused' && driver.refusalReason && mode === 'view' && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <h4 className="font-medium text-destructive mb-1">Motif du refus</h4>
              <p className="text-sm text-destructive/80">{driver.refusalReason}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {mode === 'view' ? 'Fermer' : 'Annuler'}
          </Button>

          {mode === 'validate' && (
            <Button
              onClick={handleConfirm}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isLoading ? 'Validation...' : 'Confirmer la validation'}
            </Button>
          )}

          {mode === 'refuse' && (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={isLoading || !refusalReason.trim()}
            >
              {isLoading ? 'Refus...' : 'Confirmer le refus'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DriverValidationModal;
