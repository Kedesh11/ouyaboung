const OFFLINE_DB_NAME = "ouyaboung-offline-db";
const OFFLINE_DB_VERSION = 2;
const OFFLINE_KV_STORE = "kv";
const OFFLINE_TRACKING_STORE = "tracking-events";

const hasIndexedDb = (): boolean =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const openOfflineDb = async (): Promise<IDBDatabase | null> => {
  if (!hasIndexedDb()) return null;

  return await new Promise((resolve) => {
    const request = window.indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_KV_STORE)) {
        db.createObjectStore(OFFLINE_KV_STORE);
      }
      if (!db.objectStoreNames.contains(OFFLINE_TRACKING_STORE)) {
        const trackingStore = db.createObjectStore(OFFLINE_TRACKING_STORE, {
          keyPath: "idb_key",
          autoIncrement: true,
        });
        trackingStore.createIndex("by_ts", "client_ts", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, resolve: (value: T) => void) => void,
  fallback: T
): Promise<T> => {
  const db = await openOfflineDb();
  if (!db) return fallback;

  return await new Promise<T>((resolve) => {
    try {
      const tx = db.transaction(OFFLINE_KV_STORE, mode);
      const store = tx.objectStore(OFFLINE_KV_STORE);

      tx.oncomplete = () => db.close();
      tx.onabort = () => {
        db.close();
        resolve(fallback);
      };
      tx.onerror = () => {
        db.close();
        resolve(fallback);
      };

      handler(store, resolve);
    } catch {
      db.close();
      resolve(fallback);
    }
  });
};

export const getIndexedDbValue = async <T>(key: string): Promise<T | null> =>
  withStore<T | null>(
    "readonly",
    (store, resolve) => {
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => resolve(null);
    },
    null
  );

export const setIndexedDbValue = async <T>(key: string, value: T): Promise<boolean> =>
  withStore<boolean>(
    "readwrite",
    (store, resolve) => {
      const request = store.put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    },
    false
  );

export const deleteIndexedDbValue = async (key: string): Promise<boolean> =>
  withStore<boolean>(
    "readwrite",
    (store, resolve) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    },
    false
  );
