// ============================================
// Farmer Card - Public directory entry
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Sprout, CheckCircle2 } from "lucide-react";
import type { Farmer } from "@/types";
import { getFarmerTypeName } from "@/services/farmer.service";

interface FarmerCardProps {
  farmer: Farmer;
}

const FarmerCard = ({ farmer }: FarmerCardProps) => {
  return (
    <Link href={`/agriculteurs/${farmer.slug}`}>
      <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
        <CardContent className="p-4 flex items-start gap-4">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted flex-shrink-0 border border-border">
            {farmer.logo_url ? (
              <Image src={farmer.logo_url} alt={farmer.farm_name} fill className="object-cover" sizes="56px" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Sprout className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{farmer.farm_name}</h3>
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
            </div>
            <Badge variant="outline" className="mt-1 text-xs">
              {getFarmerTypeName(farmer.farmer_type)}
            </Badge>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{farmer.quartier}, {farmer.city}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{farmer.phone}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default FarmerCard;
