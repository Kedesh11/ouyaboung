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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-center">Votre QR Code de Retrait</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* QR Code */}
                    <div className="flex justify-center p-6 bg-white rounded-lg">
                        <QRCodeSVG 
                            value={order.pickup_code} 
                            size={220}
                            level="H"
                            includeMargin={true}
                        />
                    </div>

                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-900 font-medium mb-2">
                            📱 Comment retirer votre commande ?
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
                    <div className="space-y-3 border-t pt-4">
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
                                <p className="text-sm font-medium">{order.pickupTime || "À convenir"}</p>
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

                    {/* Code de retrait (texte) */}
                    <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Code de retrait</p>
                        <p className="text-xs font-mono bg-white px-2 py-1 rounded border break-all">
                            {order.pickup_code}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                            En cas de problème de scan, communiquez ce code au marchand
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
