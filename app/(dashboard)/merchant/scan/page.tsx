"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { supabaseClient } from "@/api/supabaseClient";

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

export default function ScanQRPage() {
    const searchParams = useSearchParams();
    const [mode, setMode] = useState<ScanMode>('camera');
    const [manualCode, setManualCode] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const scannerInitialized = useRef(false);

    useEffect(() => {
        const pickupCodeFromQuery = searchParams.get('pickup_code');
        if (!pickupCodeFromQuery) return;

        setMode('manual');
        setManualCode(pickupCodeFromQuery);
    }, [searchParams]);

    // Initialize camera scanner
    useEffect(() => {
        if (mode === 'camera' && !scannerInitialized.current) {
            const scanner = new Html5Qrcode("qr-reader");
            scannerRef.current = scanner;
            scannerInitialized.current = true;
        }

        return () => {
            // Cleanup on unmount
            if (scannerRef.current && isScanning) {
                scannerRef.current.stop().catch(console.error);
            }
        };
    }, [mode]);

    const startCameraScanning = async () => {
        if (!scannerRef.current) return;

        try {
            setCameraError(null);
            setResult(null);
            setIsScanning(true);

            await scannerRef.current.start(
                { facingMode: "environment" }, // Use back camera
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    // QR Code detected
                    console.log("[Scan] QR Code detected:", decodedText);
                    validateCode(decodedText);
                    stopCameraScanning();
                },
                (errorMessage) => {
                    // Scanning error (ignore, these are normal during scanning)
                }
            );
        } catch (err) {
            console.error("[Scan] Camera error:", err);
            setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
            setIsScanning(false);
        }
    };

    const stopCameraScanning = async () => {
        if (scannerRef.current && isScanning) {
            try {
                await scannerRef.current.stop();
                setIsScanning(false);
            } catch (err) {
                console.error("[Scan] Stop error:", err);
            }
        }
    };

    const validateCode = async (pickup_code: string) => {
        if (!pickup_code.trim()) return;

        setIsValidating(true);
        setResult(null);

        try {
            if (!supabaseClient) {
                throw new Error("Supabase client not initialized");
            }

            // Get auth token
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                throw new Error("Non authentifié");
            }

            // Call validate-qr API
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/validate-qr`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ pickup_code })
                }
            );

            const data = await response.json();

            if (data.success) {
                setResult({
                    success: true,
                    message: data.message,
                    order: data.order
                });
            } else {
                setResult({
                    success: false,
                    error: data.error,
                    code: data.code
                });
            }
        } catch (err) {
            console.error("[Scan] Validation error:", err);
            setResult({
                success: false,
                error: (err as Error).message || "Erreur lors de la validation"
            });
        } finally {
            setIsValidating(false);
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        validateCode(manualCode);
    };

    const resetScan = () => {
        setResult(null);
        setManualCode('');
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
                    onClick={() => {
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
                    onClick={() => {
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
                                placeholder="QR_abc123..."
                                value={manualCode}
                                onChange={(e) => setManualCode(e.target.value)}
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
