"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Leaf, User, Store, Mail, Lock, Phone, ArrowLeft, Loader2, UserCircle, X, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { login, register, loginWithOtp, verifyOtpCode } from "@/services";
import type { UserRole } from "@/types";
import { requireSupabaseClient } from "@/api/supabaseClient";

const AuthContent = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { isAuthenticated, loading, user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    // Diagnostic de l'état de connexion au chargement
    useEffect(() => {
        console.log('=== DIAGNOSTIC AUTH PAGE ===');
        console.log('État de connexion:', {
            isAuthenticated,
            loading,
            user: user ? 'connecté' : 'non connecté',
            userId: user?.id,
            userEmail: user?.email,
            userRole: user?.user_metadata?.role
        });

        // Diagnostic du client Supabase - Safe check for env vars in Next.js
        try {
            const supabaseClient = requireSupabaseClient();
            console.log('Client Supabase:', supabaseClient ? 'OK' : 'ERREUR');
        } catch (error) {
            console.error('Erreur client Supabase:', error);
        }
    }, [isAuthenticated, loading, user]);

    // Role is handled by AuthRedirectHandler or initial state
    const initialRole = searchParams.get("role") === "merchant" ? "merchant" : "user";
    const [role, setRole] = useState<UserRole>(initialRole);

    // Login form state
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    // Signup form state
    const [signupEmail, setSignupEmail] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupPhone, setSignupPhone] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [businessName, setBusinessName] = useState("");

    const [acceptedTerms, setAcceptedTerms] = useState(false);

    // Password visibility state
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showSignupPassword, setShowSignupPassword] = useState(false);

    // OTP state
    const [otpMode, setOtpMode] = useState<'email' | 'phone' | null>(null);
    const [otpIdentifier, setOtpIdentifier] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [otpSent, setOtpSent] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        console.log('=== TENTATIVE DE CONNEXION ===');
        console.log('Email:', loginEmail);
        console.log('Password provided:', !!loginPassword);

        if (!loginEmail || !loginPassword) {
            toast({
                title: "Erreur",
                description: "Veuillez remplir tous les champs",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const result = await login(loginEmail, loginPassword);
            setIsLoading(false);

            if (result.success) {
                toast({
                    title: "Connexion réussie",
                    description: "Bienvenue sur ouyaboung !",
                });
                // AuthRedirect component will handle the redirect based on user role
                // No need to manually redirect here
            } else {
                // Gestion des erreurs spécifiques
                let errorMessage = result.error?.message || "Email ou mot de passe incorrect";

                if (result.error?.code === 'NOT_CONFIGURED') {
                    errorMessage = "La configuration du serveur n'est pas disponible. Veuillez contacter le support.";
                } else if (result.error?.code === 'NETWORK_ERROR' || errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
                    errorMessage = "Erreur de connexion. Vérifiez votre connexion internet et que les variables d'environnement Supabase sont correctement configurées.";
                } else if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('invalid_credentials')) {
                    errorMessage = "Email ou mot de passe incorrect";
                } else if (errorMessage.includes('Email not confirmed')) {
                    errorMessage = "Veuillez confirmer votre email avant de vous connecter";
                }

                toast({
                    title: "Erreur de connexion",
                    description: errorMessage,
                    variant: "destructive",
                });
            }
        } catch (err) {
            setIsLoading(false);
            toast({
                title: "Erreur de connexion",
                description: "Une erreur inattendue est survenue. Veuillez réessayer.",
                variant: "destructive",
            });
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!signupEmail || !signupPassword || !firstName || !lastName) {
            toast({
                title: "Erreur",
                description: "Veuillez remplir tous les champs obligatoires",
                variant: "destructive",
            });
            return;
        }

        if (!acceptedTerms) {
            toast({
                title: "Erreur",
                description: "Vous devez accepter les conditions d'utilisation",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const result = await register(signupEmail, signupPassword, {
                fullName: `${firstName} ${lastName}`,
                phone: signupPhone,
                role,
                businessName: role === "merchant" ? businessName : undefined,
            });
            setIsLoading(false);

            if (result.success) {
                // Toujours rediriger vers la page de connexion après inscription
                toast({
                    title: "Inscription réussie",
                    description: "Un email de confirmation a été envoyé. Connectez-vous après confirmation.",
                });
                // Réinitialiser le formulaire
                setSignupEmail("");
                setSignupPassword("");
                setSignupPhone("");
                setFirstName("");
                setLastName("");
                setBusinessName("");
                setAcceptedTerms(false);
                // Rediriger vers la page de connexion
                router.push('/auth');
            } else {
                // Gestion des erreurs spécifiques
                let errorMessage = result.error?.message || "Une erreur est survenue";

                // Messages d'erreur plus conviviaux
                if (result.error?.code === 'NOT_CONFIGURED') {
                    errorMessage = "La configuration du serveur n'est pas disponible. Veuillez contacter le support.";
                } else if (result.error?.code === 'NETWORK_ERROR' || errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
                    errorMessage = "Erreur de connexion. Vérifiez votre connexion internet et que les variables d'environnement Supabase sont correctement configurées.";
                } else if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
                    errorMessage = "Cet email est déjà utilisé. Essayez de vous connecter ou utilisez un autre email.";
                } else if (errorMessage.includes('Password')) {
                    errorMessage = "Le mot de passe doit contenir au moins 6 caractères.";
                }

                toast({
                    title: "Erreur d'inscription",
                    description: errorMessage,
                    variant: "destructive",
                });
            }
        } catch (err) {
            setIsLoading(false);
            toast({
                title: "Erreur d'inscription",
                description: "Une erreur inattendue est survenue. Veuillez réessayer.",
                variant: "destructive",
            });
        }
    };

    const handleOtpLogin = async () => {
        const identifier = otpIdentifier || loginEmail || signupPhone;
        if (!identifier) {
            toast({
                title: "Erreur",
                description: "Veuillez entrer un email ou numéro de téléphone",
                variant: "destructive",
            });
            return;
        }

        const type = identifier.includes("@") ? "email" : "phone";
        setOtpMode(type);
        setOtpIdentifier(identifier);

        const result = await loginWithOtp(identifier, type);
        setIsLoading(false);

        if (result.success) {
            setOtpSent(true);
            toast({
                title: "Code envoyé",
                description: type === "email"
                    ? "Vérifiez votre email pour le code de connexion"
                    : "Vérifiez votre téléphone pour le code de connexion",
            });
        } else {
            toast({
                title: "Erreur",
                description: result.error?.message || "Impossible d'envoyer le code",
                variant: "destructive",
            });
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!otpCode || otpCode.length < 6) {
            toast({
                title: "Erreur",
                description: "Veuillez entrer le code à 6 chiffres",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        const result = await verifyOtpCode(otpIdentifier, otpCode, otpMode || "email");
        setIsLoading(false);

        if (result.success) {
            toast({
                title: "Connexion réussie",
                description: "Bienvenue sur ouyaboung !",
            });
            // Reset OTP state
            setOtpSent(false);
            setOtpCode("");
            setOtpMode(null);
            setOtpIdentifier("");
            // Redirect based on role
            router.push(role === "merchant" ? "/merchant" : "/user");
            router.refresh();
        } else {
            toast({
                title: "Code incorrect",
                description: result.error?.message || "Le code saisi est incorrect",
                variant: "destructive",
            });
        }
    };

    const handleCancelOtp = () => {
        setOtpSent(false);
        setOtpCode("");
        setOtpMode(null);
        setOtpIdentifier("");
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-20">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                {/* Back link */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Retour à l'accueil
                </Link>

                {/* Logo */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                        <Leaf className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <span className="text-2xl font-bold text-foreground">ouyaboung</span>
                </div>

                <Card className="shadow-xl">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl">Bienvenue !</CardTitle>
                        <CardDescription>
                            Connectez-vous ou créez un compte pour commencer
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        {/* Role Selection */}
                        <div className="flex gap-3 mb-6">
                            <button
                                type="button"
                                onClick={() => setRole("user")}
                                className={`flex-1 p-4 rounded-xl border-2 transition-all ${role === "user"
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                                    }`}
                            >
                                <User className={`w-6 h-6 mx-auto mb-2 ${role === "user" ? "text-primary" : "text-muted-foreground"}`} />
                                <p className={`text-sm font-medium ${role === "user" ? "text-primary" : "text-muted-foreground"}`}>
                                    Utilisateur
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setRole("merchant")}
                                className={`flex-1 p-4 rounded-xl border-2 transition-all ${role === "merchant"
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                                    }`}
                            >
                                <Store className={`w-6 h-6 mx-auto mb-2 ${role === "merchant" ? "text-primary" : "text-muted-foreground"}`} />
                                <p className={`text-sm font-medium ${role === "merchant" ? "text-primary" : "text-muted-foreground"}`}>
                                    Commerçant
                                </p>
                            </button>
                        </div>

                        <Tabs defaultValue="login" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-6">
                                <TabsTrigger value="login">Connexion</TabsTrigger>
                                <TabsTrigger value="signup">Inscription</TabsTrigger>
                            </TabsList>

                            {/* Login Tab */}
                            <TabsContent value="login">
                                <form onSubmit={handleLogin} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="login-email">Email</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="login-email"
                                                type="email"
                                                placeholder="votre@email.com"
                                                className="pl-10"
                                                value={loginEmail}
                                                onChange={(e) => setLoginEmail(e.target.value)}
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="login-password">Mot de passe</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="login-password"
                                                type={showLoginPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                className="pl-10 pr-10"
                                                value={loginPassword}
                                                onChange={(e) => setLoginPassword(e.target.value)}
                                                disabled={isLoading}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent z-10"
                                                onClick={() => setShowLoginPassword(!showLoginPassword)}
                                            >
                                                {showLoginPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Checkbox id="remember" />
                                            <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                                                Se souvenir de moi
                                            </Label>
                                        </div>
                                        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                                            Mot de passe oublié ?
                                        </Link>
                                    </div>
                                    <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Connexion...
                                            </>
                                        ) : (
                                            "Se connecter"
                                        )}
                                    </Button>
                                </form>
                            </TabsContent>

                            {/* Signup Tab */}
                            <TabsContent value="signup">
                                <form onSubmit={handleSignup} className="space-y-4">
                                    {role === "merchant" && (
                                        <div className="space-y-2">
                                            <Label htmlFor="business-name">Nom du commerce</Label>
                                            <div className="relative">
                                                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    id="business-name"
                                                    placeholder="Ma Boulangerie"
                                                    className="pl-10"
                                                    value={businessName}
                                                    onChange={(e) => setBusinessName(e.target.value)}
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="first-name">Prénom *</Label>
                                            <div className="relative">
                                                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    id="first-name"
                                                    placeholder="Jean"
                                                    className="pl-10"
                                                    value={firstName}
                                                    onChange={(e) => setFirstName(e.target.value)}
                                                    disabled={isLoading}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="last-name">Nom *</Label>
                                            <div className="relative">
                                                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    id="last-name"
                                                    placeholder="Dupont"
                                                    className="pl-10"
                                                    value={lastName}
                                                    onChange={(e) => setLastName(e.target.value)}
                                                    disabled={isLoading}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-email">Email</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="signup-email"
                                                type="email"
                                                placeholder="votre@email.com"
                                                className="pl-10"
                                                value={signupEmail}
                                                onChange={(e) => setSignupEmail(e.target.value)}
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-phone">Téléphone</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="signup-phone"
                                                type="tel"
                                                placeholder="+241 XX XX XX XX"
                                                className="pl-10"
                                                value={signupPhone}
                                                onChange={(e) => setSignupPhone(e.target.value)}
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="signup-password">Mot de passe</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                id="signup-password"
                                                type={showSignupPassword ? "text" : "password"}
                                                placeholder="••••••••"
                                                className="pl-10 pr-10"
                                                value={signupPassword}
                                                onChange={(e) => setSignupPassword(e.target.value)}
                                                disabled={isLoading}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent z-10"
                                                onClick={() => setShowSignupPassword(!showSignupPassword)}
                                            >
                                                {showSignupPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Checkbox
                                            id="cgu"
                                            className="mt-1"
                                            checked={acceptedTerms}
                                            onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                                        />
                                        <Label htmlFor="cgu" className="text-sm text-muted-foreground cursor-pointer">
                                            J'accepte les{" "}
                                            <Link href="/cgu" className="text-primary hover:underline">
                                                conditions d'utilisation
                                            </Link>{" "}
                                            et la{" "}
                                            <Link href="/privacy" className="text-primary hover:underline">
                                                politique de confidentialité
                                            </Link>
                                        </Label>
                                    </div>
                                    <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Inscription...
                                            </>
                                        ) : (
                                            "Créer mon compte"
                                        )}
                                    </Button>
                                </form>
                            </TabsContent>
                        </Tabs>

                        {!otpSent ? (
                            <>
                                <div className="relative my-6">
                                    <Separator />
                                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                                        ou
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="otp-identifier">
                                            {otpMode === "phone" ? "Numéro de téléphone" : "Email"}
                                        </Label>
                                        <div className="relative">
                                            {otpMode === "phone" ? (
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            ) : (
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            )}
                                            <Input
                                                id="otp-identifier"
                                                type={otpMode === "phone" ? "tel" : "email"}
                                                placeholder={otpMode === "phone" ? "+241 XX XX XX XX" : "votre@email.com"}
                                                className="pl-10"
                                                value={otpIdentifier}
                                                onChange={(e) => {
                                                    setOtpIdentifier(e.target.value);
                                                    setOtpMode(e.target.value.includes("@") ? "email" : "phone");
                                                }}
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full gap-2"
                                        size="lg"
                                        onClick={handleOtpLogin}
                                        disabled={isLoading || !otpIdentifier}
                                    >
                                        <Phone className="w-4 h-4" />
                                        Continuer avec OTP
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="mt-6 space-y-4">
                                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">
                                                Code envoyé
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {otpMode === "email"
                                                    ? `Un code a été envoyé à ${otpIdentifier}`
                                                    : `Un code SMS a été envoyé à ${otpIdentifier}`
                                                }
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={handleCancelOtp}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <form onSubmit={handleVerifyOtp} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="otp-code">Code de vérification</Label>
                                        <Input
                                            id="otp-code"
                                            type="text"
                                            placeholder="000000"
                                            className="text-center text-2xl tracking-widest font-mono"
                                            maxLength={6}
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                                            disabled={isLoading}
                                            autoFocus
                                        />
                                        <p className="text-xs text-muted-foreground text-center">
                                            Entrez le code à 6 chiffres reçu
                                        </p>
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        size="lg"
                                        disabled={isLoading || otpCode.length !== 6}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Vérification...
                                            </>
                                        ) : (
                                            "Vérifier le code"
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full"
                                        onClick={handleCancelOtp}
                                        disabled={isLoading}
                                    >
                                        Annuler
                                    </Button>
                                </form>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default function AuthPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
            <AuthContent />
        </Suspense>
    );
}
