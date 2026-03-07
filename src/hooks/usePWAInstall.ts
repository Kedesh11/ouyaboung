'use client';

import { useState, useEffect } from 'react';
import { tracker } from '@/lib/tracking/tracker';
import { EventType } from '@/lib/tracking/types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed') === 'true';
    const installTrackedKey = 'pwa-install-tracked-v1';

    const trackInstallIfNeeded = (source: 'standalone_detected' | 'appinstalled_event') => {
      if (localStorage.getItem(installTrackedKey) === 'true') return;
      tracker.track(EventType.CUSTOM, {
        category: 'pwa',
        action: 'app_installed',
        source,
      });
      localStorage.setItem(installTrackedKey, 'true');
    };

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      trackInstallIfNeeded('standalone_detected');
    }

    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator as any).standalone;

    if (isInStandaloneMode) {
      setIsInstalled(true);
      trackInstallIfNeeded('standalone_detected');
    }
    
    if (!dismissed && isIOS && !isInStandaloneMode) {
      setIsInstallable(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      if (dismissed) return;
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setIsInstallable(true);
      tracker.track(EventType.CUSTOM, {
        category: 'pwa',
        action: 'install_prompt_available',
      });
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      localStorage.removeItem('pwa-install-dismissed');
      trackInstallIfNeeded('appinstalled_event');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) {
      return false;
    }

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      tracker.track(EventType.CUSTOM, {
        category: 'pwa',
        action: 'install_prompt_accepted',
      });
      return true;
    }

    tracker.track(EventType.CUSTOM, {
      category: 'pwa',
      action: 'install_prompt_dismissed',
    });
    
    return false;
  };

  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return {
    isInstalled,
    isInstallable,
    promptInstall,
    isIOS,
  };
}
