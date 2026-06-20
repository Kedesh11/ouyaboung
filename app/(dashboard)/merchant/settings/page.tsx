"use client";

// ============================================
// Merchant Settings Page - Account Settings
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import {
  Bell,
  Shield,
  CreditCard,
  Globe,
  Trash2,
  Key,
  Smartphone,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/services";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  getAuthUser,
  getNotificationPreferences,
  updateNotificationPreferences,
  getMyMerchantProfile,
  updateMerchantProfile,
  getMerchantPayoutAccounts,
  createMerchantPayoutAccount,
} from "@/services";
import type { MerchantPayoutAccount, PayoutOperator } from "@/services";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const MerchantSettingsPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [payoutAccounts, setPayoutAccounts] = useState<MerchantPayoutAccount[]>([]);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    operator: "airtel" as PayoutOperator,
    label: "",
    msisdn: "",
  });

  const [notifications, setNotifications] = useState({
    newOrder: true,
    orderReady: true,
    orderCancelled: true,
    dailySummary: false,
    marketing: false, // Local only
    sms: true,
    email: true,
    push: true,
  });

  const [security, setSecurity] = useState({
    twoFactor: false,
  });

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Load Data
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: userData } = await getAuthUser();
        if (userData?.user) {
          setUserId(userData.user.id);

          // Load Preferences
          const { data: prefs } = await getNotificationPreferences(userData.user.id);
          if (prefs) {
            setNotifications(prev => ({
              ...prev,
              sms: prefs.sms_notifications ?? true,
              email: prefs.email_notifications ?? true,
              push: prefs.notifications_enabled ?? true,
            }));
          }

          // Load Merchant for ID
          const { data: merchantData } = await getMyMerchantProfile(userData.user.id);
          if (merchantData) {
            setMerchantId(merchantData.id);
            const { data: payoutData } = await getMerchantPayoutAccounts(merchantData.id);
            setPayoutAccounts(payoutData || []);
          }
        }
      } catch (e) {
        console.error("Failed to load settings", e);
        toast.error("Impossible de charger les paramètres");
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!userId) return;

    try {
      const result = await updateNotificationPreferences(userId, {
        notificationsEnabled: notifications.push,
        emailNotifications: notifications.email,
        smsNotifications: notifications.sms,
      });

      if (result.success) {
        toast.success("Paramètres enregistrés");
      } else {
        toast.error("Erreur lors de l'enregistrement");
      }
    } catch (e) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleDeactivateAccount = async () => {
    if (!merchantId) return;
    if (confirm("Êtes-vous sûr de vouloir désactiver votre compte ? Votre commerce ne sera plus visible.")) {
      try {
        const result = await updateMerchantProfile(merchantId, { isActive: false });
        if (result.success) {
          toast.success("Compte désactivé");
          // Optional: Refresh or redirect
        } else {
          toast.error("Erreur lors de la désactivation");
        }
      } catch (e) {
        toast.error("Une erreur est survenue");
      }
    }
  };

  const handleCreatePayoutAccount = async () => {
    if (!merchantId) {
      toast.error("Profil marchand introuvable");
      return;
    }

    setIsSavingPayout(true);
    const result = await createMerchantPayoutAccount({
      merchantId,
      operator: payoutForm.operator,
      label: payoutForm.label,
      msisdn: payoutForm.msisdn,
      isDefault: payoutAccounts.length === 0,
    });
    setIsSavingPayout(false);

    if (!result.success || !result.data) {
      toast.error(result.error?.message || "Impossible d'ajouter ce compte de reversement");
      return;
    }

    setPayoutAccounts((current) => [result.data!, ...current]);
    setPayoutForm({ operator: "airtel", label: "", msisdn: "" });
    toast.success("Compte Mobile Money soumis pour validation");
  };

  const getPayoutStatusLabel = (status: MerchantPayoutAccount["verification_status"]) => {
    if (status === "verified") return "Verifie";
    if (status === "rejected") return "Refuse";
    if (status === "disabled") return "Desactive";
    return "En attente";
  };

  const getPayoutStatusClassName = (status: MerchantPayoutAccount["verification_status"]) => {
    if (status === "verified") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    if (status === "rejected") return "bg-red-500/10 text-red-600 border-red-500/20";
    if (status === "disabled") return "bg-muted text-muted-foreground";
    return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  };

  const handleDeleteAccount = () => {
    toast.info("Veuillez contacter le support pour supprimer votre compte commerce définitivement.", {
      duration: 5000,
      action: {
        label: "Contacter",
        onClick: () => router.push("/merchant/help")
      }
    });
  };

  const handleChangePassword = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setIsChangingPassword(true);
    const result = await changePassword(passwordData.newPassword);
    setIsChangingPassword(false);

    if (result.success) {
      toast.success("Mot de passe modifié avec succès");
      setIsPasswordDialogOpen(false);
      setPasswordData({
        newPassword: "",
        confirmPassword: "",
      });
    } else {
      toast.error(result.error?.message || "Impossible de modifier le mot de passe");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gérez vos préférences et votre compte
        </p>
      </div>
      <div className="max-w-2xl space-y-6">
        {/* Notifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configurez comment vous souhaitez être notifié
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Notification Types */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground">
                  Types de notifications
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="newOrder">Nouvelle réservation</Label>
                    <Switch
                      id="newOrder"
                      checked={notifications.newOrder}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, newOrder: c })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="orderReady">Commande prête à récupérer</Label>
                    <Switch
                      id="orderReady"
                      checked={notifications.orderReady}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, orderReady: c })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="orderCancelled">Annulation de commande</Label>
                    <Switch
                      id="orderCancelled"
                      checked={notifications.orderCancelled}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, orderCancelled: c })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dailySummary">Résumé quotidien</Label>
                    <Switch
                      id="dailySummary"
                      checked={notifications.dailySummary}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, dailySummary: c })
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notification Channels */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground">
                  Canaux de notification
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="sms">SMS</Label>
                    </div>
                    <Switch
                      id="sms"
                      checked={notifications.sms}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, sms: c })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="email">Email</Label>
                    </div>
                    <Switch
                      id="email"
                      checked={notifications.email}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, email: c })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="push">Notifications push</Label>
                    </div>
                    <Switch
                      id="push"
                      checked={notifications.push}
                      onCheckedChange={(c) =>
                        setNotifications({ ...notifications, push: c })
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Payout Accounts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Reversements Mobile Money
              </CardTitle>
              <CardDescription>
                Ajoutez le numero Airtel ou Libertis/Moov qui recevra les reversements apres validation admin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Validation requise</AlertTitle>
                <AlertDescription>
                  Les paiements sont bloques tant qu&apos;aucun compte de reversement n&apos;est verifie avec son Disbursement ID SingPay.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={payoutForm.operator === "airtel" ? "default" : "outline"}
                    onClick={() => setPayoutForm((current) => ({ ...current, operator: "airtel" }))}
                  >
                    Airtel Money
                  </Button>
                  <Button
                    type="button"
                    variant={payoutForm.operator === "moov" ? "default" : "outline"}
                    onClick={() => setPayoutForm((current) => ({ ...current, operator: "moov" }))}
                  >
                    Libertis/Moov Money
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payout-label">Libelle</Label>
                  <Input
                    id="payout-label"
                    value={payoutForm.label}
                    onChange={(event) => setPayoutForm((current) => ({ ...current, label: event.target.value }))}
                    placeholder="Ex: Caisse principale"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payout-msisdn">Numero Mobile Money</Label>
                  <Input
                    id="payout-msisdn"
                    value={payoutForm.msisdn}
                    onChange={(event) => setPayoutForm((current) => ({ ...current, msisdn: event.target.value }))}
                    placeholder={payoutForm.operator === "airtel" ? "77157904 ou 074787355" : "62053671 ou 066282310"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Prefixes acceptes: {payoutForm.operator === "airtel" ? "74, 77, 76" : "66, 62, 65"}.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={handleCreatePayoutAccount}
                  disabled={isSavingPayout || !merchantId}
                  className="w-full"
                >
                  {isSavingPayout && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Soumettre pour validation
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                {payoutAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun compte de reversement configure.
                  </p>
                ) : (
                  payoutAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{account.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.operator === "airtel" ? "Airtel Money" : "Libertis/Moov Money"} · {account.normalized_msisdn}
                        </p>
                      </div>
                      <Badge className={getPayoutStatusClassName(account.verification_status)}>
                        {getPayoutStatusLabel(account.verification_status)}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Sécurité
              </CardTitle>
              <CardDescription>
                Protégez votre compte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="twoFactor">Authentification à deux facteurs</Label>
                  <p className="text-xs text-muted-foreground">
                    Ajouter une couche de sécurité supplémentaire
                  </p>
                </div>
                <Switch
                  id="twoFactor"
                  checked={security.twoFactor}
                  onCheckedChange={(c) =>
                    setSecurity({ ...security, twoFactor: c })
                  }
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Changer le mot de passe</Label>
                <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full gap-2">
                      <Key className="w-4 h-4" />
                      Modifier le mot de passe
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Changer le mot de passe</DialogTitle>
                      <DialogDescription>
                        Entrez votre nouveau mot de passe. Il doit contenir au moins 6 caractères.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="merchant-new-password">Nouveau mot de passe</Label>
                        <Input
                          id="merchant-new-password"
                          type="password"
                          placeholder="••••••••"
                          value={passwordData.newPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, newPassword: e.target.value })
                          }
                          disabled={isChangingPassword}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="merchant-confirm-password">Confirmer le mot de passe</Label>
                        <Input
                          id="merchant-confirm-password"
                          type="password"
                          placeholder="••••••••"
                          value={passwordData.confirmPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                          }
                          disabled={isChangingPassword}
                        />
                      </div>
                      <Button
                        onClick={handleChangePassword}
                        className="w-full"
                        disabled={isChangingPassword}
                      >
                        {isChangingPassword ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Modification...
                          </>
                        ) : (
                          "Modifier le mot de passe"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Préférences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Langue</Label>
                <p className="text-sm text-muted-foreground">
                  Français (Gabon)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Fuseau horaire</Label>
                <p className="text-sm text-muted-foreground">
                  Africa/Libreville (UTC+1)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Devise</Label>
                <p className="text-sm text-muted-foreground">
                  Franc CFA (XAF)
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Zone dangereuse
              </CardTitle>
              <CardDescription>
                Actions irréversibles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    Désactiver le compte
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Votre commerce ne sera plus visible
                  </p>
                </div>
                <Button variant="outline" onClick={handleDeactivateAccount}>Désactiver</Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-destructive">
                    Supprimer le compte
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cette action est irréversible
                  </p>
                </div>
                <Button variant="destructive" onClick={handleDeleteAccount}>Supprimer</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Save Button */}
        <Button className="w-full" size="lg" onClick={handleSave}>
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
};

export default MerchantSettingsPage;
