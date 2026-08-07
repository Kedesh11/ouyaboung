// ============================================
// Driver Validation Card - Pending Driver Display
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { DriverRegistration } from "@/types/admin.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, MapPin, Phone, Mail, Calendar, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface DriverValidationCardProps {
  driver: DriverRegistration;
  onView: (driver: DriverRegistration) => void;
  onValidate: (driver: DriverRegistration) => void;
  onRefuse: (driver: DriverRegistration) => void;
}

const statusStyles = {
  pending: { label: 'En attente', variant: 'secondary' as const },
  validated: { label: 'Validé', variant: 'default' as const },
  refused: { label: 'Refusé', variant: 'destructive' as const },
};

const DriverValidationCard = ({
  driver,
  onView,
  onValidate,
  onRefuse,
}: DriverValidationCardProps) => {
  const status = statusStyles[driver.status];

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">
                    {driver.fullName}
                  </h3>
                  <Badge variant={status.variant} className="text-xs">
                    {status.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {driver.vehicleType}{driver.plateNumber ? ` • ${driver.plateNumber}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{driver.city}{driver.deliveryZone ? ` • ${driver.deliveryZone}` : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{driver.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{driver.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  {format(driver.createdAt, "d MMM yyyy", { locale: fr })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(driver)}
              className="gap-1"
            >
              <Eye className="w-4 h-4" />
              Voir
            </Button>
            {driver.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  onClick={() => onValidate(driver)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Valider
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onRefuse(driver)}
                >
                  Refuser
                </Button>
              </>
            )}
          </div>
        </div>

        {driver.status === 'refused' && driver.refusalReason && (
          <div className="mt-3 p-2 rounded-lg bg-destructive/10 text-sm text-destructive">
            <strong>Motif :</strong> {driver.refusalReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DriverValidationCard;
