"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MapPin, Store } from "lucide-react";

export default function Home() {
    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="pt-20 pb-16 md:pt-36 md:pb-24">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <h1 className="text-3xl md:text-6xl font-bold text-foreground leading-tight mb-6">
                                Sauvez de la nourriture,{" "}
                                <span className="text-gradient">faites des économies</span>
                            </h1>
                            <p className="text-base md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                                Récupérez des invendus de qualité à petit prix près de chez vous.
                                Ensemble, luttons contre le gaspillage alimentaire.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="flex flex-col sm:flex-row gap-4 justify-center"
                        >
                            <Link href="/search">
                                <Button variant="default" size="lg" className="gap-2 w-full sm:w-auto h-12 px-8 text-lg">
                                    <MapPin className="w-5 h-5" />
                                    Trouver des invendus
                                </Button>
                            </Link>
                            <Link href="/auth?role=merchant">
                                <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto h-12 px-8 text-lg">
                                    <Store className="w-5 h-5" />
                                    Je suis commerçant
                                </Button>
                            </Link>
                        </motion.div>

                        {/* <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="text-sm text-muted-foreground mt-6"
                        >
                            Déjà +1800 commerces partenaires • +89 000 utilisateurs actifs
                        </motion.p> */}
                    </div>
                </div>
            </section>
        </div>
    );
}
