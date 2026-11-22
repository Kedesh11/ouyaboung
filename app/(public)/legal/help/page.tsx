"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle, Mail, Phone, FileQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { SUPPORT_EMAIL } from "@/lib/config";
const HelpCenter = () => {
  const faqs = [
    { q: "Comment réserver un panier ?", a: "Parcourez les offres disponibles, sélectionnez un panier et procédez au paiement. Un QR code vous sera envoyé pour la récupération." },
    { q: "Comment récupérer ma commande ?", a: "Présentez votre QR code au commerçant pendant les heures de récupération indiquées." },
    { q: "Puis-je annuler une commande ?", a: "Les commandes payées ne peuvent pas être annulées. Les réservations non payées expirent automatiquement." },
    { q: "Comment devenir commerçant partenaire ?", a: "Inscrivez-vous en tant que commerçant et complétez votre profil. Notre équipe validera votre compte." },
  ];

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-8">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>

        <h1 className="text-3xl font-bold mb-8">Centre d'aide</h1>

        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <Mail className="w-8 h-8 mx-auto text-primary mb-2" />
              <CardTitle className="text-lg">Email</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-3">{SUPPORT_EMAIL}</p>
              <Button variant="outline" size="sm">Envoyer un email</Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <Phone className="w-8 h-8 mx-auto text-primary mb-2" />
              <CardTitle className="text-lg">Téléphone</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-3">+241 XX XX XX XX</p>
              <Button variant="outline" size="sm">Appeler</Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <MessageCircle className="w-8 h-8 mx-auto text-primary mb-2" />
              <CardTitle className="text-lg">Chat</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-3">Réponse rapide</p>
              <Button variant="outline" size="sm">Démarrer un chat</Button>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <FileQuestion className="w-6 h-6" /> Questions fréquentes
        </h2>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

export default HelpCenter;
