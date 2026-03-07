// ============================================================
// Tracking System – In-Memory Event Queue
// src/lib/tracking/queue.ts
// ============================================================

import type { TrackingEvent } from './types';

/**
 * Lightweight, non-blocking in-memory queue for tracking events.
 *
 * Design decisions:
 * - Backed by a plain array (push to tail, splice from head).
 * - Capped at `maxSize` to guard against memory leaks on long sessions
 *   or network outages. Oldest events are dropped when the cap is hit.
 * - Zero dependencies, zero React re-renders.
 */
export class EventQueue {
  private items: TrackingEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /** Add an event to the tail. Drops the oldest event if at capacity. */
  push(event: TrackingEvent): void {
    if (this.items.length >= this.maxSize) {
      // Silently drop the oldest (head) to keep memory bounded
      this.items.shift();
    }
    this.items.push(event);
  }

  /** Add multiple events in-order. */
  pushMany(events: TrackingEvent[]): void {
    events.forEach((event) => this.push(event));
  }

  /**
   * Dequeue up to `max` events from the head.
   * Returns the dequeued events (they are removed from the queue).
   */
  drain(max = 100): TrackingEvent[] {
    if (this.items.length === 0) return [];
    const batch = this.items.splice(0, max);
    return batch;
  }

  /** Requeue events at the front if a flush fails after dequeue. */
  requeueFront(events: TrackingEvent[]): void {
    if (!events.length) return;
    this.items = [...events, ...this.items].slice(0, this.maxSize);
  }

  /** Inspect queue head without mutating state. */
  peek(max = 100): TrackingEvent[] {
    if (this.items.length === 0) return [];
    return this.items.slice(0, max);
  }

  /** Current number of buffered events. */
  get size(): number {
    return this.items.length;
  }

  /** True when the queue has no events. */
  get isEmpty(): boolean {
    return this.items.length === 0;
  }
}
