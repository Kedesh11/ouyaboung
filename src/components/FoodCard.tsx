import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Store, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export interface FoodItem {
  id: string;
  name: string;
  description: string;
  originalPrice: number;
  discountedPrice: number;
  image: string;
  merchant: {
    name: string;
    type: string;
    distance: string;
    slug: string;
  };
  slug: string;
  pickupTime: string;
  quantity: number;
  badges: ("bio" | "lastItems" | "free")[];
}

interface FoodCardProps {
  item: FoodItem;
  onReserve?: () => void;
  reservedCount?: number;
  isReserving?: boolean;
}

const FoodCard = ({ item, onReserve, reservedCount = 0, isReserving = false }: FoodCardProps) => {
  const discount = Math.round((1 - item.discountedPrice / item.originalPrice) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card hover className="overflow-hidden group">
        {/* Image */}
        <div className="relative h-40 overflow-hidden">
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {item.badges.includes("bio") && <Badge variant="bio">Bio</Badge>}
            {item.badges.includes("lastItems") && <Badge variant="lastItems">Dernières pièces</Badge>}
            {item.badges.includes("free") && <Badge variant="free">Gratuit</Badge>}
            {reservedCount > 0 && <Badge className="bg-primary/90 text-primary-foreground">Déjà réservé x{reservedCount}</Badge>}
          </div>
          <div className="absolute top-3 right-3 bg-secondary text-secondary-foreground text-sm font-bold px-2 py-1 rounded-lg">
            -{discount}%
          </div>
        </div>

        <CardContent className="p-4">
          {/* Merchant info */}
          <Link
            href={`/m/${item.merchant.slug}`}
            className="flex items-center gap-2 text-xs text-muted-foreground mb-2 hover:text-primary transition-colors cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <Store className="w-3 h-3" />
            <span>{item.merchant.name}</span>
            <span>•</span>
            <span>{item.merchant.type}</span>
          </Link>

          {/* Name & description */}
          <Link href={`/p/${item.slug}`} className="block group/link">
            <h3 className="font-semibold text-foreground mb-1 line-clamp-1 group-hover/link:text-primary transition-colors">{item.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
          </Link>

          {/* Price */}
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-lg font-bold text-primary">{item.discountedPrice.toLocaleString()} XAF</span>
            <span className="text-sm text-muted-foreground line-through">{item.originalPrice.toLocaleString()} XAF</span>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {item.merchant.distance}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.pickupTime}
            </div>
          </div>
        </CardContent>

        {item.quantity > 0 && onReserve && (
          <CardFooter className="p-4 pt-0">
            <Button onClick={onReserve} className="w-full" size="sm" disabled={isReserving}>
              {isReserving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Réservation...
                </>
              ) : (
                `Réserver (${item.quantity} restant${item.quantity > 1 ? "s" : ""})`
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </motion.div>
  );
};

export default FoodCard;
