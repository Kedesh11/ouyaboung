'use client';

import { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function InstallPrompt() {
  const { isInstallable, isInstalled, promptInstall, isIOS } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if user already dismissed the prompt
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
    } else {
      const installed = await promptInstall();
      if (installed) {
        setIsDismissed(true);
      }
    }
  };

  if (isInstalled || isDismissed || !isInstallable) {
    return null;
  }

  if (showIOSInstructions) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
        <Card className="w-full max-w-md bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Installer Ouyaboung</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowIOSInstructions(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Pour installer l'application sur iOS :</p>
            <ol className="space-y-2 pl-4">
              <li className="flex items-start gap-2">
                <span className="font-semibold">1.</span>
                <span>
                  Appuyez sur le bouton <Share className="inline h-4 w-4" /> Partager
                  en bas de l'écran
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold">2.</span>
                <span>Faites défiler et sélectionnez "Sur l'écran d'accueil"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold">3.</span>
                <span>Appuyez sur "Ajouter"</span>
              </li>
            </ol>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 sm:left-auto sm:right-4 sm:max-w-md">
      <Card className="bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Download className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Installer Ouyaboung</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Installez l'app pour un accès rapide et une meilleure expérience
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={handleInstall} size="sm" className="flex-1">
                Installer
              </Button>
              <Button
                onClick={handleDismiss}
                variant="outline"
                size="sm"
                className="flex-shrink-0"
              >
                Plus tard
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
