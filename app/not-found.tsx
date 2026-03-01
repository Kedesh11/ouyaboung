import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Page non trouvée",
  description: "La page demandée est introuvable. Retournez à l'accueil de Ouyaboung.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md px-4">
        <div className="relative">
          <h1 className="text-9xl font-bold text-primary/20">404</h1>
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold text-foreground">
            Page non trouvée
          </p>
        </div>

        <p className="text-muted-foreground">
          Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
        </p>

        <div className="flex gap-4 justify-center">
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à l'accueil
            </Button>
          </Link>
          <Link href="/">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              Accueil
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
