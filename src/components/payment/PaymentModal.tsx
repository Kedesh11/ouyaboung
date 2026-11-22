import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Phone, CheckCircle2, CreditCard, MapPin, ExternalLink, Info } from "lucide-react";
import { initiateAirtelPayment, initiateMoovPayment, PAYMENT_FLOW_ENABLED } from '@/services/payment.service';
import { FeeBreakdownCard } from '@/components/payment/FeeBreakdownCard';
import { useFeeBreakdown } from '@/hooks/useFeeBreakdown';
import { formatXaf } from '@/lib/fees';
import { detectOperator, getAirtelPhoneError, getMoovPhoneError } from '@/lib/phone-validation';
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    orderId: string;
    onSuccess: (transactionId: string) => void;
    merchant?: {
        name?: string;
        address?: string;
        phone?: string;
        latitude?: number | null;
        longitude?: number | null;
    };
}

type Operator = 'AIRTEL' | 'MOOV';

const PaymentModal = ({ isOpen, onClose, amount, orderId, onSuccess, merchant }: PaymentModalProps) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [operator, setOperator] = useState<Operator>('AIRTEL');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const hasCoordinates = Number.isFinite(merchant?.latitude) && Number.isFinite(merchant?.longitude);
    const mapUrl = hasCoordinates
        ? `https://www.google.com/maps?q=${merchant?.latitude},${merchant?.longitude}`
        : null;

    // Détection automatique de l'opérateur selon le numéro
    useEffect(() => {
        const detected = detectOperator(phoneNumber);
        if (detected) {
            setOperator(detected);
        }
    }, [phoneNumber]);

    // Detail de ce que paie le client, calcule par le serveur avec les taux fixes par l'admin
    // (commission plateforme, frais PVIT, frais de l'operateur choisi). Le marchand recoit le prix en entier.
    const feeQuery = useFeeBreakdown({
        flow: 'order',
        baseAmount: amount,
        operator: operator === 'AIRTEL' ? 'airtel' : 'moov',
        enabled: isOpen && PAYMENT_FLOW_ENABLED,
    });
    const breakdown = feeQuery.data;

    const handlePayment = async () => {
        if (!PAYMENT_FLOW_ENABLED) {
            onClose();
            return;
        }

        if (!phoneNumber) {
            toast.error("Veuillez entrer un numéro de téléphone");
            return;
        }

        const phoneError = operator === 'AIRTEL'
            ? getAirtelPhoneError(phoneNumber)
            : getMoovPhoneError(phoneNumber);

        if (phoneError) {
            toast.error(phoneError);
            return;
        }

        setIsLoading(true);
        try {
            const paymentFn = operator === 'AIRTEL' ? initiateAirtelPayment : initiateMoovPayment;

            const result = await paymentFn({
                baseAmount: amount,
                phone: phoneNumber,
                orderId: orderId,
            });

            if (result.success && result.data) {
                setSuccess(true);
                toast.success(result.data.message);
                setTimeout(() => {
                    onSuccess(result.data!.transactionId);
                    onClose();
                }, 2000);
            } else {
                toast.error(result.error?.message || "Échec du paiement");
            }
        } catch (error) {
            toast.error("Une erreur est survenue");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {PAYMENT_FLOW_ENABLED ? (
                            <>
                                <CreditCard className="w-5 h-5" />
                                Paiement Mobile Money
                            </>
                        ) : (
                            <>
                                <Info className="w-5 h-5" />
                                Paiement indisponible
                            </>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {!PAYMENT_FLOW_ENABLED ? (
                    <div className="flex flex-col gap-4 py-4">
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                            Le paiement en ligne est momentanement indisponible. Votre reservation est conservee: reessayez plus tard ou contactez le marchand.
                        </div>

                        <div className="rounded-md border bg-muted/40 p-4 space-y-2">
                            <p className="text-sm text-muted-foreground">Montant de la commande</p>
                            <p className="text-2xl font-bold text-primary">{amount.toLocaleString()} XAF</p>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <div>
                                <p className="text-xs text-muted-foreground">Marchand</p>
                                <p className="font-medium">{merchant?.name || 'Marchand'}</p>
                            </div>

                            <div className="flex items-start gap-2 text-sm">
                                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                <span>{merchant?.address || 'Adresse indisponible'}</span>
                            </div>

                            <div className="flex items-start gap-2 text-sm">
                                <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                <span>{merchant?.phone || 'Telephone indisponible'}</span>
                            </div>

                            {hasCoordinates && (
                                <div className="rounded-md bg-background p-2 text-xs text-muted-foreground">
                                    Coordonnees: {merchant?.latitude}, {merchant?.longitude}
                                </div>
                            )}

                            {mapUrl && (
                                <Button type="button" variant="outline" className="w-full" asChild>
                                    <a href={mapUrl} target="_blank" rel="noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Ouvrir la position
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>
                ) : !success ? (
                    <div className="flex flex-col gap-6 py-4">
                        {/* Detail des prelevements: marchand, plateforme, PVIT, operateur */}
                        <FeeBreakdownCard
                            breakdown={breakdown}
                            recipientLabel={merchant?.name || 'le marchand'}
                            loading={feeQuery.isPending && feeQuery.fetchStatus !== 'idle'}
                            error={feeQuery.isError ? 'Impossible de calculer les frais pour le moment. Réessayez dans un instant.' : null}
                        />

                        {/* Operator Selection */}
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant={operator === 'AIRTEL' ? 'default' : 'outline'}
                                className={cn(
                                    "h-12 flex flex-col items-center justify-center gap-1",
                                    operator === 'AIRTEL' && "bg-red-600 hover:bg-red-700 text-white border-none"
                                )}
                                onClick={() => setOperator('AIRTEL')}
                            >
                                <span className="font-bold">Airtel Money</span>
                            </Button>
                            <Button
                                type="button"
                                variant={operator === 'MOOV' ? 'default' : 'outline'}
                                className={cn(
                                    "h-12 flex flex-col items-center justify-center gap-1",
                                    operator === 'MOOV' && "bg-blue-600 hover:bg-blue-700 text-white border-none"
                                )}
                                onClick={() => setOperator('MOOV')}
                            >
                                <span className="font-bold">Libertis/Moov</span>
                            </Button>
                        </div>

                        {/* Phone Number */}
                        <div className="grid gap-2">
                            <Label htmlFor="phone">Numéro {operator === 'AIRTEL' ? 'Airtel' : 'Libertis/Moov'} Money</Label>
                            <div className="relative">
                                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="phone"
                                    placeholder={operator === 'AIRTEL' ? "77157904 ou 074787355" : "62053671 ou 066282310"}
                                    className="pl-9"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Prefixes acceptes: {operator === 'AIRTEL' ? '74, 77, 76' : '66, 62, 65'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
                        <div className="rounded-full bg-green-100 p-3">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Paiement Initié !</h3>
                            <p className="text-muted-foreground">Validez la notification USSD sur votre téléphone puis saisissez votre code secret pour confirmer le paiement.</p>
                        </div>
                    </div>
                )}

                <DialogFooter className="sm:justify-start">
                    {!PAYMENT_FLOW_ENABLED && (
                        <Button type="button" onClick={onClose} className="w-full">
                            J&apos;ai compris
                        </Button>
                    )}
                    {PAYMENT_FLOW_ENABLED && !success && (
                        <Button
                            type="button"
                            onClick={handlePayment}
                            disabled={isLoading || !breakdown}
                            className={cn(
                                "w-full text-white",
                                operator === 'AIRTEL' ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                            )}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {breakdown ? `Payer ${formatXaf(breakdown.total_amount)}` : 'Calcul du total…'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default PaymentModal;
