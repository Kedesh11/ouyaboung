"use client";

import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { supabaseClient } from "@/api/supabaseClient";
import { callEdgeFunctionWithAuth } from "@/lib/auth/edge-function-client";

type ScanMode = 'camera' | 'manual';

interface ValidationResult {
    success: boolean;
    message?: string;
    error?: string;
    code?: string;
    order?: {
        id: string;
        productName: string;
        quantity: number;
        totalPrice: number;
        customerName: string;
        customerPhone: string;
        confirmedAt: string;
        consumedAt: string;
    };
}

type ValidateQrApiResponse = ValidationResult & {
    error?: string;
    code?: string;
};

const extractPickupCode = (rawValue: string): string => {
    const trimmed = rawValue.trim();
    if (!trimmed) return "";

    // Support QR payload as URL: /merchant/scan?pickup_code=ABC123
    try {
        const url = new URL(trimmed);
        const queryCode = url.searchParams.get("pickup_code") || url.searchParams.get("code");
        if (queryCode) {
            return queryCode.replace(/\s+/g, "").toUpperCase();
        }
    } catch {
        // not a URL, continue
    }

    // Support JSON payload: {"pickup_code":"ABC123"}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const parsed = JSON.parse(trimmed) as { pickup_code?: unknown; code?: unknown };
            const rawCode =
                typeof parsed.pickup_code === "string"
                    ? parsed.pickup_code
                    : typeof parsed.code === "string"
                        ? parsed.code
                        : "";
            if (rawCode) {
                return rawCode.replace(/\s+/g, "").toUpperCase();
            }
        } catch {
            // not valid JSON payload, continue
        }
    }

    return trimmed.replace(/\s+/g, "").toUpperCase();
};

const isLikelyPickupCode = (value: string): boolean => /^[A-Z0-9]{6,32}$/.test(value);
const VALIDATION_HARD_TIMEOUT_MS = 12000;

export default function ScanQRPage() {
    const router = useRouter();
    const [mode, setMode] = useState<ScanMode>('camera');
    const [manualCode, setManualCode] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const scannerInitialized = useRef(false);
    const cameraValidationInFlightRef = useRef(false);
    const lastCameraCodeRef = useRef<{ code: string; at: number } | null>(null);
    const validationRunIdRef = useRef(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const pickupCodeFromQuery = new URLSearchParams(window.location.search).get('pickup_code');
        if (!pickupCodeFromQuery) return;

        setMode('manual');
        setManualCode(extractPickupCode(pickupCodeFromQuery));
    }, []);

    // Initialize camera scanner
    useEffect(() => {
        if (mode === 'camera' && !scannerInitialized.current) {
            const scanner = new Html5Qrcode("qr-reader");
            scannerRef.current = scanner;
            scannerInitialized.current = true;
        }
    }, [mode]);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => undefined);
            }
        };
    }, []);

    const getCameraErrorMessage = (err: unknown): string => {
        const name = (err as { name?: string })?.name || "";

        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            return "Acces camera refuse. Autorisez la camera dans le navigateur puis reessayez.";
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
            return "Aucune camera detectee sur cet appareil.";
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
            return "Camera deja utilisee par une autre application. Fermez-la puis reessayez.";
        }
        if (name === "OverconstrainedError") {
            return "Configuration camera non compatible. Essayez avec une autre camera.";
        }
        if (name === "AbortError") {
            return "Le demarrage de la camera a ete interrompu. Reessayez.";
        }
        return "Impossible d'acceder a la camera. Verifiez les permissions.";
    };

    const requestCameraPermission = async (): Promise<boolean> => {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            setCameraError("La camera requiert une connexion securisee (HTTPS).");
            return false;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setCameraError("Votre navigateur ne supporte pas l'acces camera.");
            return false;
        }

        try {
            // Explicitly trigger permission prompt before starting QR scanner.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false,
            });
            stream.getTracks().forEach((track) => track.stop());
            return true;
        } catch (err) {
            setCameraError(getCameraErrorMessage(err));
            return false;
        }
    };

    const startCameraScanning = async () => {
        if (!scannerRef.current || isScanning || isValidating) return;

        try {
            setCameraError(null);
            setResult(null);

            const hasPermission = await requestCameraPermission();
            if (!hasPermission) {
                return;
            }

            const cameras = await Html5Qrcode.getCameras();
            if (!cameras.length) {
                setCameraError("Aucune camera detectee. Verifiez votre appareil puis reessayez.");
                return;
            }

            const preferredCameraId =
                cameras.find((camera) => /back|rear|environment|arriere/i.test(camera.label))?.id ??
                cameras[0].id;

            await scannerRef.current.start(
                preferredCameraId,
                {
                    fps: 18,
                    qrbox: { width: 300, height: 300 }
                },
                (decodedText) => {
                    const candidateCode = extractPickupCode(decodedText);
                    if (!isLikelyPickupCode(candidateCode)) {
                        return;
                    }

                    const now = Date.now();
                    if (cameraValidationInFlightRef.current) {
                        return;
                    }

                    const last = lastCameraCodeRef.current;
                    if (last && last.code === candidateCode && now - last.at < 1200) {
                        return;
                    }

                    cameraValidationInFlightRef.current = true;
                    lastCameraCodeRef.current = { code: candidateCode, at: now };
                    setManualCode(candidateCode);

                    void validateCode(candidateCode)
                        .then((success) => {
                            if (success) {
                                void stopCameraScanning();
                            }
                        })
                        .finally(() => {
                            cameraValidationInFlightRef.current = false;
                        });
                },
                (errorMessage) => {
                    // Scanning error (ignore, these are normal during scanning)
                }
            );
            setIsScanning(true);
        } catch (err) {
            console.error("[Scan] Camera error:", err);
            setCameraError(getCameraErrorMessage(err));
            setIsScanning(false);
        }
    };

    const stopCameraScanning = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (err) {
                const stopMessage = (err as Error)?.message?.toLowerCase() || "";
                if (!stopMessage.includes("not running")) {
                    console.error("[Scan] Stop error:", err);
                }
            } finally {
                setIsScanning(false);
            }
        }
    };

    const validateCode = async (pickup_code: string): Promise<boolean> => {
        const runId = validationRunIdRef.current + 1;
        validationRunIdRef.current = runId;

        const normalizedPickupCode = extractPickupCode(pickup_code);
        if (!normalizedPickupCode) return false;

        if (!isLikelyPickupCode(normalizedPickupCode)) {
            setResult({
                success: false,
                error: "Format de code invalide. Utilisez un code alphanumerique (6+ caracteres).",
                code: "INVALID_CODE_FORMAT",
            });
            return false;
        }

        setIsValidating(true);
        setResult(null);
        const timeoutId = setTimeout(() => {
            if (validationRunIdRef.current !== runId) return;
            validationRunIdRef.current = 0;
            setIsValidating(false);
            setResult({
                success: false,
                error: "La validation prend trop de temps. Verifiez la connexion puis reessayez.",
                code: "VALIDATION_TIMEOUT",
            });
        }, VALIDATION_HARD_TIMEOUT_MS);

        try {
            const isRunActive = () => validationRunIdRef.current === runId;

            if (!supabaseClient) {
                throw new Error("Supabase client not initialized");
            }

            const edgeResult = await callEdgeFunctionWithAuth<ValidateQrApiResponse>({
                functionName: "validate-qr",
                body: { pickup_code: normalizedPickupCode },
                retryOnUnauthorized: true,
                timeoutMs: 9000,
            });
            if (!isRunActive()) return false;

            if (!edgeResult.ok) {
                const statusCode = edgeResult.status;
                const defaultError =
                    statusCode === 0
                        ? "La validation a expire (timeout) ou la connexion est indisponible."
                        : statusCode === 401
                        ? "Acces non autorise. Reconnectez-vous puis reessayez."
                        : statusCode === 403
                            ? "Compte marchand non autorise pour valider cette commande."
                            : "Erreur lors de la validation du code.";

                setResult({
                    success: false,
                    error: edgeResult.error?.error || edgeResult.error?.message || defaultError,
                    code:
                        edgeResult.error?.code ||
                        (
                            statusCode === 0
                                ? "NETWORK_OR_TIMEOUT"
                                : statusCode === 401
                                    ? "UNAUTHORIZED"
                                    : statusCode === 403
                                        ? "FORBIDDEN"
                                        : "VALIDATION_ERROR"
                        ),
                });
                if (statusCode === 401) {
                    router.push("/auth?role=merchant&redirect=/merchant/scan");
                }
                return false;
            }

            const payload = edgeResult.data;

            if (payload?.success) {
                setResult({
                    success: true,
                    message: payload.message,
                    order: payload.order
                });
                return true;
            } else {
                setResult({
                    success: false,
                    error: payload?.error || "Code invalide ou commande non eligible.",
                    code: payload?.code || "VALIDATION_ERROR"
                });
                return false;
            }
        } catch (err) {
            console.error("[Scan] Validation error:", err);
            if (validationRunIdRef.current !== runId) return false;
            setResult({
                success: false,
                error: (err as Error).message || "Erreur lors de la validation"
            });
            return false;
        } finally {
            clearTimeout(timeoutId);
            if (validationRunIdRef.current === runId) {
                validationRunIdRef.current = 0;
                setIsValidating(false);
            }
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void validateCode(manualCode);
    };

    const resetScan = () => {
        validationRunIdRef.current = 0;
        setIsValidating(false);
        setResult(null);
        setManualCode('');
        lastCameraCodeRef.current = null;
        cameraValidationInFlightRef.current = false;
        if (mode === 'camera' && !isScanning) {
            startCameraScanning();
        }
    };

    return (
        <div className="container max-w-2xl mx-auto p-4 space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">Scanner QR Code</h1>
                <p className="text-muted-foreground">Validez les commandes de vos clients</p>
            </div>

            {/* Mode Selection */}
            <div className="flex gap-2 justify-center">
                <Button
                    variant={mode === 'camera' ? 'default' : 'outline'}
                    disabled={isValidating}
                    onClick={() => {
                        validationRunIdRef.current = 0;
                        setMode('camera');
                        setResult(null);
                        if (isScanning) stopCameraScanning();
                    }}
                    className="flex items-center gap-2"
                >
                    <Camera className="w-4 h-4" />
                    Scanner
                </Button>
                <Button
                    variant={mode === 'manual' ? 'default' : 'outline'}
                    disabled={isValidating}
                    onClick={() => {
                        validationRunIdRef.current = 0;
                        setMode('manual');
                        setResult(null);
                        if (isScanning) stopCameraScanning();
                    }}
                    className="flex items-center gap-2"
                >
                    <Keyboard className="w-4 h-4" />
                    Saisie manuelle
                </Button>
            </div>

            {/* Camera Mode */}
            {mode === 'camera' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-center">Scanner avec la caméra</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* QR Reader Container */}
                        <div id="qr-reader" className="rounded-lg overflow-hidden border" />

                        {isValidating && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 flex items-start gap-2">
                                <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin" />
                                <p>Validation du code en cours. Gardez le QR Code visible quelques secondes.</p>
                            </div>
                        )}

                        {cameraError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <p>{cameraError}</p>
                            </div>
                        )}

                        <div className="flex justify-center">
                            {!isScanning ? (
                                <Button onClick={startCameraScanning} disabled={isValidating}>
                                    <Camera className="w-4 h-4 mr-2" />
                                    Démarrer le scan
                                </Button>
                            ) : (
                                <Button variant="destructive" onClick={stopCameraScanning}>
                                    Arrêter
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Manual Mode */}
            {mode === 'manual' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-center">Saisir le code manuellement</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <Input
                                type="text"
                                placeholder="Ex: ABC123"
                                value={manualCode}
                                onChange={(e) => setManualCode(extractPickupCode(e.target.value))}
                                className="font-mono"
                                disabled={isValidating}
                            />
                            <Button type="submit" className="w-full" disabled={isValidating || !manualCode.trim()}>
                                {isValidating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Validation...
                                    </>
                                ) : (
                                    'Valider'
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Validation Result */}
            {result && (
                <Card className={result.success ? 'border-green-500' : 'border-red-500'}>
                    <CardContent className="p-6">
                        {result.success ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-center gap-2 text-green-600">
                                    <CheckCircle className="w-8 h-8" />
                                    <h2 className="text-2xl font-bold">Commande Validée !</h2>
                                </div>

                                {result.order && (
                                    <div className="space-y-2 bg-green-50 rounded-lg p-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Produit</p>
                                            <p className="font-semibold">{result.order.productName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Client</p>
                                            <p className="font-semibold">{result.order.customerName}</p>
                                            <p className="text-sm text-muted-foreground">{result.order.customerPhone}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Montant</p>
                                            <p className="text-xl font-bold text-green-600">{result.order.totalPrice} FCFA</p>
                                        </div>
                                    </div>
                                )}

                                <Button onClick={resetScan} className="w-full">
                                    Scanner un autre code
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-center gap-2 text-red-600">
                                    <XCircle className="w-8 h-8" />
                                    <h2 className="text-2xl font-bold">Échec de Validation</h2>
                                </div>

                                <div className="bg-red-50 rounded-lg p-4">
                                    <p className="text-red-800 font-medium">{result.error}</p>
                                    {result.code && (
                                        <p className="text-xs text-red-600 mt-2">Code: {result.code}</p>
                                    )}
                                </div>

                                <Button onClick={resetScan} variant="outline" className="w-full">
                                    Réessayer
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
