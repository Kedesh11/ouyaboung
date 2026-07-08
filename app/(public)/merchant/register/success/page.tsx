"use client";

// ============================================
// Merchant Registration Success Page
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, Mail, ArrowRight, Home } from "lucide-react";

const MerchantRegisterSuccessPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>

            <h1 className="text-3xl font-bold text-foreground mb-4">
              Demande envoyée avec succès !
            </h1>
            <p className="text-muted-foreground text-lg mb-8">
              Merci de votre intérêt pour ouyaboung. Notre équipe va examiner votre dossier.
            </p>

            <Card className="mb-8">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-6">Prochaines étapes</h2>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Examen de votre dossier</h3>
                      <p className="text-sm text-muted-foreground">
                        Notre équipe vérifiera vos informations sous 24 à 48 heures
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Notification par email</h3>
                      <p className="text-sm text-muted-foreground">
                        Vous recevrez un email de confirmation avec vos identifiants de connexion
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Commencez à publier</h3>
                      <p className="text-sm text-muted-foreground">
                        Une fois validé, vous pourrez publier vos invendus et commencer à vendre
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/">
                <Button variant="outline" className="gap-2 w-full sm:w-auto">
                  <Home className="w-4 h-4" />
                  Retour à l'accueil
                </Button>
              </Link>
              <Link href="/search">
                <Button className="gap-2 w-full sm:w-auto">
                  Explorer les offres
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default MerchantRegisterSuccessPage;
