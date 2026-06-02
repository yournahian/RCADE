import { prisma } from '@/lib/prisma';
import { MetricsService } from '@/services/metrics';

// Global to store active locks telemetry to survive hot-reloads
const globalLockTelemetry = global as unknown as {
  activeLocksCount: number;
};
if (globalLockTelemetry.activeLocksCount === undefined) {
  globalLockTelemetry.activeLocksCount = 0;
}

export class LockCoordinator {
  private static tableVerified = false;

  /**
   * Helper to ensure the DistributedLock table exists in Postgres.
   * Runs self-healing SQL once on boot.
   */
  private static async ensureTableExists() {
    if (this.tableVerified) return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DistributedLock" (
          "key" TEXT NOT NULL,
          "holder" TEXT NOT NULL,
          "fencingToken" INTEGER NOT NULL DEFAULT 1,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "DistributedLock_pkey" PRIMARY KEY ("key")
        );
      `);
      this.tableVerified = true;
    } catch (err) {
      console.error('[LockCoordinator] Self-healing table check failed:', err);
    }
  }

  /**
   * Acquires a distributed lock atomically.
   * Implements monotonic fencing tokens, holder epoch validation, and takeover protection.
   */
  static async acquireLock(key: string, holder: string, ttlMs: number): Promise<{ success: boolean; fencingToken: number }> {
    await this.ensureTableExists();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    console.log(`[LockCoordinator][Acquire] Requesting lock for Key: ${key} | Holder: ${holder} | TTL: ${ttlMs}ms`);

    // Dynamic Redis option path
    if (process.env.REDIS_URL) {
      try {
        const Redis = eval('require')('ioredis');
        const redis = new Redis(process.env.REDIS_URL);
        
        // Atomically set key if not exists (NX) with millisecond expiration time (PX)
        const reply = await redis.set(key, holder, 'NX', 'PX', ttlMs);
        await redis.quit();

        if (reply === 'OK') {
          const fence = Math.floor(Date.now() / 1000);
          globalLockTelemetry.activeLocksCount++;
          MetricsService.set('rcade_arena_active_locks', globalLockTelemetry.activeLocksCount);
          return { success: true, fencingToken: fence };
        }
        
        return { success: false, fencingToken: 0 };
      } catch (redisErr) {
        console.warn('[LockCoordinator][Redis] Redis lock acquire failed, falling back to PostgreSQL:', redisErr);
        MetricsService.increment('rcade_arena_redis_fallback_total');
      }
    }

    try {
      // Execute in an isolated transaction block
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.distributedLock.findUnique({
          where: { key }
        }) as any;

        if (!existing) {
          // Lock does not exist - create it
          const created = await tx.distributedLock.create({
            data: {
              key,
              holder,
              fencingToken: 1,
              expiresAt
            } as any
          }) as any;
          globalLockTelemetry.activeLocksCount++;
          MetricsService.set('rcade_arena_active_locks', globalLockTelemetry.activeLocksCount);
          return { success: true, fencingToken: created.fencingToken };
        }

        // Lock exists - check if it has expired (takeover protection)
        if (existing.expiresAt < now) {
          const nextFencingToken = existing.fencingToken + 1;
          console.log(`[LockCoordinator][Acquire] Lock expired for Key: ${key} (Held by stale: ${existing.holder}). Taking over lock, FencingToken: ${nextFencingToken}`);
          
          await tx.distributedLock.update({
            where: { key },
            data: {
              holder,
              fencingToken: nextFencingToken,
              expiresAt,
              createdAt: now
            } as any
          });

          MetricsService.increment('rcade_arena_stale_locks_taken_over_total');
          return { success: true, fencingToken: nextFencingToken };
        }

        // Lock is active and held by someone else
        console.log(`[LockCoordinator][Acquire] Lock Key: ${key} is active and occupied by Holder: ${existing.holder}`);
        return { success: false, fencingToken: 0 };
      });
    } catch (err: any) {
      console.error(`[LockCoordinator][Acquire][Panic] Key: ${key} failed transaction:`, err.message);
      return { success: false, fencingToken: 0 };
    }
  }

  /**
   * Releases a distributed lock.
   * Asserts lock ownership to prevent stale-holder releases.
   */
  static async releaseLock(key: string, holder: string): Promise<boolean> {
    await this.ensureTableExists();
    console.log(`[LockCoordinator][Release] Requesting release for Key: ${key} | Holder: ${holder}`);

    // Dynamic Redis option path
    if (process.env.REDIS_URL) {
      try {
        const Redis = eval('require')('ioredis');
        const redis = new Redis(process.env.REDIS_URL);
        
        // Assert ownership using Lua script to release lock atomically only if value matches holder
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const result = await redis.eval(script, 1, key, holder);
        await redis.quit();

        if (result === 1) {
          globalLockTelemetry.activeLocksCount = Math.max(0, globalLockTelemetry.activeLocksCount - 1);
          MetricsService.set('rcade_arena_active_locks', globalLockTelemetry.activeLocksCount);
          return true;
        }
        return false;
      } catch (redisErr) {
        console.warn('[LockCoordinator][Redis] Redis lock release failed, falling back to PostgreSQL:', redisErr);
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.distributedLock.findUnique({
          where: { key }
        });

        if (!existing) {
          console.log(`[LockCoordinator][Release] No active lock found for Key: ${key}`);
          return false;
        }

        // Lock ownership validation
        if (existing.holder !== holder) {
          console.warn(`[LockCoordinator][Release][Violation] Holder: ${holder} tried to release Lock Key: ${key} but it is owned by Holder: ${existing.holder}`);
          MetricsService.increment('rcade_arena_lock_ownership_violations_total');
          return false;
        }

        // Safe release
        await tx.distributedLock.delete({
          where: { key }
        });

        globalLockTelemetry.activeLocksCount = Math.max(0, globalLockTelemetry.activeLocksCount - 1);
        MetricsService.set('rcade_arena_active_locks', globalLockTelemetry.activeLocksCount);
        console.log(`[LockCoordinator][Release] Key: ${key} released successfully by Holder: ${holder}`);
        return true;
      });
    } catch (err: any) {
      console.error(`[LockCoordinator][Release][Panic] Key: ${key} release failure:`, err.message);
      return false;
    }
  }
}
