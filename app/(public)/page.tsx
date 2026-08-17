"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MapPin, Store, Sprout, Bike, ChevronDown } from "lucide-react";
import { PersonalizedBanner } from "@/components/analytics/PersonalizedBanner";

const partnerLinks = [
    { href: "/auth?role=merchant", label: "Commerçant", icon: Store },
    { href: "/farmer/register", label: "Agriculteur", icon: Sprout },
    { href: "/driver/register", label: "Chauffeur", icon: Bike },
];

export default function Home() {
    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="pt-20 pb-16 md:pt-36 md:pb-24">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <div>
                            <h1 className="text-3xl md:text-6xl font-bold text-foreground leading-tight mb-6">
                                Sauvez de la nourriture,{" "}
                                <span className="text-gradient">faites des économies</span>
                            </h1>
                            <p className="text-base md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                                Récupérez des invendus de qualité à petit prix près de chez vous.
                                Ensemble, luttons contre le gaspillage alimentaire.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/search">
                                <Button variant="default" size="lg" className="gap-2 w-full sm:w-auto h-12 px-8 text-lg">
                                    <MapPin className="w-5 h-5" />
                                    Trouver des invendus
                                </Button>
                            </Link>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto h-12 px-8 text-lg">
                                        Devenir partenaire
                                        <ChevronDown className="w-5 h-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center">
                                    {partnerLinks.map(({ href, label, icon: Icon }) => (
                                        <DropdownMenuItem key={href} asChild>
                                            <Link href={href} className="gap-2 cursor-pointer">
                                                <Icon className="w-4 h-4" />
                                                {label}
                                            </Link>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="mx-auto mt-6 max-w-2xl">
                            <PersonalizedBanner />
                        </div>

                        {/* <p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="text-sm text-muted-foreground mt-6"
                        >
                            Déjà +1800 commerces partenaires • +89 000 utilisateurs actifs
                        </p> */}
                    </div>
                </div>
            </section>
        </div>
    );
}
