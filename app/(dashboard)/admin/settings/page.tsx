"use client";

// ============================================
// Admin Settings Page - Platform Settings
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Bell,
  Shield,
  Mail,
  Globe,
  Database,
  Save,
  Loader2,
  UserCog
} from "lucide-react";
import { toast } from "sonner";
import { adminService } from "@/services/admin.service";
import { useNotifications } from "@/hooks/useNotifications";
import type { PlatformSettings } from "@/types/admin.types";

const AdminSettingsPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  const { preferences, updatePreferences } = useNotifications();
  
  // Role Management State
  const [users, setUsers] = useState<{ email: string, fullName: string }[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Load platform settings separately from notifications (which are loaded by the hook)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await adminService.getPlatformSettings();
        setPlatformSettings(settings);
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("Erreur lors du chargement des paramètres");
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Load users for role management
  useEffect(() => {
    const loadUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const data = await adminService.getClients();
        // Sort by email for easier finding
        const formattedUsers = data
          .map(u => ({ email: u.email, fullName: u.fullName }))
          .sort((a, b) => a.email.localeCompare(b.email));
        setUsers(formattedUsers);
      } catch (error) {
        console.error("Failed to load users:", error);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  const handleSaveGeneral = async () => {
    if (!platformSettings) return;
    toast.promise(
      Promise.all([
        adminService.updatePlatformSettings('general', platformSettings.general),
        adminService.updatePlatformSettings('registration', platformSettings.registration)
      ]),
      {
        loading: 'Enregistrement...',
        success: 'Paramètres généraux enregistrés',
        error: 'Erreur lors de l\'enregistrement'
      }
    );
  };

  const handleSaveSecurity = async () => {
    if (!platformSettings) return;
    toast.promise(
      adminService.updatePlatformSettings('maintenance', platformSettings.maintenance),
      {
        loading: 'Enregistrement...',
        success: 'Paramètres de sécurité enregistrés',
        error: 'Erreur lors de l\'enregistrement'
      }
    );
  };
  
  const handleUpdateRole = async () => {
    if (!userEmail || !userEmail.includes('@')) {
      toast.error("Veuillez entrer un email valide");
      return;
    }
    
    setIsUpdatingRole(true);
    try {
      await adminService.updateUserRole(userEmail, newRole);
      toast.success(`Le rôle de ${userEmail} a été mis à jour vers ${newRole}`);
      setUserEmail("");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la mise à jour du rôle");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Helper to update local state deep keys
  const updateSetting = (section: keyof PlatformSettings, key: string, value: any) => {
    if (!platformSettings) return;
    setPlatformSettings({
      ...platformSettings,
      [section]: {
        ...platformSettings[section],
        [key]: value
      }
    });
  };

  if (isLoading || !platformSettings) {
    return (
      <div className="space-y-4 md:space-y-6 lg:p-6">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Configuration de la plateforme
        </p>
      </div>
      <Tabs defaultValue="general">
        <TabsList className="mb-6">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="w-4 h-4" />
            Général
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <UserCog className="w-4 h-4" />
            Utilisateurs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="space-y-6">
            {/* Platform Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Informations de la plateforme
                </CardTitle>
                <CardDescription>
                  Paramètres généraux de la plateforme ouyaboung
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="platformName">Nom de la plateforme</Label>
                  <Input
                    id="platformName"
                    value={platformSettings.general.platformName}
                    onChange={(e) => updateSetting('general', 'platformName', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="supportEmail">Email de support</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={platformSettings.general.supportEmail}
                    onChange={(e) => updateSetting('general', 'supportEmail', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Registration Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Inscriptions
                </CardTitle>
                <CardDescription>
                  Gérez les paramètres d'inscription des commerces
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Inscriptions ouvertes</Label>
                    <p className="text-sm text-muted-foreground">
                      Autoriser les nouveaux commerces à s'inscrire
                    </p>
                  </div>
                  <Switch
                    checked={platformSettings.registration.isOpen}
                    onCheckedChange={(checked) => updateSetting('registration', 'isOpen', checked)}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Validation automatique</Label>
                    <p className="text-sm text-muted-foreground">
                      Approuver automatiquement les nouveaux commerces (non recommandé)
                    </p>
                  </div>
                  <Switch
                    checked={platformSettings.registration.autoApprove}
                    onCheckedChange={(checked) => updateSetting('registration', 'autoApprove', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSaveGeneral} className="gap-2">
                <Save className="w-4 h-4" />
                Enregistrer Général
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Mes Préférences de Notification
              </CardTitle>
              <CardDescription>
                Configurez vos alertes personnelles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notifications email</Label>
                  <p className="text-sm text-muted-foreground">
                    Recevoir les notifications par email
                  </p>
                </div>
                <Switch
                  checked={preferences?.email_enabled ?? true}
                  onCheckedChange={(checked) => updatePreferences({ email_enabled: checked })}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Catégories</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm">Alertes Système</span>
                    <Switch
                      checked={preferences?.categories?.system ?? true}
                      onCheckedChange={(checked) => updatePreferences({
                        categories: {
                          order: true,
                          payment: true,
                          promotion: true,
                          merchant: true,
                          impact: true,
                          // system intentionally omitted here as it is set below
                          ...(preferences?.categories ?? {}),
                          system: checked
                        }
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm">Inscriptions Commerces</span>
                    <Switch
                      checked={preferences?.categories?.merchant ?? true}
                      onCheckedChange={(checked) => updatePreferences({
                        categories: {
                          order: true,
                          payment: true,
                          promotion: true,
                          // merchant intentionally omitted here as it is set below
                          impact: true,
                          system: true,
                          ...(preferences?.categories ?? {}),
                          merchant: checked
                        }
                      })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Sécurité et maintenance
              </CardTitle>
              <CardDescription>
                Paramètres de sécurité de la plateforme
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mode maintenance</Label>
                  <p className="text-sm text-muted-foreground">
                    Activer le mode maintenance (plateforme inaccessible aux utilisateurs)
                  </p>
                </div>
                <Switch
                  checked={platformSettings.maintenance.isEnabled}
                  onCheckedChange={(checked) => updateSetting('maintenance', 'isEnabled', checked)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maintenanceMsg">Message de maintenance</Label>
                <Input
                  id="maintenanceMsg"
                  value={platformSettings.maintenance.message}
                  onChange={(e) => updateSetting('maintenance', 'message', e.target.value)}
                  disabled={!platformSettings.maintenance.isEnabled}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSaveSecurity} variant="destructive" className="gap-2">
              <Save className="w-4 h-4" />
              Enregistrer Maintenance
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCog className="w-4 h-4" />
                Gestion des Rôles
              </CardTitle>
              <CardDescription>
                Modifiez le rôle d'un utilisateur existant via son adresse email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="userEmail">Email de l'utilisateur</Label>
                  <Select value={userEmail} onValueChange={setUserEmail}>
                    <SelectTrigger id="userEmail">
                      <SelectValue placeholder={isLoadingUsers ? "Chargement..." : "Sélectionner un email"} />
                    </SelectTrigger>
                    <SelectContent>
                      {users.length === 0 ? (
                        <SelectItem value="none" disabled>Aucun utilisateur trouvé</SelectItem>
                      ) : (
                        users.map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            <div className="flex flex-col">
                              <span className="font-medium">{u.email}</span>
                              <span className="text-xs text-muted-foreground">{u.fullName}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="newRole">Nouveau rôle</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger id="newRole">
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Utilisateur (Client)</SelectItem>
                      <SelectItem value="merchant">Marchand</SelectItem>
                      <SelectItem value="admin">Administrateur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="bg-muted/50 p-4 rounded-lg border border-dashed border-muted-foreground/20">
                <p className="text-xs text-muted-foreground">
                  <strong>Attention :</strong> Changer le rôle d'un utilisateur modifie ses permissions immédiatement. 
                  Assurez-vous que l'email est correct avant de valider.
                </p>
              </div>

              <div className="flex justify-end">
                <Button 
                  onClick={handleUpdateRole} 
                  disabled={isUpdatingRole || !userEmail}
                  className="gap-2"
                >
                  {isUpdatingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Mettre à jour le rôle
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettingsPage;
