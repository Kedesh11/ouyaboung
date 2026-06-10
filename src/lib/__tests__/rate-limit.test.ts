import { describe, expect, it } from 'vitest';
import { applyRateLimit } from '@/lib/rate-limit';

describe('applyRateLimit', () => {
  it('allows requests under the configured limit', async () => {
    const key = `test-allow-${Date.now()}`;
    const result = await applyRateLimit(key, { windowMs: 60_000, maxRequests: 3 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('blocks requests above the configured limit', async () => {
    const key = `test-block-${Date.now()}`;
    const config = { windowMs: 60_000, maxRequests: 2 };

    await applyRateLimit(key, config);
    await applyRateLimit(key, config);
    const blocked = await applyRateLimit(key, config);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
