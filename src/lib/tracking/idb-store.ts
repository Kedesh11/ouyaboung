// ============================================================
// Tracking System – IndexedDB Offline Buffer
// src/lib/tracking/idb-store.ts
//
// Uses a DEDICATED 'tracking-events' object store in the same
// IndexedDB database as the existing offline utilities, keeping
// the DB version bump clean.
// ============================================================

import type { TrackingEvent } from './types';

const DB_NAME    = 'ouyaboung-offline-db';
// Bump version from 1 → 2 to add the new object store
const DB_VERSION = 2;
const STORE_NAME = 'tracking-events';

let _db: IDBDatabase | null = null;

function openTrackingDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Preserve existing 'kv' store created in v1
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }

      // New store: auto-increment key, events stored as JSON blobs
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath:       'idb_key',
          autoIncrement: true,
        });
        // Index on client_ts for ordered drain
        store.createIndex('by_ts', 'client_ts', { unique: false });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
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
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const event of events) {
        // idb_key is auto-incremented; we spread the event as value
        store.put({ ...event });
      }

      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
      tx.onabort    = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Read and DELETE up to `limit` events from the offline buffer (oldest first).
 * Returns the events so the caller can retry sending them.
 */
export async function drainOfflineEvents(limit = 200): Promise<TrackingEvent[]> {
  const db = await openTrackingDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx     = db.transaction(STORE_NAME, 'readwrite');
      const store  = tx.objectStore(STORE_NAME);
      const index  = store.index('by_ts');
      const events: TrackingEvent[] = [];

      const cursorReq = index.openCursor();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || events.length >= limit) {
          resolve(events);
          return;
        }

        const { idb_key: _key, ...event } = cursor.value as TrackingEvent & { idb_key: number };
        events.push(event as TrackingEvent);
        cursor.delete();
        cursor.continue();
      };

      cursorReq.onerror = () => resolve(events);
      tx.onabort        = () => resolve(events);
    } catch {
      resolve([]);
    }
  });
}

/** Returns the number of buffered offline events. */
export async function countOfflineEvents(): Promise<number> {
  const db = await openTrackingDb();
  if (!db) return 0;

  return new Promise((resolve) => {
    try {
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}
