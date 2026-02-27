import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck, Database, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PrivacyPolicy = () => {
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
                Politique de confidentialite
              </Badge>
              <Badge variant="outline">Mise a jour: 27 fevrier 2026</Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Protection de vos donnees personnelles
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Cette politique explique quelles donnees nous collectons, pourquoi nous les traitons,
              pendant combien de temps nous les conservons et comment exercer vos droits.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Responsable</p>
                <p className="text-sm text-muted-foreground">Equipe ouyaboung</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <Database className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Donnees traitees</p>
                <p className="text-sm text-muted-foreground">Compte, commandes, notifications</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <Eye className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Vos droits</p>
                <p className="text-sm text-muted-foreground">Acces, rectification, suppression</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Donnees collectees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>Nous collectons uniquement les donnees necessaires au service, notamment:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Informations de compte: nom, email, telephone, role utilisateur.</li>
              <li>Informations de profil: adresse, preferences, donnees marchand si applicable.</li>
              <li>Donnees transactionnelles: reservations, commandes, statuts, historique.</li>
              <li>Donnees techniques: journaux d'erreurs, identifiants de session, metadata de securite.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Finalites du traitement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>Vos donnees sont utilisees pour:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Creer et gerer votre compte.</li>
              <li>Permettre les reservations, validations et retraits.</li>
              <li>Assurer la moderation, la securite et la prevention des abus.</li>
              <li>Envoyer les notifications operationnelles (commande, statut, validation).</li>
              <li>Produire des statistiques anonymisees d'usage et d'impact.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Partage et sous-traitance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              Les donnees peuvent etre traitees par nos prestataires techniques (hebergement, base de donnees,
              envoi d'emails) uniquement pour l'exploitation du service et selon des obligations de confidentialite.
            </p>
            <p>
              Nous ne vendons pas vos donnees personnelles a des tiers a des fins commerciales.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Duree de conservation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              Les donnees sont conservees pendant la duree necessaire aux finalites du service,
              puis archivees ou supprimees conformement a nos obligations legales et contractuelles.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Vos droits et contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Vous pouvez demander l'acces, la rectification ou la suppression de vos donnees,
              ainsi que la limitation de certains traitements.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <a href="mailto:support@ouyaboung.ga">
                <Mail className="w-4 h-4" />
                support@ouyaboung.ga
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default PrivacyPolicy;
