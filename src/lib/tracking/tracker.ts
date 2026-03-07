// ============================================================
// Tracking System – Singleton Service
// src/lib/tracking/tracker.ts
// ============================================================

import {
  type EventType,
  type EventMetadata,
  type TrackingEvent,
  type TrackingConfig,
  DEFAULT_TRACKING_CONFIG,
} from './types';
import { EventQueue } from './queue';
import { collectDeviceInfo, getOrCreateSessionId, getCurrentRoute, type DeviceInfo } from './session';
import {
  appendOfflineEvents,
  drainOfflineEventsCursor,
  removeOfflineEventsByKeys,
} from './idb-store';

class TrackingService {
  private queue: EventQueue;
  private config: TrackingConfig;
  private deviceInfo: DeviceInfo | null = null;
  private sessionId: string | null = null;
  private userId: string | null = null;

  private initialized = false;
  private isOnline = true;
  private isFlushing = false;
  private isSyncingOffline = false;

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.config = DEFAULT_TRACKING_CONFIG;
    this.queue = new EventQueue(1000);
  }

  public init(userId: string | null = null) {
    if (typeof window === 'undefined') return;

    this.userId = userId;

    if (this.initialized) {
      return;
    }

    this.sessionId = getOrCreateSessionId();
    this.deviceInfo = collectDeviceInfo();
    this.isOnline = navigator.onLine;
    this.initialized = true;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handleUnload);

    this.startTimer();
    this.track('session_start', { online: this.isOnline });

    if (this.isOnline) {
      void this.syncOfflineEvents();
    }
  }

  public setUserId(userId: string | null) {
    this.userId = userId;
  }

  public track(eventType: EventType, metadata?: EventMetadata, routeOverride?: string) {
    if (typeof window === 'undefined' || !this.sessionId || !this.deviceInfo) return;

    const event: TrackingEvent = {
      event_type: eventType,
      route: routeOverride || getCurrentRoute(),
      session_id: this.sessionId,
      user_id: this.userId,
      device_type: this.deviceInfo.device_type,
      user_agent: this.deviceInfo.user_agent,
      referrer: this.deviceInfo.referrer,
      metadata: metadata || {},
      client_ts: Date.now(),
    };

    this.queue.push(event);

    if (this.queue.size >= this.config.flushThreshold) {
      void this.flush();
    }
  }

  private startTimer() {
    this.stopTimer();
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
  }

  private stopTimer() {
    if (!this.flushTimer) return;
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  private handleOnline = () => {
    this.isOnline = true;
    void this.flush();
    void this.syncOfflineEvents();
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

      const sent = await this.sendBatchWithRetry(batch);
      if (!sent) {
        await appendOfflineEvents(batch);
      }
    } catch {
      await appendOfflineEvents(batch);
    } finally {
      this.isFlushing = false;
    }
  }

  private flushSync(): void {
    if (this.queue.isEmpty || !this.isOnline || !navigator.sendBeacon) return;

    const batch = this.queue.drain(this.config.flushThreshold);
    if (batch.length === 0) return;

    try {
      const payload = JSON.stringify({ events: batch, sent_at: Date.now() });
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon(this.config.endpoint, blob);
      if (!ok) {
        this.queue.requeueFront(batch);
      }
    } catch {
      this.queue.requeueFront(batch);
    }
  }

  private async sendBatch(events: TrackingEvent[]): Promise<boolean> {
    try {
      const res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, sent_at: Date.now() }),
        keepalive: true,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async sendBatchWithRetry(events: TrackingEvent[]): Promise<boolean> {
    let attempt = 0;
    const maxAttempts = Math.max(1, this.config.maxRetries);

    while (attempt < maxAttempts) {
      const ok = await this.sendBatch(events);
      if (ok) return true;

      attempt += 1;
      if (attempt >= maxAttempts) break;

      const backoff = Math.min(3000, 300 * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, backoff));
      if (!this.isOnline) return false;
    }

    return false;
  }

  private async syncOfflineEvents() {
    if (!this.isOnline || this.isSyncingOffline) return;

    this.isSyncingOffline = true;

    try {
      let cursor: number | null = null;
      let loops = 0;

      while (this.isOnline && loops < 50) {
        const chunk = await drainOfflineEventsCursor({
          limit: Math.min(200, this.config.flushThreshold * 4),
          cursor,
        });

        if (chunk.events.length === 0) {
          break;
        }

        const sent = await this.sendBatchWithRetry(chunk.events);
        if (!sent) {
          break;
        }

        await removeOfflineEventsByKeys(chunk.keys);

        if (!chunk.hasMore || chunk.nextCursor === null) {
          break;
        }

        cursor = chunk.nextCursor;
        loops += 1;
      }
    } finally {
      this.isSyncingOffline = false;
    }
  }

  public teardown() {
    if (typeof window === 'undefined' || !this.initialized) return;

    this.track('session_end', { online: this.isOnline });
    this.flushSync();

    this.stopTimer();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handleUnload);

    this.initialized = false;
  }
}

export const tracker = new TrackingService();
