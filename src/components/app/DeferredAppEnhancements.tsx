"use client";

import { useEffect, useState } from "react";
import { AuthRedirect } from "@/components/auth/AuthRedirect";
import { SystemPushBridge } from "@/components/notifications/SystemPushBridge";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { OfflineSyncManager } from "@/components/pwa/OfflineSyncManager";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { DevCacheCleanup } from "@/components/pwa/DevCacheCleanup";

export function DeferredAppEnhancements() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const schedule = () => setReady(true);
    const globalObj = globalThis as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof globalObj.requestIdleCallback === "function") {
      const idleId = globalObj.requestIdleCallback(schedule, { timeout: 1200 });
      return () => {
        if (typeof globalObj.cancelIdleCallback === "function") {
          globalObj.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = setTimeout(schedule, 600);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <>
      {process.env.NODE_ENV === "development" ? <DevCacheCleanup /> : null}
      <AuthRedirect />
      {ready ? (
        <>
          <WebVitalsReporter />
          <SystemPushBridge />
          <OfflineIndicator />
          <OfflineSyncManager />
          <InstallPrompt />
        </>
      ) : null}
    </>
  );
}
