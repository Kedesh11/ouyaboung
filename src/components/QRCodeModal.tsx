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

export default function QRCodeModal({ open, onClose, order }: QRCodeModalProps) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="w-[min(92vw,1100px)] max-h-[88vh] overflow-y-auto p-4 sm:p-6 lg:p-7">
                <DialogHeader>
                    <DialogTitle className="text-center text-lg sm:text-xl">Votre QR Code de Retrait</DialogTitle>
                </DialogHeader>

                <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
                    <div className="space-y-4">
                        {/* QR Code */}
                        <div className="flex justify-center p-4 sm:p-5 bg-white rounded-lg border">
                            <QRCodeSVG
                                value={order.pickup_code}
                                size={240}
                                level="H"
                                includeMargin={true}
                            />
                        </div>

                        {/* Code de retrait (texte) */}
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">Code de retrait</p>
                            <p className="text-sm font-mono bg-white px-2.5 py-1.5 rounded border break-all">
                                {order.pickup_code}
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
