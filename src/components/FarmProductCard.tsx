// ============================================
// Farm Product Card - Public catalogue entry
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Package } from "lucide-react";
import type { FarmProduct } from "@/types";
import { formatPricePerUnit, getFarmProductCategoryName } from "@/services";

interface FarmProductCardProps {
  product: FarmProduct;
}

const FarmProductCard = ({ product }: FarmProductCardProps) => {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative h-36 bg-muted">
        <Image
          src={
            product.image_url ||
            "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=400&h=200&fit=crop"
          }
          alt={product.name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </div>
      <CardContent className="p-4 space-y-2">
        <div>
          <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
          <p className="text-xs text-muted-foreground">{getFarmProductCategoryName(product.category)}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-primary">
            {formatPricePerUnit(product.price_per_unit, product.unit)}
          </span>
          <Badge variant="outline" className="gap-1">
            <Package className="w-3 h-3" />
            {product.quantity_available} {product.unit}
          </Badge>
        </div>

        {(product.available_from || product.available_until) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>
              Disponible {product.available_from ? `du ${product.available_from}` : ""}
              {product.available_until ? ` au ${product.available_until}` : ""}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FarmProductCard;
