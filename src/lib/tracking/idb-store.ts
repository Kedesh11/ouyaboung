// ============================================================
// Tracking System – IndexedDB Offline Buffer
// src/lib/tracking/idb-store.ts
//
// Uses a DEDICATED 'tracking-events' object store in the same
// IndexedDB database as the existing offline utilities.
// ============================================================

import type { TrackingEvent } from './types';

const DB_NAME = 'ouyaboung-offline-db';
const DB_VERSION = 2;
const STORE_NAME = 'tracking-events';
const KV_STORE_NAME = 'kv';

let dbInstance: IDBDatabase | null = null;

interface TrackingEventRecord extends TrackingEvent {
  idb_key: number;
}

export interface OfflineDrainBatch {
  events: TrackingEvent[];
  keys: number[];
  nextCursor: number | null;
  hasMore: boolean;
}

function openTrackingDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(KV_STORE_NAME)) {
        db.createObjectStore(KV_STORE_NAME);
      }

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'idb_key',
          autoIncrement: true,
        });
        store.createIndex('by_ts', 'client_ts', { unique: false });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Append a batch of events to the offline buffer. */
export async function appendOfflineEvents(events: TrackingEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = await openTrackingDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const event of events) {
        store.put({ ...event });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Read up to `limit` events (oldest first) without deleting.
 * Pass the returned keys to `removeOfflineEventsByKeys` after successful send.
 */
export async function drainOfflineEventsCursor({
  limit = 200,
  cursor = null,
}: {
  limit?: number;
  cursor?: number | null;
} = {}): Promise<OfflineDrainBatch> {
  const db = await openTrackingDb();
  if (!db) {
    return { events: [], keys: [], nextCursor: null, hasMore: false };
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const events: TrackingEvent[] = [];
      const keys: number[] = [];
      let nextCursor: number | null = null;

      const keyRange =
        typeof cursor === 'number' && Number.isFinite(cursor)
          ? IDBKeyRange.lowerBound(cursor + 1)
          : undefined;

      const cursorReq = store.openCursor(keyRange);

      cursorReq.onsuccess = () => {
        const rowCursor = cursorReq.result;

        if (!rowCursor || events.length >= limit) {
          resolve({
            events,
            keys,
            nextCursor,
            hasMore: Boolean(rowCursor),
          });
          return;
        }

        const record = rowCursor.value as TrackingEventRecord;
        const { idb_key, ...event } = record;
        events.push(event);
        keys.push(idb_key);
        nextCursor = idb_key;

        rowCursor.continue();
      };

      cursorReq.onerror = () =>
        resolve({ events, keys, nextCursor, hasMore: false });
      tx.onabort = () =>
        resolve({ events, keys, nextCursor, hasMore: false });
    } catch {
      resolve({ events: [], keys: [], nextCursor: null, hasMore: false });
    }
  });
}

/** Delete acknowledged records by IndexedDB keys. */
export async function removeOfflineEventsByKeys(keys: number[]): Promise<void> {
  if (keys.length === 0) return;

  const db = await openTrackingDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      keys.forEach((key) => store.delete(key));

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Backward-compatible helper: read and delete up to `limit` events.
 */
export async function drainOfflineEvents(limit = 200): Promise<TrackingEvent[]> {
  const batch = await drainOfflineEventsCursor({ limit });
  if (batch.keys.length > 0) {
    await removeOfflineEventsByKeys(batch.keys);
  }
  return batch.events;
}

/** Returns the number of buffered offline events. */
export async function countOfflineEvents(): Promise<number> {
  const db = await openTrackingDb();
  if (!db) return 0;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}
