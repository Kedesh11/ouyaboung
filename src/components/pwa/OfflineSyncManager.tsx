'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { processOfflineQueue } from '@/services/offline-sync.service';

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 min

export function OfflineSyncManager() {
  useEffect(() => {
    let isMounted = true;

    const runSync = async () => {
      if (!navigator.onLine) return;

      const result = await processOfflineQueue();
      if (!isMounted) return;

      if (result.processed > 0) {
        toast.success(`${result.processed} action(s) hors ligne synchronisee(s).`);
      }

      if (result.dropped > 0) {
        toast.warning(`${result.dropped} action(s) hors ligne n'ont pas pu etre appliquees.`);
      }
    };

    const onOnline = () => {
      void runSync();
    };

    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      void runSync();
    }, SYNC_INTERVAL_MS);

    void runSync();

    return () => {
      isMounted = false;
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}

