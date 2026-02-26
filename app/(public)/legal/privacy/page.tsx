"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-8">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>

        <h1 className="text-3xl font-bold mb-8">Politique de Confidentialité</h1>

        <div className="prose prose-green max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Collecte des données</h2>
            <p>Nous collectons les données nécessaires au fonctionnement du service : nom, prénom, email, téléphone et historique des transactions.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Utilisation des données</h2>
            <p>Vos données sont utilisées pour gérer votre compte, traiter vos commandes, vous envoyer des notifications et améliorer nos services.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. Protection des données</h2>
            <p>Nous mettons en œuvre des mesures de sécurité pour protéger vos données contre tout accès non autorisé.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Vos droits</h2>
            <p>Vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Contactez-nous pour exercer ces droits.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Cookies</h2>
            <p>Nous utilisons des cookies pour améliorer votre expérience. Vous pouvez les désactiver dans les paramètres de votre navigateur.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
