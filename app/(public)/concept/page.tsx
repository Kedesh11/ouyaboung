"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Leaf,
    TrendingDown,
    Wallet,
    Heart,
    Users,
    Award,
    Globe,
    Check,
    ArrowRight,
} from "lucide-react";

const benefits = {
    users: [
        { icon: Wallet, title: "Économies", description: "Jusqu'à 70% de réduction sur vos achats alimentaires" },
        { icon: Leaf, title: "Écologie", description: "Réduisez votre empreinte carbone à chaque repas" },
        { icon: Heart, title: "Découverte", description: "Explorez de nouveaux commerces et saveurs" },
        { icon: Award, title: "Impact", description: "Suivez votre contribution à la réduction du gaspillage" },
    ],
    merchants: [
        { icon: TrendingDown, title: "Réduction des pertes", description: "Transformez vos invendus en revenus supplémentaires" },
        { icon: Users, title: "Nouveaux clients", description: "Attirez une clientèle engagée et fidèle" },
        { icon: Globe, title: "Image positive", description: "Renforcez votre engagement environnemental" },
        { icon: Wallet, title: "Rentabilité", description: "Aucun coût fixe, seulement une commission sur les ventes" },
    ],
};

const comparison = [
    { feature: "Accès instantané aux invendus", ouyaboung: true, others: false },
    { feature: "Géolocalisation en temps réel", ouyaboung: true, others: true },
    { feature: "Paiement mobile money", ouyaboung: true, others: false },
    { feature: "Paniers gratuits solidaires", ouyaboung: true, others: false },
    { feature: "Statistiques d'impact", ouyaboung: true, others: false },
    { feature: "Support local 24/7", ouyaboung: true, others: false },
];

const Concept = () => {
    return (
        <div className="min-h-screen">
            <main className="pt-24 pb-12">
                {/* Hero Section */}
                <section className="py-16">
                    <div className="container mx-auto px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center max-w-3xl mx-auto mb-16"
                        >
                            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                                Ensemble contre le <span className="text-gradient">gaspillage alimentaire</span>
                            </h1>
                            <p className="text-lg text-muted-foreground mb-8">
                                Chaque jour, des tonnes de nourriture parfaitement consommable sont jetées.
                                ouyaboung connecte les commerces et les consommateurs pour donner une seconde vie à ces produits.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Link href="/search">
                                    <Button variant="hero" size="xl" className="gap-2">
                                        Trouver des invendus
                                        <ArrowRight className="w-5 h-5" />
                                    </Button>
                                </Link>
                                <Link href="/auth?role=merchant">
                                    <Button variant="outline" size="xl">
                                        Devenir partenaire
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>

                        {/* Stats */}
                        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                            {[
                                { value: "1/3", label: "de la nourriture produite est gaspillée dans le monde" },
                                { value: "150M", label: "de tonnes jetées chaque année en Afrique" },
                                { value: "20kg", label: "de nourriture gaspillée par personne par an" },
                            ].map((stat, index) => (
                                <motion.div
                                    key={stat.label}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 + index * 0.1 }}
                                >
                                    <Card className="text-center p-6">
                                        <CardContent className="p-0">
                                            <p className="text-4xl font-bold text-gradient mb-2">{stat.value}</p>
                                            <p className="text-sm text-muted-foreground">{stat.label}</p>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Benefits for Users */}
                <section className="py-16 bg-card/50">
                    <div className="container mx-auto px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-12"
                        >
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                                Avantages pour les <span className="text-gradient">utilisateurs</span>
                            </h2>
                        </motion.div>

                        <div className="grid md:grid-cols-4 gap-6">
                            {benefits.users.map((benefit, index) => (
                                <motion.div
                                    key={benefit.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <Card className="h-full text-center p-6">
                                        <CardContent className="p-0">
                                            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                                <benefit.icon className="w-7 h-7 text-primary" />
                                            </div>
                                            <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                                            <p className="text-sm text-muted-foreground">{benefit.description}</p>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Benefits for Merchants */}
                <section className="py-16">
                    <div className="container mx-auto px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-12"
                        >
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                                Avantages pour les <span className="text-gradient">commerçants</span>
                            </h2>
                        </motion.div>

                        <div className="grid md:grid-cols-4 gap-6">
                            {benefits.merchants.map((benefit, index) => (
                                <motion.div
                                    key={benefit.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <Card className="h-full text-center p-6">
                                        <CardContent className="p-0">
                                            <div className="w-14 h-14 bg-secondary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                                <benefit.icon className="w-7 h-7 text-secondary" />
                                            </div>
                                            <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                                            <p className="text-sm text-muted-foreground">{benefit.description}</p>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Environment Impact */}
                <section className="py-16 bg-primary text-primary-foreground">
                    <div className="container mx-auto px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center max-w-3xl mx-auto"
                        >
                            <Globe className="w-16 h-16 mx-auto mb-6 opacity-80" />
                            <h2 className="text-3xl md:text-4xl font-bold mb-6">
                                Pour l'environnement
                            </h2>
                            <p className="text-lg opacity-90 mb-8">
                                Le gaspillage alimentaire représente 8 à 10% des émissions mondiales de gaz à effet de serre.
                                En sauvant de la nourriture, vous contribuez directement à la lutte contre le changement climatique.
                            </p>
                            <div className="grid sm:grid-cols-3 gap-8">
                                <div>
                                    <p className="text-4xl font-bold mb-2">-60%</p>
                                    <p className="text-sm opacity-80">d'émissions CO₂</p>
                                </div>
                                <div>
                                    <p className="text-4xl font-bold mb-2">-70%</p>
                                    <p className="text-sm opacity-80">de déchets alimentaires</p>
                                </div>
                                <div>
                                    <p className="text-4xl font-bold mb-2">100%</p>
                                    <p className="text-sm opacity-80">impact positif</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* Comparison */}
                <section className="py-16">
                    <div className="container mx-auto px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-12"
                        >
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                                Pourquoi choisir <span className="text-gradient">ouyaboung</span> ?
                            </h2>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="max-w-2xl mx-auto"
                        >
                            <Card>
                                <CardContent className="p-0">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className="text-left p-4 font-medium text-foreground">Fonctionnalité</th>
                                                <th className="p-4 font-medium text-primary">ouyaboung</th>
                                                <th className="p-4 font-medium text-muted-foreground">Autres</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {comparison.map((row, index) => (
                                                <tr key={row.feature} className={index !== comparison.length - 1 ? "border-b border-border" : ""}>
                                                    <td className="p-4 text-foreground">{row.feature}</td>
                                                    <td className="p-4 text-center">
                                                        <Check className="w-5 h-5 text-primary mx-auto" />
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {row.others ? (
                                                            <Check className="w-5 h-5 text-muted-foreground mx-auto" />
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-16 bg-card/50">
                    <div className="container mx-auto px-4 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                                Prêt à faire la différence ?
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                                Rejoignez notre communauté et commencez à sauver de la nourriture dès aujourd'hui.
                            </p>
                            <Link href="/auth">
                                <Button variant="hero" size="xl" className="gap-2">
                                    Créer mon compte
                                    <ArrowRight className="w-5 h-5" />
                                </Button>
                            </Link>
                        </motion.div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Concept;
