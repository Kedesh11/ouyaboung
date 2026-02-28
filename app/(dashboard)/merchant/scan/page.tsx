"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { useDevices } from "@yudiel/react-qr-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    AlertCircle,
    Camera,
    CheckCircle,
    Keyboard,
    Loader2,
    XCircle,
} from "lucide-react";
import { supabaseClient } from "@/api/supabaseClient";
import { callEdgeFunctionWithAuth } from "@/lib/auth/edge-function-client";

const Scanner = dynamic(
    () => import("@yudiel/react-qr-scanner").then((module) => module.Scanner),
    { ssr: false }
);

type ScanMode = "camera" | "manual";

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

const VALIDATION_HARD_TIMEOUT_MS = 12000;

const normalizePickupCode = (value: string): string =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const extractPickupCode = (rawValue: string): string => {
    const trimmed = rawValue.trim();
    if (!trimmed) return "";

    try {
        const url = new URL(trimmed);
        const queryCode = url.searchParams.get("pickup_code") || url.searchParams.get("code");
        if (queryCode) return normalizePickupCode(queryCode);
    } catch {
        // Not a URL payload.
    }

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const parsed = JSON.parse(trimmed) as { pickup_code?: unknown; code?: unknown };
            const rawCode =
                typeof parsed.pickup_code === "string"
                    ? parsed.pickup_code
                    : typeof parsed.code === "string"
                        ? parsed.code
                        : "";
            if (rawCode) return normalizePickupCode(rawCode);
        } catch {
            // Not a JSON payload.
        }
    }

    return normalizePickupCode(trimmed);
};

const isLikelyPickupCode = (value: string): boolean => /^[A-Z0-9]{6,32}$/.test(value);

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

const isFatalCameraError = (err: unknown): boolean => {
    const name = (err as { name?: string })?.name || "";
    return [
        "NotAllowedError",
        "PermissionDeniedError",
        "NotFoundError",
        "DevicesNotFoundError",
        "OverconstrainedError",
    ].includes(name);
};

export default function ScanQRPage() {
    const router = useRouter();
    const devices = useDevices();

    const [mode, setMode] = useState<ScanMode>("camera");
    const [manualCode, setManualCode] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
    const [hasManuallySelectedDevice, setHasManuallySelectedDevice] = useState(false);

    const cameraValidationInFlightRef = useRef(false);
    const lastCameraCodeRef = useRef<{ code: string; at: number } | null>(null);
    const validationRunIdRef = useRef(0);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const pickupCodeFromQuery = new URLSearchParams(window.location.search).get("pickup_code");
        if (!pickupCodeFromQuery) return;

        setMode("manual");
        setManualCode(extractPickupCode(pickupCodeFromQuery));
    }, []);

    useEffect(() => {
        if (!devices.length || hasManuallySelectedDevice) return;
        const preferredDevice = devices.find((device) => /back|rear|environment|arriere/i.test(device.label));
        setSelectedDeviceId(preferredDevice?.deviceId || "");
    }, [devices, hasManuallySelectedDevice]);

    useEffect(() => {
        if (mode !== "camera") return;
        if (isScanning || isValidating || result || cameraError) return;
        setIsScanning(true);
    }, [mode, isScanning, isValidating, result, cameraError]);

    const scannerConstraints = useMemo(() => {
        if (selectedDeviceId) {
            return {
                deviceId: { exact: selectedDeviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            };
        }
        return {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        };
    }, [selectedDeviceId]);

    const validateCode = async (pickupCodeInput: string): Promise<boolean> => {
        const runId = validationRunIdRef.current + 1;
        validationRunIdRef.current = runId;

        const normalizedPickupCode = extractPickupCode(pickupCodeInput);
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
                        (statusCode === 0
                            ? "NETWORK_OR_TIMEOUT"
                            : statusCode === 401
                                ? "UNAUTHORIZED"
                                : statusCode === 403
                                    ? "FORBIDDEN"
                                    : "VALIDATION_ERROR"),
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
                    order: payload.order,
                });
                return true;
            }

            setResult({
                success: false,
                error: payload?.error || "Code invalide ou commande non eligible.",
                code: payload?.code || "VALIDATION_ERROR",
            });
            return false;
        } catch (err) {
            if (validationRunIdRef.current !== runId) return false;
            setResult({
                success: false,
                error: (err as Error).message || "Erreur lors de la validation",
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

    const startCameraScanning = () => {
        setCameraError(null);
        setResult(null);
        lastCameraCodeRef.current = null;
        cameraValidationInFlightRef.current = false;
        setIsScanning(true);
    };

    const stopCameraScanning = () => {
        setIsScanning(false);
    };

    const handleCameraScan = (detectedCodes: IDetectedBarcode[]) => {
        if (!detectedCodes.length || !isScanning || isValidating) return;

        const candidateCode = detectedCodes
            .map((detectedCode) => extractPickupCode(detectedCode.rawValue || ""))
            .find((code) => isLikelyPickupCode(code));
        if (!candidateCode) return;

        const now = Date.now();
        if (cameraValidationInFlightRef.current) return;

        const last = lastCameraCodeRef.current;
        if (last && last.code === candidateCode && now - last.at < 1200) return;

        cameraValidationInFlightRef.current = true;
        lastCameraCodeRef.current = { code: candidateCode, at: now };
        setManualCode(candidateCode);

        void validateCode(candidateCode)
            .then((success) => {
                if (success) {
                    stopCameraScanning();
                }
            })
            .finally(() => {
                cameraValidationInFlightRef.current = false;
            });
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void validateCode(manualCode);
    };

    const handleModeChange = (nextMode: ScanMode) => {
        validationRunIdRef.current = 0;
        setIsValidating(false);
        setResult(null);
        setCameraError(null);
        setMode(nextMode);
        if (nextMode === "camera") {
            setIsScanning(false);
        } else {
            stopCameraScanning();
        }
    };

    const resetScan = () => {
        validationRunIdRef.current = 0;
        setIsValidating(false);
        setResult(null);
        setManualCode("");
        lastCameraCodeRef.current = null;
        cameraValidationInFlightRef.current = false;
        if (mode === "camera") {
            setCameraError(null);
            setIsScanning(false);
        }
    };

    return (
        <div className="container max-w-2xl mx-auto p-4 space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">Scanner QR Code</h1>
                <p className="text-muted-foreground">Validez les commandes de vos clients</p>
            </div>

            <div className="flex gap-2 justify-center">
                <Button
                    variant={mode === "camera" ? "default" : "outline"}
                    disabled={isValidating}
                    onClick={() => handleModeChange("camera")}
                    className="flex items-center gap-2"
                >
                    <Camera className="w-4 h-4" />
                    Scanner
                </Button>
                <Button
                    variant={mode === "manual" ? "default" : "outline"}
                    disabled={isValidating}
                    onClick={() => handleModeChange("manual")}
                    className="flex items-center gap-2"
                >
                    <Keyboard className="w-4 h-4" />
                    Saisie manuelle
                </Button>
            </div>

            {mode === "camera" && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-center">Scanner avec la caméra</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border overflow-hidden bg-black/5">
                            {isScanning ? (
                                <Scanner
                                    onScan={handleCameraScan}
                                    onError={(error) => {
                                        setCameraError(getCameraErrorMessage(error));
                                        if (isFatalCameraError(error)) {
                                            setIsScanning(false);
                                        }
                                    }}
                                    paused={!isScanning || isValidating}
                                    constraints={scannerConstraints}
                                    formats={["qr_code"]}
                                    scanDelay={200}
                                    allowMultiple={true}
                                    components={{
                                        finder: true,
                                        torch: true,
                                        zoom: true,
                                        onOff: false,
                                    }}
                                    styles={{
                                        container: {
                                            width: "100%",
                                            aspectRatio: "1 / 1",
                                            maxHeight: "420px",
                                        },
                                        video: {
                                            objectFit: "cover",
                                        },
                                    }}
                                    sound={true}
                                />
                            ) : (
                                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                                    Appuyez sur "Demarrer le scan" pour ouvrir la caméra.
                                </div>
                            )}
                        </div>

                        {devices.length > 1 && (
                            <div className="space-y-2">
                                <label htmlFor="camera-select" className="text-sm font-medium">
                                    Camera
                                </label>
                                <select
                                    id="camera-select"
                                    className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                                    value={selectedDeviceId}
                                    onChange={(e) => {
                                        setHasManuallySelectedDevice(true);
                                        setSelectedDeviceId(e.target.value);
                                    }}
                                    disabled={isValidating}
                                >
                                    <option value="">Automatique (camera arriere)</option>
                                    {devices.map((device, index) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Camera ${index + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

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
                                <Button variant="destructive" onClick={stopCameraScanning} disabled={isValidating}>
                                    Arrêter
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {mode === "manual" && (
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
                                    "Valider"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {result && (
                <Card className={result.success ? "border-green-500" : "border-red-500"}>
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
