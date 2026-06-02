interface RateLimitRecord {
  timestamps: number[];
  lastAccessed: number;
}

const limiterCache = new Map<string, RateLimitRecord>();
const CACHE_MAX_SIZE = 5000; // Cap cache size to avoid unbounded memory leaks

/**
 * Sweeps expired or oldest keys if the cache exceeds CACHE_MAX_SIZE.
 */
function enforceCacheLimit(now: number, windowMs: number) {
  if (limiterCache.size < CACHE_MAX_SIZE) return;

  console.log(`[Arena][RateLimit][GC] Evicting oldest rate limits. Active count: ${limiterCache.size}`);
  
  // 1. Evict any key whose logs are fully expired
  for (const [key, record] of limiterCache.entries()) {
    const freshTimestamps = record.timestamps.filter(t => now - t < windowMs);
    if (freshTimestamps.length === 0) {
      limiterCache.delete(key);
    } else {
      record.timestamps = freshTimestamps;
    }
  }

  // 2. If still over limit, evict the least recently accessed keys
  if (limiterCache.size >= CACHE_MAX_SIZE) {
    const sorted = Array.from(limiterCache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Evict the oldest 20% of records
    const keysToEvict = sorted.slice(0, Math.floor(CACHE_MAX_SIZE * 0.2));
    for (const [key] of keysToEvict) {
      limiterCache.delete(key);
    }
    console.log(`[Arena][RateLimit][GC] Evicted ${keysToEvict.length} least-recently accessed rate-limit keys.`);
  }
}

/**
 * Rate limits operations (e.g. matchmaking, completions) per Privy DID / IP key.
 * Memory-safe sliding window algorithm.
 * Returns true if allowed, false if rejected.
 */
export function isAllowed(key: string, limit: number, windowMs: number): boolean {
  try {
    const now = Date.now();
    enforceCacheLimit(now, windowMs);

    const record = limiterCache.get(key) ?? { timestamps: [], lastAccessed: now };
    record.lastAccessed = now;

    // Prune timestamps older than windowMs
    record.timestamps = record.timestamps.filter(t => now - t < windowMs);

    if (record.timestamps.length >= limit) {
      console.warn(`[Arena][RateLimit][Violation] User '${key.substring(0, 20)}...' blocked. Hits: ${record.timestamps.length}/${limit}`);
      return false;
    }

    // Bounded push to prevent array size attacks
    record.timestamps.push(now);
    if (record.timestamps.length > limit * 2) {
      record.timestamps = record.timestamps.slice(-limit);
    }

    limiterCache.set(key, record);
    return true;
  } catch (err) {
    // FAIL OPEN: If rate limiting throws, allow operation to ensure system availability
    console.error('[Arena][RateLimit] Validator runtime exception, failing open:', err);
    return true;
  }
}

export function getLimiterCacheSize(): number {
  return limiterCache.size;
}

