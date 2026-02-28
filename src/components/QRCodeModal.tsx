"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { MapPin, Package, CreditCard, Clock } from "lucide-react";

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

export default function QRCodeModal({ open, onClose, order }: QRCodeModalProps) {
    const pickupCode = order.pickup_code?.toUpperCase().replace(/[^A-Z0-9]/g, "") || order.id;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="w-[min(94vw,1210px)] max-h-[88vh] overflow-y-auto p-4 sm:p-6 lg:p-7">
                <DialogHeader>
                    <DialogTitle className="text-center text-lg sm:text-xl">Votre QR Code de Retrait</DialogTitle>
                </DialogHeader>

                <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
                    <div className="space-y-4">
                        {/* QR Code */}
                        <div className="flex flex-col items-center rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                            <div className="rounded-xl bg-white p-2 sm:p-3">
                                <QRCodeSVG
                                    value={pickupCode}
                                    size={300}
                                    level="H"
                                    fgColor="#153D40"
                                    bgColor="#FFFFFF"
                                    marginSize={6}
                                    boostLevel={true}
                                    imageSettings={{
                                        src: QR_CENTER_BADGE_SRC,
                                        width: 62,
                                        height: 62,
                                        excavate: true,
                                    }}
                                />
                            </div>
                            <p className="mt-3 text-center text-xs text-muted-foreground">
                                Montez la luminosite de l&apos;ecran pour un scan plus rapide.
                            </p>
                        </div>

                        {/* Code de retrait (texte) */}
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">Code de retrait</p>
                            <p className="text-sm font-mono bg-white px-2.5 py-1.5 rounded border break-all">
                                {pickupCode}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                En cas de probleme de scan, communiquez ce code au marchand
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Instructions */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-900 font-medium mb-2">
                                Comment retirer votre commande
                            </p>
                            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                                <li>Rendez-vous chez le marchand</li>
                                <li>Reglez votre commande sur place</li>
                                <li>Presentez ce QR Code au marchand</li>
                                <li>Le scan confirme le paiement et le retrait</li>
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
                                    <p className="text-xs text-muted-foreground">Montant a regler sur place</p>
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
