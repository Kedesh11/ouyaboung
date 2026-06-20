"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { MapPin, Package, CreditCard, Clock, Check, Copy } from "lucide-react";

interface QRCodeModalProps {
    open: boolean;
    onClose: () => void;
    order: {
        id: string;
        pickup_code: string;
        productName: string;
        merchantName: string;
        merchantAddress: string;
        totalPrice: number;
        pickupTime: string;
        confirmedAt: string;
    };
}

const QR_CENTER_BADGE_SRC = "/icons/qr-center-badge.svg";
const QR_VISUAL_SIZE = 360;
const QR_LOGO_SIZE = 44;

const normalizePickupCode = (value: string): string =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const formatPickupCode = (value: string): string =>
    value.replace(/(.{4})/g, "$1 ").trim();

export default function QRCodeModal({ open, onClose, order }: QRCodeModalProps) {
    const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

    const pickupCode = useMemo(() => {
        const explicitPickupCode = normalizePickupCode(order.pickup_code || "");
        if (explicitPickupCode) return explicitPickupCode;
        return normalizePickupCode(order.id || "");
    }, [order.id, order.pickup_code]);

    const usesFallbackReference = !normalizePickupCode(order.pickup_code || "");
    const displayPickupCode = pickupCode ? formatPickupCode(pickupCode) : "INDISPONIBLE";
    const qrPayload = pickupCode
        ? JSON.stringify({
            type: "ouyaboung_pickup",
            pickup_code: pickupCode,
            order_id: order.id,
        })
        : "";

    useEffect(() => {
        if (copyState === "idle") return;
        const timeoutId = window.setTimeout(() => setCopyState("idle"), 1800);
        return () => window.clearTimeout(timeoutId);
    }, [copyState]);

    const handleCopyCode = async () => {
        if (!pickupCode) return;
        try {
            await navigator.clipboard.writeText(pickupCode);
            setCopyState("copied");
        } catch {
            setCopyState("error");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="w-[94vw] max-h-[88vh] overflow-y-auto p-4 sm:p-6 md:w-[75vw] md:max-w-[75vw] lg:p-7">
                <DialogHeader>
                    <DialogTitle className="text-center text-lg sm:text-xl">Votre QR Code de Retrait</DialogTitle>
                </DialogHeader>

                <div className="md:grid md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:items-start md:gap-6">
                    <div className="mx-auto w-full max-w-[420px] space-y-4 md:mx-0 md:max-w-[340px] md:min-w-0">
                        {/* QR Code */}
                        <div className="flex flex-col items-center rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                            <div className="w-full rounded-2xl bg-slate-100/90 p-3 sm:p-4">
                                <div className="mx-auto w-full max-w-[332px] rounded-xl bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 sm:p-4">
                                    {pickupCode ? (
                                        <QRCodeSVG
                                            value={qrPayload}
                                            size={QR_VISUAL_SIZE}
                                            level="H"
                                            fgColor="#153D40"
                                            bgColor="#FFFFFF"
                                            marginSize={8}
                                            boostLevel={true}
                                            title="QR Code de retrait"
                                            className="mx-auto h-auto w-full max-w-[300px]"
                                            imageSettings={{
                                                src: QR_CENTER_BADGE_SRC,
                                                width: QR_LOGO_SIZE,
                                                height: QR_LOGO_SIZE,
                                                excavate: true,
                                            }}
                                        />
                                    ) : (
                                        <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-600">
                                            Code de retrait indisponible.
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="mt-3 text-center text-xs text-muted-foreground">
                                Montez la luminosite de l&apos;ecran pour un scan plus rapide.
                            </p>
                        </div>

                        <div className="rounded-lg bg-gray-50 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">Code de retrait</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopyCode}
                                    className="h-7 px-2 text-xs"
                                    disabled={!pickupCode}
                                >
                                    {copyState === "copied" ? (
                                        <>
                                            <Check className="mr-1 h-3.5 w-3.5" />
                                            Copie
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="mr-1 h-3.5 w-3.5" />
                                            Copier
                                        </>
                                    )}
                                </Button>
                            </div>
                            <p className="rounded border bg-white px-2.5 py-1.5 font-mono text-sm tracking-[0.08em] text-black break-all">
                                {displayPickupCode}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {usesFallbackReference
                                    ? "Ce code est base sur la reference commande. Donnez-le au marchand en cas de scan impossible."
                                    : "En cas de probleme de scan, communiquez ce code au marchand."}
                            </p>
                            {copyState === "error" && (
                                <p className="mt-1 text-xs text-red-600">
                                    Copie automatique indisponible sur ce navigateur.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="hidden space-y-4 md:block md:min-w-0">
                        {/* Instructions */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-900 font-medium mb-2">
                                Comment retirer votre commande
                            </p>
                            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                                <li>Rendez-vous chez le marchand</li>
                                <li>Verifiez que le paiement est confirme</li>
                                <li>Presentez ce QR Code au marchand</li>
                                <li>Le scan valide le retrait</li>
                                <li>Recuperez votre commande</li>
                            </ol>
                        </div>

                        {/* Order Details */}
                        <div className="space-y-3 border rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <Package className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground">Produit</p>
                                    <p className="text-sm font-medium">{order.productName}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground">Marchand</p>
                                    <p className="text-sm font-medium">{order.merchantName}</p>
                                    <p className="text-xs text-muted-foreground">{order.merchantAddress}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground">Heure de retrait</p>
                                    <p className="text-sm font-medium">{order.pickupTime || "A convenir"}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <CreditCard className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground">Montant paye</p>
                                    <p className="text-sm font-medium">{order.totalPrice} FCFA</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
