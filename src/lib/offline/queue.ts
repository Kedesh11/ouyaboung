import type { OfflineActionType } from './actions';

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

export const getOfflineQueue = (): OfflineQueueItem[] => {
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

export const saveOfflineQueue = (items: OfflineQueueItem[]): void => {
  if (!hasBrowserStorage()) return;

  const bounded = items.slice(0, MAX_QUEUE_ITEMS);
  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(bounded));
};

export const enqueueOfflineQueueItem = <TPayload>(
  type: OfflineActionType,
  payload: TPayload
): OfflineQueueItem<TPayload> => {
  const item: OfflineQueueItem<TPayload> = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  const queue = getOfflineQueue();
  queue.push(item as OfflineQueueItem);
  saveOfflineQueue(queue);

  return item;
};

