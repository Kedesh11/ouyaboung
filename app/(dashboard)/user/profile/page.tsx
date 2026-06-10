"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    User,
    Mail,
    Phone,
    MapPin,
    Calendar,
    Camera,
    Edit,
    Save,
    Award,
    Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthUser, updateProfile as updateAuthProfile } from "@/services/auth.service";
import { updateProfile as updateUserProfile, getProfile as getDbProfile } from "@/services/user.service";
import { uploadAvatar } from "@/services/storage.service";
import { compressImage, isImageFile, getBase64Size } from "@/utils/imageCompression";

export default function ProfilePage() {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: "",
        bio: "",
        createdAt: "",
        avatar: "",
    });

    const loadProfile = async () => {
        setLoading(true);
        try {
            const { data: auth } = await getAuthUser();
            const authUser = auth?.user;

            if (!authUser) {
                setLoading(false);
                return;
            }

            const metadata = authUser.user_metadata || {};
            const userId = authUser.id;
            let profileFirstName = "";
            let profileLastName = "";
            let profilePhone = "";
            let profileAddress = "";
            let profileAvatar = "";
            let profileCreatedAt = authUser.created_at || "";
            const dbResp = await getDbProfile(userId);
            if (dbResp.success && dbResp.data) {
                const fullName = dbResp.data.full_name || metadata.full_name || "";
                const parts = fullName.split(" ");
                profileFirstName = parts[0] || "";
                profileLastName = parts.slice(1).join(" ") || "";
                profilePhone = dbResp.data.phone || metadata.phone || "";
                profileAddress = dbResp.data.address || metadata.address || "";
                profileAvatar = dbResp.data.avatar_url || metadata.avatar_url || "";
            } else {
                const nameParts = (metadata.full_name || "").split(" ");
                profileFirstName = nameParts[0] || "";
                profileLastName = nameParts.slice(1).join(" ") || "";
                profilePhone = metadata.phone || "";
                profileAddress = metadata.address || "";
                profileAvatar = metadata.avatar_url || "";
            }

            setFormData({
                firstName: profileFirstName,
                lastName: profileLastName,
                email: authUser.email || "",
                phone: profilePhone,
                address: profileAddress,
                bio: metadata.bio || "",
                createdAt: profileCreatedAt,
                avatar: profileAvatar,
            });

        } catch (e) {
            console.error("Failed to load profile", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: auth } = await getAuthUser();
            if (!auth?.user?.id) throw new Error("User not found");
            const userId = auth.user.id;

            const fullName = `${formData.firstName} ${formData.lastName}`.trim();

            const resp = await updateUserProfile(userId, {
                fullName: fullName,
                phone: formData.phone,
                address: formData.address,
                // Bio is stored in metadata in this implementation if not in profile
            });

            if (resp?.success) {
                const metaUpdate = {
                    full_name: fullName,
                    phone: formData.phone,
                    address: formData.address,
                    bio: formData.bio,
                };
                await updateAuthProfile(metaUpdate);
                setIsEditing(false);
                toast({
                    title: "Profil mis à jour",
                    description: "Vos informations ont été enregistrées avec succès."
                });
            } else {
                throw new Error(resp.error?.message || "Échec de la mise à jour");
            }
        } catch (e: any) {
            toast({
                title: "Erreur",
                description: e.message || "Échec de la mise à jour",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) {
            return;
        }

        const file = event.target.files[0];
        let base64Data: string | null = null;
        if (!isImageFile(file)) {
            toast({
                title: "Fichier invalide",
                description: "Le fichier doit être une image.",
                variant: "destructive",
            });
            return;
        }

        setUploading(true);
        try {
            console.log("Starting upload process...");
            const { data: auth } = await getAuthUser();
            const userId = auth?.user?.id;
            if (!userId) throw new Error("Erreur d'authentification");

            console.log("Compressing image...");

            let uploadBlob: Blob = file;
            let uploadExt = file.name.split('.').pop();
            let uploadMime = file.type || 'image/jpeg';

            if (file.size > 2 * 1024 * 1024) {
                const base64 = await compressImage(file, { maxWidth: 1024, maxHeight: 1024, quality: 0.8, mimeType: 'image/jpeg' });
                base64Data = base64;
                const sizeBytes = getBase64Size(base64);
                if (sizeBytes > 2 * 1024 * 1024) {
                    throw new Error("Impossible de compresser l'image sous 2 Mo.");
                }
                const arr = base64.split(',');
                const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
                const bstr = atob(arr[1]);
                const u8arr = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
                uploadBlob = new Blob([u8arr], { type: mime });
                uploadMime = mime;
                uploadExt = 'jpg';
            }

            const uploadResult = await uploadAvatar(userId, uploadBlob, uploadExt || 'jpg');
            if (!uploadResult.success || !uploadResult.data) {
                throw new Error(uploadResult.error?.message || "Erreur lors de l'upload");
            }

            const publicUrl = uploadResult.data.publicUrl;

            // Update user metadata with new avatar URL
            const updateRes = await updateAuthProfile({ avatar_url: publicUrl });

            if (updateRes.success) {
                await updateUserProfile(userId, { avatarUrl: publicUrl });
                setFormData(prev => ({ ...prev, avatar: publicUrl }));
                toast({
                    title: "Photo mise à jour",
                    description: "Votre photo de profil a été modifiée.",
                });
            } else {
                throw new Error("Impossible de mettre à jour le profil avec la nouvelle photo.");
            }

        } catch (error: any) {
            let base64Final = base64Data;
            if (!base64Final) {
                base64Final = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
                    reader.readAsDataURL(file);
                });
            }
            try {
                const { data: auth } = await getAuthUser();
                const userId = auth?.user?.id;
                if (!userId) throw new Error("Utilisateur non authentifié");
                const updateRes = await updateAuthProfile({ avatar_url: base64Final });
                if (updateRes.success) {
                    await updateUserProfile(userId, { avatarUrl: base64Final });
                    setFormData(prev => ({ ...prev, avatar: base64Final }));
                    toast({
                        title: "Photo mise à jour",
                        description: "Votre photo de profil a été modifiée (stockage local).",
                    });
                } else {
                    throw new Error("Échec de mise à jour de l'avatar.");
                }
            } catch (e: any) {
                console.error("Upload error:", error);
                toast({
                    title: "Erreur d'upload",
                    description: "Impossible de télécharger l'image. Vérifiez votre connexion ou réessayez.",
                    variant: "destructive",
                });
            }
        } finally {
            setUploading(false);
            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Mon profil</h1>
                <p className="text-muted-foreground">Gérez vos informations personnelles</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Card */}
                <Card className="lg:col-span-1">
                    <CardContent className="p-6">
                        <div className="text-center">
                            <div className="relative inline-block mb-4">
                                <Avatar className="h-24 w-24 border-4 border-primary/20">
                                    <AvatarImage src={formData.avatar} alt={formData.firstName} className="object-cover" />
                                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                                        {formData.firstName?.charAt(0)}{formData.lastName?.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md"
                                    onClick={triggerFileInput}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Camera className="h-4 w-4" />
                                    )}
                                </Button>
                                {/* Hidden File Input */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    accept="image/*"
                                    className="hidden"
                                />
                            </div>

                            {/* Photo Info */}
                            <div className="mb-4">
                                <p className="text-xs text-muted-foreground">
                                    Photo de profil
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Taille maximale: 2Mo
                                </p>
                            </div>

                            <h2 className="text-xl font-bold text-foreground">
                                {formData.firstName} {formData.lastName}
                            </h2>
                            <p className="text-sm text-muted-foreground mb-4">
                                Membre depuis {formData.createdAt ? new Date(formData.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''}
                            </p>

                            <div className="flex justify-center gap-2 mb-6">
                                <Badge variant="secondary" className="gap-1">
                                    <Award className="h-3 w-3" />
                                    0 badges
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-primary">0</p>
                                    <p className="text-xs text-muted-foreground">Repas sauvés</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-green-500">0 kg</p>
                                    <p className="text-xs text-muted-foreground">CO₂ évités</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Profile Form */}
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Informations personnelles</CardTitle>
                        {!isEditing ? (
                            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Modifier
                            </Button>
                        ) : (
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                                    Annuler
                                </Button>
                                <Button size="sm" onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Name */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">Prénom</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="firstName"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        disabled={!isEditing}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Nom</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="lastName"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        disabled={!isEditing}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    disabled={true} // Email change usually requires separate flow
                                    className="pl-10 bg-muted/50"
                                    title="L'email ne peut pas être modifié ici"
                                />
                            </div>
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                            <Label htmlFor="phone">Téléphone</Label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="phone"
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    disabled={!isEditing}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Address */}
                        <div className="space-y-2">
                            <Label htmlFor="address">Adresse</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="address"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    disabled={!isEditing}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Bio */}
                        <div className="space-y-2">
                            <Label htmlFor="bio">Bio</Label>
                            <Textarea
                                id="bio"
                                value={formData.bio}
                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                disabled={!isEditing}
                                rows={3}
                                placeholder="Parlez-nous de vous..."
                            />
                        </div>

                        {/* Member since */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4 border-t">
                            <Calendar className="h-4 w-4" />
                            <span>
                                Membre depuis le {formData.createdAt ? new Date(formData.createdAt).toLocaleDateString("fr-FR") : ''}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
