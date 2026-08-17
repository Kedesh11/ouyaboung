"use client";

import Link from "next/link";
import { Leaf, Instagram, Twitter, Facebook, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Footer = () => {
  return (
    <footer className="bg-card border-t border-border mt-20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">ouyaboung</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ensemble, luttons contre le gaspillage alimentaire. Chaque repas sauvé compte.
            </p>
            <div className="flex gap-3 mt-4">
              <a href="#" className="w-9 h-9 rounded-full bg-accent flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-accent flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-accent flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Navigation</h4>
            <ul className="space-y-2">
              <li><Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">Accueil</Link></li>
              <li><Link href="/search" className="text-sm text-muted-foreground hover:text-primary transition-colors">Trouver des invendus</Link></li>
              <li><Link href="/concept" className="text-sm text-muted-foreground hover:text-primary transition-colors">Comment ça marche</Link></li>
              <li><Link href="/agriculteurs" className="text-sm text-muted-foreground hover:text-primary transition-colors">Répertoire des agriculteurs</Link></li>
              <li><Link href="/auth?role=merchant" className="text-sm text-muted-foreground hover:text-primary transition-colors">Devenir partenaire</Link></li>
              <li><Link href="/farmer/register" className="text-sm text-muted-foreground hover:text-primary transition-colors">Devenir agriculteur partenaire</Link></li>
              <li><Link href="/driver/register" className="text-sm text-muted-foreground hover:text-primary transition-colors">Devenir chauffeur partenaire</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Légal</h4>
            <ul className="space-y-2">
              <li><Link href="/legal/cgu" className="text-sm text-muted-foreground hover:text-primary transition-colors">Conditions d'utilisation</Link></li>
              <li><Link href="/legal/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">Politique de confidentialité</Link></li>
              <li><Link href="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">FAQ</Link></li>
              <li><Link href="/legal/help" className="text-sm text-muted-foreground hover:text-primary transition-colors">Centre d'aide</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4 text-primary" />
                oyaboug@gmail.com
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4 text-primary" />
                077 17 28 20
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary mt-0.5" />
                Libreville, Gabon
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Restez informés</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Recevez nos meilleures offres et astuces anti-gaspillage.
            </p>
            <div className="flex gap-2">
              <Input placeholder="Votre email" type="email" className="bg-background" />
              <Button size="sm">S&apos;inscrire</Button>
            </div>
          </div>
        </div>

        <hr className="border-border my-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ouyaboung. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
