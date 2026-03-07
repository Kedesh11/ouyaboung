// ============================================================
// Tracking System – TypeScript Types
// src/lib/tracking/types.ts
// ============================================================

/** All supported event types. Matches the DB CHECK constraint. */
export const EventType = {
  PAGE_VIEW:         'page_view',
  SCROLL_DEPTH:      'scroll_depth',
  TIME_ON_PAGE:      'time_on_page',
  VISIBILITY_CHANGE: 'visibility_change',
  SESSION_START:     'session_start',
  SESSION_END:       'session_end',
  ROUTE_CHANGE:      'route_change',
  CLICK:             'click',
  ADD_TO_CART:       'add_to_cart',
  REMOVE_FROM_CART:  'remove_from_cart',
  PURCHASE:          'purchase',
  ORDER_ABANDON:     'order_abandon',
  PRODUCT_VIEW:      'product_view',
  PRODUCT_DWELL:     'product_dwell',
  INTENT_SIGNAL:     'intent_signal',
  PRICE_HESITATION:  'price_hesitation',
  SEARCH:            'search',
  CUSTOM:            'custom',
} as const;

export type EventType = typeof EventType[keyof typeof EventType];

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** Metadata payload – flexible JSON blob attached to any event. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type EventMetadata = Record<string, JsonValue>;

/**
 * A tracking event as built client-side before being sent.
 * All fields except `metadata` are mandatory.
 */
export interface TrackingEvent {
  event_type:  EventType;
  route:       string;
  session_id:  string;
  user_id:     string | null;
  device_type: DeviceType;
  user_agent:  string;
  referrer:    string;
  metadata:    EventMetadata;
  /** Unix epoch ms – used for ordering in batches */
  client_ts:   number;
}

/**
 * The shape POSTed to /api/analytics/events.
 * We use snake_case to match the DB column names directly.
 */
export interface TrackingBatchPayload {
  events: TrackingEvent[];
  sent_at?: number;
}

export interface TrackingIngestResponse {
  success: boolean;
  request_id: string;
  accepted?: number;
  inserted?: number;
  dropped?: number;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Configuration for the TrackingService singleton. */
export interface TrackingConfig {
  /** API endpoint to send batches to. */
  endpoint:           string;
  /** How many events to buffer before triggering a forced flush (default 50). */
  flushThreshold:     number;
  /** Interval in ms between automatic flushes (default 10_000). */
  flushIntervalMs:    number;
  /** Maximum retry attempts on network failure (default 3). */
  maxRetries:         number;
  /** Maximum number of events to hold in the offline IDB buffer. */
  maxOfflineBuffer:   number;
}

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  endpoint:         '/api/analytics/events',
  flushThreshold:   50,
  flushIntervalMs:  parseInt(
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_TRACKING_FLUSH_INTERVAL_MS ?? '10000'
      : '10000',
    10
  ),
  maxRetries:       3,
  maxOfflineBuffer: 2000,
};
