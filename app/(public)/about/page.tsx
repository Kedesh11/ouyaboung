"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import ImpactStats from "@/components/ImpactStats";
import HowItWorks from "@/components/HowItWorks";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import { ArrowRight } from "lucide-react";

export default function About() {
    return (
        <div className="min-h-screen pt-20">
            <ImpactStats />
            <HowItWorks />
            <Testimonials />
            <FAQ />

            {/* CTA Section */}
            <section className="py-20 bg-primary">
                <div className="container mx-auto px-4 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                            Prêt à sauver de la nourriture ?
                        </h2>
                        <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
                            Rejoignez notre communauté et commencez à faire la différence dès aujourd'hui.
                        </p>
                        <Link href="/auth">
                            <Button variant="secondary" size="lg" className="gap-2 h-12 px-8 text-lg">
                                Créer mon compte gratuit
                                <ArrowRight className="w-5 h-5" />
                            </Button>
                        </Link>
                    </motion.div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
