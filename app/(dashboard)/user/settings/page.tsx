"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
    Settings,
    Globe,
    Moon,
    Bell,
    MapPin,
    Lock,
    Trash2,
    Download,
    Shield,
    Loader2,
    Eye,
    EyeOff,
    LocateFixed
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { changePassword, updateProfile, getAuthUser, logout } from "@/services/auth.service";
import { getUserNotifications } from "@/services/notification.service";
import { getNotificationPreferences, updateUserLocationSettings } from "@/services/user.service";
import {
    clearCachedUserLocation,
    formatLocationAccuracy,
    getCachedUserLocation,
    isValidCoordinate,
    resolveUserLocation,
} from "@/services";
import type { UserGeolocation } from "@/services";
import type { UserLocationPreference } from "@/types";
import { useNotifications } from "@/hooks/useNotifications";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";

const toLocationPreference = (location: UserGeolocation): UserLocationPreference => ({
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    source: location.source,
    is_approximate: location.isApproximate,
    city: location.city ?? null,
    country: location.country ?? null,
    region: location.region ?? null,
    updated_at: new Date().toISOString(),
});

const toGeolocation = (location: UserLocationPreference): UserGeolocation => ({
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    source: location.source === "browser" || location.source === "ip_lookup" || location.source === "default_city" || location.source === "cache"
        ? location.source
        : "cache",
    isApproximate: location.is_approximate,
    city: location.city ?? null,
    country: location.country ?? null,
    region: location.region ?? null,
});

const formatLocationDate = (value?: string): string => {
    if (!value) return "Date inconnue";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date inconnue";
    return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

export default function SettingsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { theme, resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const {
        preferences: notifPreferences,
        updatePreferences: updateNotifPreferences
    } = useNotifications();

    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDownloads, setIsDownloading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [savedLocation, setSavedLocation] = useState<UserLocationPreference | null>(null);

    // Password visibility state
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [settings, setSettings] = useState({
        // Display
        language: "fr",
        darkMode: false, // Will sync with theme

        // Location
        locationEnabled: true, // Default active
        defaultRadius: "5",

        // Privacy
        profilePublic: false,
        shareStats: true,
    });

    // Load settings from user_metadata
    useEffect(() => {
        const loadSettings = async () => {
            setIsLoading(true);
            try {
                const { data } = await getAuthUser();
                const user = data?.user;
                const metadata = user?.user_metadata || {};
                setUserId(user?.id || null);

                let locationEnabled = metadata.locationEnabled !== undefined ? metadata.locationEnabled : true;
                let defaultRadius = metadata.defaultRadius || "5";
                let locationFromPreferences: UserLocationPreference | null = null;

                if (user?.id) {
                    const preferencesRes = await getNotificationPreferences(user.id);
                    const preferences = preferencesRes.data;
                    if (preferences) {
                        locationEnabled = preferences.location_enabled ?? locationEnabled;
                        defaultRadius = String(
                            preferences.default_radius_km ??
                            preferences.max_distance_km ??
                            defaultRadius
                        );
                        locationFromPreferences = preferences.last_known_location ?? null;
                    }
                }

                const metadataLocation = metadata.lastKnownLocation as UserLocationPreference | undefined;
                const cachedLocation = getCachedUserLocation();
                const cachedPreference =
                    cachedLocation && isValidCoordinate(cachedLocation.latitude, cachedLocation.longitude)
                        ? toLocationPreference(cachedLocation)
                        : null;

                setSavedLocation(locationFromPreferences ?? metadataLocation ?? cachedPreference);

                setSettings({
                    language: metadata.language || "fr",
                    darkMode: resolvedTheme === 'dark',
                    locationEnabled,
                    defaultRadius,
                    profilePublic: metadata.profilePublic || false,
                    shareStats: metadata.shareStats !== undefined ? metadata.shareStats : true,
                });
            } catch (err) {
                console.error("Failed to load settings:", err);
            } finally {
                setIsLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // 1. Save generic settings to user_metadata
            const profileRes = await updateProfile({
                ...settings,
                darkMode: resolvedTheme === 'dark', // Ensure we save actual theme state
                lastKnownLocation: savedLocation,
            });

            if (!profileRes.success) {
                throw new Error("Erreur lors de la sauvegarde du profil");
            }

            if (userId) {
                const preferencesRes = await updateUserLocationSettings(userId, {
                    locationEnabled: settings.locationEnabled,
                    defaultRadiusKm: Number(settings.defaultRadius),
                    lastKnownLocation: savedLocation,
                });

                if (!preferencesRes.success) {
                    throw new Error("Erreur lors de la sauvegarde des préférences de localisation");
                }
            }

            toast({
                title: "Paramètres enregistrés",
                description: "Vos préférences ont été mises à jour avec succès.",
            });
        } catch (err: any) {
            toast({
                title: "Erreur",
                description: err.message || "Impossible d'enregistrer les paramètres",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleUseCurrentLocation = async () => {
        setIsLocating(true);
        try {
            const result = await resolveUserLocation({
                forceRefresh: true,
                timeoutMs: 15000,
                maximumAgeMs: 60000,
                enableHighAccuracy: true,
                fallbackToIp: true,
                requestBrowserPermission: true,
                retryLowAccuracy: true,
            });

            if (!result.success || !result.data) {
                const denied = result.error?.code === "GEO_PERMISSION_DENIED";
                toast({
                    title: denied ? "Localisation refusée" : "Position indisponible",
                    description: denied
                        ? "Autorisez la localisation dans votre navigateur pour enregistrer votre position."
                        : "Impossible d'obtenir une position fiable pour le moment.",
                    variant: "destructive",
                });
                return;
            }

            const nextLocation = toLocationPreference(result.data);
            setSavedLocation(nextLocation);
            setSettings((current) => ({ ...current, locationEnabled: true }));

            if (userId) {
                await updateUserLocationSettings(userId, {
                    locationEnabled: true,
                    defaultRadiusKm: Number(settings.defaultRadius),
                    lastKnownLocation: nextLocation,
                });
            }

            await updateProfile({
                locationEnabled: true,
                defaultRadius: settings.defaultRadius,
                lastKnownLocation: nextLocation,
            });

            toast({
                title: result.data.isApproximate ? "Position approximative enregistrée" : "Position GPS enregistrée",
                description: formatLocationAccuracy(result.data),
            });
        } catch {
            toast({
                title: "Erreur",
                description: "Impossible d'enregistrer votre position actuelle.",
                variant: "destructive",
            });
        } finally {
            setIsLocating(false);
        }
    };

    const handleForgetLocation = async () => {
        clearCachedUserLocation();
        setSavedLocation(null);

        try {
            if (userId) {
                await updateUserLocationSettings(userId, { lastKnownLocation: null });
            }
            await updateProfile({ lastKnownLocation: null });
            toast({
                title: "Position oubliée",
                description: "La position enregistrée a été supprimée de vos paramètres.",
            });
        } catch {
            toast({
                title: "Erreur",
                description: "Impossible de supprimer la position enregistrée.",
                variant: "destructive",
            });
        }
    };

    const handleChangePassword = async () => {
        if (!passwordData.newPassword || !passwordData.confirmPassword) {
            toast({
                title: "Erreur",
                description: "Veuillez remplir tous les champs",
                variant: "destructive",
            });
            return;
        }

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast({
                title: "Erreur",
                description: "Les mots de passe ne correspondent pas",
                variant: "destructive",
            });
            return;
        }

        if (passwordData.newPassword.length < 6) {
            toast({
                title: "Erreur",
                description: "Le mot de passe doit contenir au moins 6 caractères",
                variant: "destructive",
            });
            return;
        }

        setIsChangingPassword(true);
        const result = await changePassword(passwordData.newPassword);
        setIsChangingPassword(false);

        if (result.success) {
            toast({
                title: "Mot de passe modifié",
                description: "Votre mot de passe a été mis à jour avec succès.",
            });
            setIsPasswordDialogOpen(false);
            setPasswordData({
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
            });
        } else {
            toast({
                title: "Erreur",
                description: result.error?.message || "Impossible de modifier le mot de passe",
                variant: "destructive",
            });
        }
    };

    const handleDownloadData = async () => {
        setIsDownloading(true);
        try {
            const { data: userData } = await getAuthUser();
            const userId = userData?.user?.id;

            if (!userId) throw new Error("Utilisateur non trouvé");

            const notificationsRes = await getUserNotifications(userId);

            const exportData = {
                user: userData?.user,
                settings: settings,
                savedLocation,
                notifications: notificationsRes.data || [],
                exportedAt: new Date().toISOString(),
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `oyaboug - data - ${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast({
                title: "Téléchargement terminé",
                description: "Vos données ont été téléchargées avec succès.",
            });
        } catch (err) {
            toast({
                title: "Erreur",
                description: "Impossible de télécharger les données",
                variant: "destructive",
            });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            // Soft disable account via metadata logic
            await updateProfile({ account_status: 'deleted', deleted_at: new Date() });
            await logout();
            router.push('/auth/login');
            toast({
                title: "Compte supprimé",
                description: "Votre compte a été supprimé avec succès. Au revoir !",
            });
        } catch (err) {
            toast({
                title: "Erreur",
                description: "Impossible de supprimer le compte",
                variant: "destructive",
            });
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
                <p className="text-muted-foreground">Personnalisez votre expérience</p>
            </div>

            <div className="space-y-6">
                {/* Display Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Affichage
                        </CardTitle>
                        <CardDescription>
                            Personnalisez l'apparence de l'application
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Globe className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <Label>Langue</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Choisissez la langue de l'interface
                                    </p>
                                </div>
                            </div>
                            <Select
                                value={settings.language}
                                onValueChange={(value) => setSettings({ ...settings, language: value })}
                            >
                                <SelectTrigger className="w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fr">Français</SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Moon className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <Label>Mode sombre</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Activer le thème sombre
                                    </p>
                                </div>
                            </div>
                            <Switch
                                checked={resolvedTheme === 'dark'}
                                onCheckedChange={(checked) => {
                                    setTheme(checked ? 'dark' : 'light');
                                    setSettings({ ...settings, darkMode: checked });
                                }}
                                disabled={!mounted}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Location Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            Localisation
                        </CardTitle>
                        <CardDescription>
                            Gérez vos préférences de géolocalisation
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Activer la géolocalisation</Label>
                                <p className="text-xs text-muted-foreground">
                                    Pour trouver les offres près de vous (activé par défaut)
                                </p>
                            </div>
                            <Switch
                                checked={settings.locationEnabled}
                                onCheckedChange={(checked) => setSettings({ ...settings, locationEnabled: checked })}
                            />
                        </div>

                        <Separator />

                        <div className="rounded-md border p-4 space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                    <Label>Position enregistrée</Label>
                                    {savedLocation ? (
                                        <>
                                            <p className="text-sm text-foreground">
                                                {formatLocationAccuracy(toGeolocation(savedLocation))}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {savedLocation.latitude.toFixed(5)}, {savedLocation.longitude.toFixed(5)}
                                                {" · "}
                                                Mise à jour le {formatLocationDate(savedLocation.updated_at)}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Aucune position personnelle n'est enregistrée.
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={handleUseCurrentLocation}
                                        disabled={isLocating || !settings.locationEnabled}
                                    >
                                        {isLocating ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <LocateFixed className="h-4 w-4" />
                                        )}
                                        {isLocating ? "Localisation..." : "Mettre à jour"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="gap-2"
                                        onClick={handleForgetLocation}
                                        disabled={isLocating || !savedLocation}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Oublier
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Rayon de recherche par défaut</Label>
                                <p className="text-xs text-muted-foreground">
                                    Distance maximale pour les recherches
                                </p>
                            </div>
                            <Select
                                value={settings.defaultRadius}
                                onValueChange={(value) => setSettings({ ...settings, defaultRadius: value })}
                            >
                                <SelectTrigger className="w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 km</SelectItem>
                                    <SelectItem value="2">2 km</SelectItem>
                                    <SelectItem value="5">5 km</SelectItem>
                                    <SelectItem value="10">10 km</SelectItem>
                                    <SelectItem value="20">20 km</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Notification Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Bell className="h-5 w-5" />
                            Notifications
                        </CardTitle>
                        <CardDescription>
                            Choisissez comment vous souhaitez être notifié
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {notifPreferences ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>Notifications push</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Alertes sur votre appareil
                                        </p>
                                    </div>
                                    <Switch
                                        checked={notifPreferences.push_enabled}
                                        onCheckedChange={(checked) => updateNotifPreferences({ push_enabled: checked })}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>Notifications par email</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Résumés et confirmations par email
                                        </p>
                                    </div>
                                    <Switch
                                        checked={notifPreferences.email_enabled}
                                        onCheckedChange={(checked) => updateNotifPreferences({ email_enabled: checked })}
                                    />
                                </div>

                                <Separator />

                                {/* SMS typically requires additional costs/setup, flagging as disabled if not active */}
                                <div className="flex items-center justify-between opacity-50 cursor-not-allowed" title="Option non disponible">
                                    <div>
                                        <Label>Notifications SMS</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Rappels par SMS (Bientôt disponible)
                                        </p>
                                    </div>
                                    <Switch
                                        checked={false}
                                        disabled={true}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-muted-foreground">Chargement des préférences de notification...</div>
                        )}
                    </CardContent>
                </Card>

                {/* Privacy Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Confidentialité
                        </CardTitle>
                        <CardDescription>
                            Contrôlez la visibilité de vos informations
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Profil public</Label>
                                <p className="text-xs text-muted-foreground">
                                    Permettre aux autres de voir votre profil
                                </p>
                            </div>
                            <Switch
                                checked={settings.profilePublic}
                                onCheckedChange={(checked) => setSettings({ ...settings, profilePublic: checked })}
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Partager mes statistiques</Label>
                                <p className="text-xs text-muted-foreground">
                                    Contribuer aux statistiques globales de la plateforme
                                </p>
                            </div>
                            <Switch
                                checked={settings.shareStats}
                                onCheckedChange={(checked) => setSettings({ ...settings, shareStats: checked })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Security */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Lock className="h-5 w-5" />
                            Sécurité
                        </CardTitle>
                        <CardDescription>
                            Gérez la sécurité de votre compte
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full justify-start">
                                    <Lock className="h-4 w-4 mr-2" />
                                    Changer le mot de passe
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
                                        <Label htmlFor="new-password">Nouveau mot de passe</Label>
                                        <div className="relative">
                                            <Input
                                                id="new-password"
                                                type={showNewPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={passwordData.newPassword}
                                                onChange={(e) =>
                                                    setPasswordData({ ...passwordData, newPassword: e.target.value })
                                                }
                                                disabled={isChangingPassword}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent z-10"
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                            >
                                                {showNewPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                                        <div className="relative">
                                            <Input
                                                id="confirm-password"
                                                type={showConfirmPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={passwordData.confirmPassword}
                                                onChange={(e) =>
                                                    setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                                                }
                                                disabled={isChangingPassword}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent z-10"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            >
                                                {showConfirmPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
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

                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={handleDownloadData}
                            disabled={isDownloads}
                        >
                            {isDownloads ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                            Télécharger mes données
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full justify-start">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Supprimer mon compte
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Cette action est irréversible. Cela marquera votre compte comme supprimé et vous déconnectera.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end p-4 bg-muted/20 rounded-lg">
                    <Button onClick={handleSave} disabled={isSaving} size="lg">
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Enregistrement...
                            </>
                        ) : (
                            "Enregistrer les modifications"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
