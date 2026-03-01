import type { OfflineActionType } from './actions';
import { registerOfflineBackgroundSync } from './background-sync';
import { getIndexedDbValue, setIndexedDbValue } from './indexeddb';

const OFFLINE_QUEUE_STORAGE_KEY = 'ouyaboung:offline:queue:v1';
const MAX_QUEUE_ITEMS = 200;

export interface OfflineQueueItem<TPayload = unknown> {
  id: string;
  type: OfflineActionType;
  payload: TPayload;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}

const hasBrowserStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const getOfflineQueue = async (): Promise<OfflineQueueItem[]> => {
  if (!hasBrowserStorage()) return [];

  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as OfflineQueueItem[];
      }
    }
  } catch {
    // Fallback to IndexedDB
  }

  const indexedQueue = await getIndexedDbValue<OfflineQueueItem[]>(OFFLINE_QUEUE_STORAGE_KEY);
  if (!indexedQueue || !Array.isArray(indexedQueue)) return [];

  // Hydrate localStorage for fast sync reads.
  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(indexedQueue));
  return indexedQueue;
};

export const saveOfflineQueue = async (items: OfflineQueueItem[]): Promise<void> => {
  if (!hasBrowserStorage()) return;

  const bounded = items.slice(0, MAX_QUEUE_ITEMS);
  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(bounded));
  await setIndexedDbValue(OFFLINE_QUEUE_STORAGE_KEY, bounded);
};

export const enqueueOfflineQueueItem = async <TPayload>(
  type: OfflineActionType,
  payload: TPayload
): Promise<OfflineQueueItem<TPayload>> => {
  const item: OfflineQueueItem<TPayload> = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  const queue = await getOfflineQueue();
  queue.push(item as OfflineQueueItem);
  await saveOfflineQueue(queue);

  // Best-effort background sync trigger for browsers that support it.
  void registerOfflineBackgroundSync();

  return item;
};

// Compatibility helper for existing sync-only callers (avoids breaking runtime edge cases).
export const getOfflineQueueSyncFallback = (): OfflineQueueItem[] => {
  if (!hasBrowserStorage()) return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
};
