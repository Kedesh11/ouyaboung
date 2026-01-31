import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Phone, CheckCircle2, CreditCard } from "lucide-react";
import { initiateAirtelPayment, initiateMoovPayment } from '@/services/payment.service';
import { calculatePaymentFees, type PaymentFees } from '@/lib/payment-fees';
import { detectOperator, getAirtelPhoneError, getMoovPhoneError } from '@/lib/phone-validation';
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    orderId: string;
    onSuccess: (transactionId: string) => void;
}

type Operator = 'AIRTEL' | 'MOOV';

const PaymentModal = ({ isOpen, onClose, amount, orderId, onSuccess }: PaymentModalProps) => {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [operator, setOperator] = useState<Operator>('AIRTEL');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [fees, setFees] = useState<PaymentFees | null>(null);

    // Détection automatique de l'opérateur selon le numéro
    useEffect(() => {
        const detected = detectOperator(phoneNumber);
        if (detected) {
            setOperator(detected);
        }
    }, [phoneNumber]);

    useEffect(() => {
        if (amount) {
            setFees(calculatePaymentFees(amount));
        }
    }, [amount]);

    const handlePayment = async () => {
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
                        <CreditCard className="w-5 h-5" />
                        Paiement Mobile (Q-Gabon)
                    </DialogTitle>
                </DialogHeader>

                {!success ? (
                    <div className="flex flex-col gap-6 py-4">
                        {/* Summary & Fees */}
                        {fees && (
                            <div className="bg-muted p-4 rounded-lg space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Panier/Commande:</span>
                                    <span>{fees.baseAmount.toLocaleString()} XAF</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Frais Opérateur (3%):</span>
                                    <span>{fees.airtelFees.toLocaleString()} XAF</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Frais PVIT (3%):</span>
                                    <span>{fees.pvitFees.toLocaleString()} XAF</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Frais App (3%):</span>
                                    <span>{fees.appFees.toLocaleString()} XAF</span>
                                </div>
                                <div className="border-t border-border mt-2 pt-2 flex justify-between font-bold text-lg">
                                    <span>Total à payer:</span>
                                    <span className="text-primary">{fees.finalAmount.toLocaleString()} XAF</span>
                                </div>
                            </div>
                        )}

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
                                <span className="font-bold">Moov Money</span>
                            </Button>
                        </div>

                        {/* Phone Number */}
                        <div className="grid gap-2">
                            <Label htmlFor="phone">Numéro {operator === 'AIRTEL' ? 'Airtel' : 'Moov'} Money</Label>
                            <div className="relative">
                                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="phone"
                                    placeholder={operator === 'AIRTEL' ? "07 xx xx xx" : "06 xx xx xx"}
                                    className="pl-9"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Format: {operator === 'AIRTEL' ? '07' : '06'}xxxxxx (9 chiffres total)
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
                            <p className="text-muted-foreground">Validez la notification USSD sur votre téléphone.</p>
                        </div>
                    </div>
                )}

                <DialogFooter className="sm:justify-start">
                    {!success && fees && (
                        <Button
                            type="button"
                            onClick={handlePayment}
                            disabled={isLoading}
                            className={cn(
                                "w-full text-white",
                                operator === 'AIRTEL' ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                            )}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Payer {fees.finalAmount.toLocaleString()} XAF
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default PaymentModal;
