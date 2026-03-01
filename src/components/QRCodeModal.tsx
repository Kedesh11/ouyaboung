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
const QR_VISUAL_SIZE = 360;
const QR_LOGO_SIZE = 52;

export default function QRCodeModal({ open, onClose, order }: QRCodeModalProps) {
    const pickupCode = order.pickup_code?.toUpperCase().replace(/[^A-Z0-9]/g, "") || order.id;

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
                                    <QRCodeSVG
                                        value={pickupCode}
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
                                </div>
                            </div>
                            <p className="mt-3 text-center text-xs text-muted-foreground">
                                Montez la luminosite de l&apos;ecran pour un scan plus rapide.
                            </p>
                        </div>

                        {/* Code de retrait (desktop/tablette uniquement) */}
                        <div className="hidden rounded-lg bg-gray-50 p-3 md:block">
                            <p className="text-xs text-muted-foreground mb-1">Code de retrait</p>
                            <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded border break-all">
                                {pickupCode}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                En cas de probleme de scan, communiquez ce code au marchand
                            </p>
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
