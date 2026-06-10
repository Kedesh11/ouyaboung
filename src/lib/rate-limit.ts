export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
}

const memoryWindows = new Map<string, number[]>();

const applyInMemoryRateLimit = (key: string, config: RateLimitConfig): RateLimitResult => {
  const now = Date.now();
  const history = memoryWindows.get(key) ?? [];
  const active = history.filter((ts) => now - ts < config.windowMs);

  if (active.length >= config.maxRequests) {
    const oldest = active[0] ?? now;
    const retryAfterMs = config.windowMs - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      resetAt: oldest + config.windowMs,
    };
  }

  active.push(now);
  memoryWindows.set(key, active);

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - active.length),
    retryAfterSec: 0,
    resetAt: now + config.windowMs,
  };
};

const applyUpstashRateLimit = async (
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult | null> => {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!restUrl || !restToken) return null;

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const redisKey = `ratelimit:${key}`;

  try {
    const response = await fetch(`${restUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['ZREMRANGEBYSCORE', redisKey, 0, windowStart],
        ['ZADD', redisKey, { score: now, member: `${now}:${Math.random()}` }],
        ['ZCARD', redisKey],
        ['PEXPIRE', redisKey, config.windowMs],
      ]),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { result?: unknown };
    const count = Number((payload.result as unknown[])?.[2] ?? 0);

    if (count > config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil(config.windowMs / 1000)),
        resetAt: now + config.windowMs,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - count),
      retryAfterSec: 0,
      resetAt: now + config.windowMs,
    };
  } catch {
    return null;
  }
};

export const applyRateLimit = async (
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> => {
  const upstashResult = await applyUpstashRateLimit(key, config);
  if (upstashResult) return upstashResult;
  return applyInMemoryRateLimit(key, config);
};

export const getRequestIp = (headers: Headers): string => {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return headers.get('x-real-ip') || 'unknown';
};
