"use client";

// ============================================
// Merchant Help Page - Support & FAQ
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

import { Mail, Phone, MessageCircle, FileText } from "lucide-react";

const MerchantHelpPage = () => {
    const faqs = [
        {
            question: "Comment ajouter un nouveau produit ?",
            answer: "Allez dans l'onglet 'Mes produits', cliquez sur le bouton 'Nouveau produit', remplissez les informations requises (nom, prix, quantité, date de récupération) et ajoutez une photo. Une fois validé, votre produit sera visible par les clients."
        },
        {
            question: "Comment fonctionne le système de réservation ?",
            answer: "Lorsqu'un client réserve un panier, vous recevez une notification. La commande apparaît dans l'onglet 'Réservations' avec le statut 'En attente'. Lorsque le client vient récupérer sa commande, demandez-lui son code de retrait et marquez la commande comme 'Récupérée'."
        },
        {
            question: "Quand suis-je payé ?",
            answer: "Les paiements sont effectués chaque semaine par virement bancaire ou mobile money pour toutes les commandes validées et récupérées."
        },
        {
            question: "Puis-je modifier mes horaires d'ouverture ?",
            answer: "Oui, vous pouvez modifier vos horaires d'ouverture à tout moment dans la section 'Mon commerce' accessible depuis le menu latéral ou les paramètres."
        }
    ];

    return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Aide & Support</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Questions fréquentes et contact
        </p>
      </div>
            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Questions Fréquentes (FAQ)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible className="w-full">
                                {faqs.map((faq, index) => (
                                    <AccordionItem key={index} value={`item-${index}`}>
                                        <AccordionTrigger>{faq.question}</AccordionTrigger>
                                        <AccordionContent>{faq.answer}</AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Guides et Tutoriels</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-2">
                                <FileText className="w-6 h-6 text-primary" />
                                <div className="text-left">
                                    <span className="font-semibold block">Guide de démarrage</span>
                                    <span className="text-xs text-muted-foreground">Apprenez les bases de la plateforme</span>
                                </div>
                            </Button>
                            <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-2">
                                <FileText className="w-6 h-6 text-primary" />
                                <div className="text-left">
                                    <span className="font-semibold block">Bonnes pratiques</span>
                                    <span className="text-xs text-muted-foreground">Optimisez vos ventes anti-gaspi</span>
                                </div>
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Contactez-nous</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Phone className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Téléphone</p>
                                    <p className="text-sm text-muted-foreground">+241 01 23 45 67</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Mail className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Email</p>
                                    <p className="text-sm text-muted-foreground">support@ouyaboung.ga</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <MessageCircle className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">WhatsApp</p>
                                    <p className="text-sm text-muted-foreground">+241 07 00 00 00</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
    </div>
    );
};

export default MerchantHelpPage;
