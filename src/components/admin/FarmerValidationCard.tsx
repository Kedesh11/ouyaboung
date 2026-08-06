// ============================================
// Farmer Validation Card - Pending Farmer Display
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { FarmerRegistration } from "@/types/admin.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sprout, MapPin, Phone, Mail, Calendar, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface FarmerValidationCardProps {
  farmer: FarmerRegistration;
  onView: (farmer: FarmerRegistration) => void;
  onValidate: (farmer: FarmerRegistration) => void;
  onRefuse: (farmer: FarmerRegistration) => void;
}

const statusStyles = {
  pending: { label: 'En attente', variant: 'secondary' as const },
  validated: { label: 'Validé', variant: 'default' as const },
  refused: { label: 'Refusé', variant: 'destructive' as const },
};

const FarmerValidationCard = ({
  farmer,
  onView,
  onValidate,
  onRefuse,
}: FarmerValidationCardProps) => {
  const status = statusStyles[farmer.status];

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Sprout className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">
                    {farmer.farmName}
                  </h3>
                  <Badge variant={status.variant} className="text-xs">
                    {status.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {farmer.farmerType} • {farmer.ownerName}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{farmer.city}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{farmer.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{farmer.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  {format(farmer.createdAt, "d MMM yyyy", { locale: fr })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(farmer)}
              className="gap-1"
            >
              <Eye className="w-4 h-4" />
              Voir
            </Button>
            {farmer.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  onClick={() => onValidate(farmer)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Valider
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onRefuse(farmer)}
                >
                  Refuser
                </Button>
              </>
            )}
          </div>
        </div>

        {farmer.status === 'refused' && farmer.refusalReason && (
          <div className="mt-3 p-2 rounded-lg bg-destructive/10 text-sm text-destructive">
            <strong>Motif :</strong> {farmer.refusalReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FarmerValidationCard;
