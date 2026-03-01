"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
    HelpCircle,
    MessageCircle,
    Mail,
    Phone,
    FileText,
    ExternalLink,
    Search,
    Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { contactSupport, getAuthUser } from "@/services";

const faqs = [
    {
        question: "Comment fonctionne ouyaboug ?",
        answer: "ouyaboug vous permet de réserver des invendus alimentaires à prix réduit chez des commerçants partenaires. Vous réservez en ligne et récupérez votre commande directement en magasin aux horaires indiqués."
    },
    {
        question: "Comment réserver un panier ?",
        answer: "Parcourez les offres disponibles, sélectionnez celle qui vous intéresse, choisissez votre créneau de récupération et confirmez votre réservation. Vous recevrez une confirmation avec un code à présenter au commerçant."
    },
    {
        question: "Comment annuler une réservation ?",
        answer: "Vous pouvez annuler une réservation depuis la page 'Mes réservations' jusqu'à 2 heures avant l'heure de récupération prévue. Au-delà, veuillez contacter directement le commerçant."
    },
    {
        question: "Que contiennent les paniers surprise ?",
        answer: "Le contenu des paniers surprise varie selon les invendus du jour. C'est une excellente façon de découvrir de nouveaux produits tout en luttant contre le gaspillage ! La catégorie (boulangerie, restaurant, etc.) vous donne une indication générale."
    },
    {
        question: "Comment devenir commerçant partenaire ?",
        answer: "Rendez-vous sur la page 'Devenir partenaire' pour remplir le formulaire d'inscription. Notre équipe examinera votre dossier et vous contactera sous 48h."
    },
    {
        question: "Comment fonctionne le paiement ?",
        answer: "Le paiement s'effectue directement chez le commerçant lors de la récupération de votre commande. Présentez votre code de réservation et payez en espèces ou par mobile money selon les options proposées."
    },
    {
        question: "Que faire si je ne peux pas récupérer ma commande ?",
        answer: "Annulez votre réservation dès que possible pour permettre à d'autres utilisateurs d'en profiter. Si vous ne vous présentez pas sans annuler, cela pourrait affecter votre réputation sur la plateforme."
    },
    {
        question: "Comment sont calculés mes impacts environnementaux ?",
        answer: "Nous utilisons une base de 0,5 kg de nourriture sauvée par repas. Avec les ratios FAO sur le gaspillage alimentaire (3,3 Gt CO₂e et 250 km³ d'eau pour 1,3 Gt d'aliments), cela correspond à environ 1,27 kg de CO₂ évités et 96 litres d'eau économisés par repas."
    },
];

export default function HelpPage() {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [contactForm, setContactForm] = useState({
        subject: "",
        message: "",
    });

    const filteredFaqs = faqs.filter(
        (faq) =>
            faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Get current user ID (optional, can be anonymous if API supported it, but we require auth)
            const { data: authData } = await getAuthUser();
            const userId = authData?.user?.id;

            if (!userId) {
                toast({
                    title: "Connexion requise",
                    description: "Vous devez être connecté pour envoyer un message.",
                    variant: "destructive",
                });
                setIsSubmitting(false);
                return;
            }

            const response = await contactSupport(
                userId,
                contactForm.subject,
                contactForm.message
            );

            if (response.success) {
                toast({
                    title: "Message envoyé",
                    description: "Notre équipe vous répondra dans les plus brefs délais.",
                });
                setContactForm({ subject: "", message: "" });
            } else {
                toast({
                    title: "Erreur",
                    description: response.error?.message || "Une erreur est survenue lors de l'envoi du message.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Erreur critique",
                description: "Impossible d'envoyer le message. Veuillez réessayer plus tard.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Aide & Support</h1>
                <p className="text-muted-foreground">Comment pouvons-nous vous aider ?</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* FAQ Section */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Search */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher dans la FAQ..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* FAQ List */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <HelpCircle className="h-5 w-5" />
                                Questions fréquentes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {filteredFaqs.length === 0 ? (
                                <div className="text-center py-8">
                                    <HelpCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="font-semibold mb-2">Aucun résultat</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Essayez avec d'autres mots-clés ou contactez-nous directement.
                                    </p>
                                </div>
                            ) : (
                                <Accordion type="single" collapsible className="w-full">
                                    {filteredFaqs.map((faq, index) => (
                                        <AccordionItem key={index} value={`item-${index}`}>
                                            <AccordionTrigger className="text-left">
                                                {faq.question}
                                            </AccordionTrigger>
                                            <AccordionContent className="text-muted-foreground">
                                                {faq.answer}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            )}
                        </CardContent>
                    </Card>

                    {/* Contact Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <MessageCircle className="h-5 w-5" />
                                Nous contacter
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="subject">Sujet</Label>
                                    <Input
                                        id="subject"
                                        placeholder="De quoi avez-vous besoin ?"
                                        value={contactForm.subject}
                                        onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                                        required
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="message">Message</Label>
                                    <Textarea
                                        id="message"
                                        placeholder="Décrivez votre demande en détail..."
                                        rows={5}
                                        value={contactForm.message}
                                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                                        required
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Envoi en cours...
                                        </>
                                    ) : (
                                        "Envoyer le message"
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Contact Info Sidebar */}
                <div className="space-y-6">
                    {/* Quick Contact */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Contact rapide</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <a
                                href="mailto:support@oyaboug.com"
                                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                            >
                                <div className="p-2 rounded-full bg-primary/10">
                                    <Mail className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Email</p>
                                    <p className="text-xs text-muted-foreground">support@oyaboug.com</p>
                                </div>
                            </a>

                            <a
                                href="tel:+24177000000"
                                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                            >
                                <div className="p-2 rounded-full bg-green-500/10">
                                    <Phone className="h-5 w-5 text-green-500" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Téléphone</p>
                                    <p className="text-xs text-muted-foreground">+241 77 00 00 00</p>
                                </div>
                            </a>

                            <div className="text-xs text-muted-foreground text-center pt-2">
                                Disponible du lundi au vendredi
                                <br />
                                9h00 - 18h00
                            </div>
                        </CardContent>
                    </Card>

                    {/* Resources */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Ressources</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button variant="outline" className="w-full justify-start" asChild>
                                <Link href="/cgu">
                                    <FileText className="h-4 w-4 mr-2" />
                                    Conditions d'utilisation
                                    <ExternalLink className="h-3 w-3 ml-auto" />
                                </Link>
                            </Button>
                            <Button variant="outline" className="w-full justify-start" asChild>
                                <Link href="/privacy">
                                    <FileText className="h-4 w-4 mr-2" />
                                    Politique de confidentialité
                                    <ExternalLink className="h-3 w-3 ml-auto" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Tips */}
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-4">
                            <h4 className="font-semibold text-sm mb-2">💡 Astuce</h4>
                            <p className="text-xs text-muted-foreground">
                                Activez les notifications pour être alerté des nouvelles offres
                                près de chez vous et ne manquer aucune bonne affaire !
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// Helper to fix Link import
import Link from "next/link";
