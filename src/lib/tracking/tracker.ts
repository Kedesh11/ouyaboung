// ============================================================
// Tracking System – Singleton Service
// src/lib/tracking/tracker.ts
// ============================================================

import {
  type EventType,
  type EventMetadata,
  type TrackingEvent,
  type TrackingConfig,
  DEFAULT_TRACKING_CONFIG
} from './types';
import { EventQueue } from './queue';
import { collectDeviceInfo, getOrCreateSessionId, getCurrentRoute, type DeviceInfo } from './session';
import { appendOfflineEvents, drainOfflineEvents, countOfflineEvents } from './idb-store';

class TrackingService {
  private queue: EventQueue;
  private config: TrackingConfig;
  private deviceInfo: DeviceInfo | null = null;
  private sessionId: string | null = null;

  // React state sync (to attach user_id if logged in)
  private userId: string | null = null;

  private isFlushing = false;
  private flushTimer: NodeJS.Timeout | null = null;

  // Track if we are offline to short-circuit
  private isOnline = true;

  constructor() {
    this.config = DEFAULT_TRACKING_CONFIG;
    this.queue = new EventQueue(1000); // Max 1000 events in memory
  }

  /**
   * Initializes the tracker. Must be called once on the client.
   * `TrackingProvider` handles this.
   */
  public init(userId: string | null = null) {
    if (typeof window === 'undefined') return;

    this.userId = userId;
    this.sessionId = getOrCreateSessionId();
    this.deviceInfo = collectDeviceInfo();
    this.isOnline = navigator.onLine;

    // Listen to network changes
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Visibility / unload sync flush
    window.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handleUnload);

    this.startTimer();

    // If starting online, try to drain old offline events
    if (this.isOnline) {
      this.syncOfflineEvents();
    }
  }

  public setUserId(userId: string | null) {
    this.userId = userId;
  }

  public track(eventType: EventType, metadata?: EventMetadata, routeOverride?: string) {
    if (typeof window === 'undefined' || !this.sessionId || !this.deviceInfo) return;

    const event: TrackingEvent = {
      event_type:  eventType,
      route:       routeOverride || getCurrentRoute(),
      session_id:  this.sessionId,
      user_id:     this.userId,
      device_type: this.deviceInfo.device_type,
      user_agent:  this.deviceInfo.user_agent,
      referrer:    this.deviceInfo.referrer,
      metadata:    metadata || {},
      client_ts:   Date.now(),
    };

    this.queue.push(event);

    if (this.queue.size >= this.config.flushThreshold) {
      this.flush();
    }
  }

  private startTimer() {
    this.stopTimer();
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }

  private stopTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private handleOnline = () => {
    this.isOnline = true;
    this.syncOfflineEvents();
  };

  private handleOffline = () => {
    this.isOnline = false;
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushSync();
    }
  };

  private handleUnload = () => {
    this.flushSync();
  };

  /**
   * Main async flush. Sends memory queue to API.
   * On failure, dumps to IndexedDB.
   */
  public async flush(): Promise<void> {
    if (this.isFlushing || this.queue.isEmpty) return;

    const batch = this.queue.drain(this.config.flushThreshold);
    if (batch.length === 0) return;

    this.isFlushing = true;

    try {
      if (!this.isOnline) {
        await appendOfflineEvents(batch);
        return;
      }

      const ok = await this.sendBatch(batch);
      if (!ok) {
        // Failed (5xx or network). Store for later.
        await appendOfflineEvents(batch);
      }
    } catch {
      await appendOfflineEvents(batch);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Synchronous flush for 'unload' and 'visibilitychange'
   * uses navigator.sendBeacon so it survives page navigation.
   */
  private flushSync(): void {
    if (this.queue.isEmpty || !this.isOnline || !navigator.sendBeacon) return;

    const batch = this.queue.drain(this.config.flushThreshold);
    if (batch.length === 0) return;

    try {
      const payload = JSON.stringify({ events: batch });
      const ok = navigator.sendBeacon(this.config.endpoint, payload);
      // Beacon doesn't tell us if it failed auth/500, but we can't await IDB on unload anyway reliably.
      if (!ok) {
        // Queue full or beacon blocked, push back to queue synchronously (might be lost if tab closes)
        batch.forEach(e => this.queue.push(e));
      }
    } catch (e) {
      // Ignored
    }
  }

  private async sendBatch(events: TrackingEvent[]): Promise<boolean> {
    try {
      const res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        // keepalive helps if navigating away during async flush
        keepalive: true,
      });
      return res.ok;
    } catch {
      return false; // network error
    }
  }

  /**
   * Drains offline DB and attempts to send. Retries with simple backoff block.
   */
  private async syncOfflineEvents() {
    if (!this.isOnline) return;

    const count = await countOfflineEvents();
    if (count === 0) return;

    // Pull up to 200 events to sync
    const events = await drainOfflineEvents(200);
    if (events.length === 0) return;

    const ok = await this.sendBatch(events);
    if (!ok) {
        // If it failed again, put them back (append to tail of IDB)
        await appendOfflineEvents(events);
    } else {
        // If there are more, recurse
        if (count > 200) {
           setTimeout(() => this.syncOfflineEvents(), 1000);
        }
    }
  }

  public teardown() {
    if (typeof window === 'undefined') return;
    this.stopTimer();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handleUnload);
  }
}

// Export singleton instance
export const tracker = new TrackingService();
