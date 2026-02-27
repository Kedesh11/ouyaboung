import Link from "next/link";
import { ArrowLeft, FileText, Shield, Handshake, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TermsOfService = () => {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour a l'accueil
        </Link>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                Conditions Generales d'Utilisation
              </Badge>
              <Badge variant="outline">Mise a jour: 27 fevrier 2026</Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Regles d'utilisation de la plateforme ouyaboung
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Les presentes CGU encadrent l'utilisation des services proposes par la plateforme
              pour les clients, marchands et administrateurs.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <FileText className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Objet</p>
                <p className="text-sm text-muted-foreground">Usage de la plateforme</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Securite</p>
                <p className="text-sm text-muted-foreground">Compte et acces</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <Handshake className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Engagements</p>
                <p className="text-sm text-muted-foreground">Clients et marchands</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <Scale className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Cadre legal</p>
                <p className="text-sm text-muted-foreground">Responsabilites</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Objet et champ d'application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              Les presentes CGU s'appliquent a toute personne accedant ou utilisant la plateforme ouyaboung,
              en tant que visiteur, client, marchand ou administrateur.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Compte utilisateur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1">
              <li>L'utilisateur fournit des informations exactes et a jour.</li>
              <li>Chaque compte est personnel; les identifiants ne doivent pas etre partages.</li>
              <li>L'utilisateur est responsable des actions effectuees depuis son compte.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Fonctionnement du service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              La plateforme permet aux marchands de publier leurs produits/paniers et aux clients de reserver
              selon disponibilite et statut des offres.
            </p>
            <p>
              Les validations de commandes, statuts de retrait et controles QR sont executes selon les regles
              metier en vigueur sur la plateforme.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Obligations des marchands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1">
              <li>Publier des informations veridiques sur les produits et disponibilites.</li>
              <li>Respecter les normes d'hygiene et de qualite applicables.</li>
              <li>Honorer les retraits commandes selon les statuts valides.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Limitation de responsabilite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              ouyaboung agit comme plateforme intermediaire technique. Chaque partie reste responsable
              de ses engagements contractuels et legaux.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Suspension et resiliation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              En cas de non-respect des CGU, la plateforme peut suspendre ou restreindre l'acces
              a un compte, de maniere temporaire ou definitive.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Contact</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Pour toute question juridique ou operationnelle: support@ouyaboung.ga
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default TermsOfService;
