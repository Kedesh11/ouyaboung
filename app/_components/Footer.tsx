"use client";

import Link from "next/link";
import { Leaf, Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Footer = () => {
    return (
        <footer className="bg-muted/30 border-t border-border mt-auto">
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand & Description */}
                    <div className="space-y-4">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                                <Leaf className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <span className="text-xl font-bold text-foreground">ouyaboung</span>
                        </Link>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            La plateforme anti-gaspillage qui connecte les commerçants locaux avec les consommateurs conscients.
                            Sauvez de la nourriture, économisez de l'argent et protégez la planète.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-foreground">Navigation</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="/search" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    Explorer les offres
                                </Link>
                            </li>
                            <li>
                                <Link href="/concept" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    Comment ça marche
                                </Link>
                            </li>
                            <li>
                                <Link href="/auth?role=merchant" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    Devenir partenaire
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Legal & Help */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-foreground">Informations</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link href="/legal/help" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    Centre d'aide
                                </Link>
                            </li>
                            <li>
                                <Link href="/legal/cgu" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    CGU & Mentions légales
                                </Link>
                            </li>
                            <li>
                                <Link href="/legal/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                    Politique de confidentialité
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-foreground">Restez informés</h3>
                        <p className="text-sm text-muted-foreground">
                            Recevez nos meilleures offres et astuces anti-gaspillage.
                        </p>
                        <div className="flex gap-2">
                            <Input placeholder="Votre email" type="email" className="bg-background" />
                            <Button size="sm">S'inscrire</Button>
                        </div>
                        {/* Social Links */}
                        <div className="flex items-center gap-4 pt-4">
                            <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                                <Facebook className="w-5 h-5" />
                            </Link>
                            <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                                <Instagram className="w-5 h-5" />
                            </Link>
                            <Link href="#" className="text-muted-foreground hover:text-primary transition-colors">
                                <Linkedin className="w-5 h-5" />
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} ouyaboung. Tous droits réservés.
                    </p>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-4 h-4" />
                            <span>contact@ouyaboung.fr</span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
