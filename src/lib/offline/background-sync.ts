export const OFFLINE_SYNC_TAG = "ouyaboung-offline-sync";

export const registerOfflineBackgroundSync = async (): Promise<void> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration || !("sync" in registration)) return;

    await (registration as ServiceWorkerRegistration & {
      sync: { register: (tag: string) => Promise<void> };
    }).sync.register(OFFLINE_SYNC_TAG);
  } catch {
    // Background Sync is best-effort only.
  }
};
