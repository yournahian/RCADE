import { prisma } from '@/lib/prisma';
import { ArenaTier, Match, MatchPlayerStatus } from '@prisma/client';
import { getGameProgression } from '@/lib/game-progression';
import { getArenaFlags } from '@/lib/arena/flags';
import { MetricsService } from '@/services/metrics';
import { LockCoordinator } from './lock-coordinator';

export class ArenaMatchmaker {
  /**
   * Enqueues a player into the matchmaking pool.
   * Enforces progression gating, rematch cooldowns, and sniping protections.
   * If the pool is idle, schedules an optional Ghost Opponent.
   */
  static async requestMatch(userId: string, gameId: number, arenaTier: ArenaTier): Promise<{ match: Match; status: 'PENDING' | 'ACTIVE' }> {
    console.log(`[Arena][Matchmaker] Matchmaking request. User: ${userId} | Game: ${gameId} | Tier: ${arenaTier}`);

    // 1. Gating verification
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    let progressionLevel = 0;
    if (user.wallet) {
      progressionLevel = await getGameProgression(user.wallet, gameId);
    }

    const flags = getArenaFlags();
    const higherTiersDisabled = !flags.ARENA_SILVER_ENABLED && !flags.ARENA_ELITE_ENABLED;

    if (arenaTier === ArenaTier.BRONZE && progressionLevel > 2 && !higherTiersDisabled) {
      throw new Error('Bronze Arena locked (Progression tier too high)');
    }

    // 2. Cooldown check: Prevent rematch with the same opponent within 60 seconds
    const lastResolvedMatch = await prisma.match.findFirst({
      where: {
        gameId,
        arenaTier,
        players: { some: { userId } },
        status: 'COMPLETED',
        resolvedAt: { gte: new Date(Date.now() - 60000) } // Resolved within last 60s
      },
      include: { players: true }
    });

    const cooldownOpponentIds: string[] = [];
    if (lastResolvedMatch) {
      const opp = lastResolvedMatch.players.find(p => p.userId !== userId);
      if (opp) {
        cooldownOpponentIds.push(opp.userId);
        console.log(`[Arena][Matchmaker] Rematch cooldown active for user: ${userId} against opponent: ${opp.userId}`);
      }
    }

    // 3. Concurrency sniping protection: Block pairing if they played the same opponent twice consecutively
    const lastTwoCompleted = await prisma.match.findMany({
      where: {
        gameId,
        arenaTier,
        players: { some: { userId } },
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
      include: { players: true }
    });

    const consecutiveOpponents = lastTwoCompleted
      .map(m => m.players.find(p => p.userId !== userId)?.userId)
      .filter((id): id is string => !!id);

    const farmingBlockedOpponentIds: string[] = [];
    if (consecutiveOpponents.length === 2 && consecutiveOpponents[0] === consecutiveOpponents[1]) {
      farmingBlockedOpponentIds.push(consecutiveOpponents[0]);
      console.log(`[Arena][Matchmaker] Anti-farming block active for user: ${userId} against opponent: ${consecutiveOpponents[0]}`);
    }

    const blacklistedOpponents = Array.from(new Set([...cooldownOpponentIds, ...farmingBlockedOpponentIds]));

    // Distributed Locking Boundary setup
    const lockKey = `lock:matchmake:${gameId}:${arenaTier}`;
    const lockHolder = `matchmake:${userId}:${Date.now()}`;
    const ttlMs = 5000; // 5 seconds lock safety ceiling
    
    let acquired = false;
    let fencingToken = 0;
    
    // Concurrency spin lock: retry up to 5 times
    for (let attempt = 1; attempt <= 5; attempt++) {
      const lockRes = await LockCoordinator.acquireLock(lockKey, lockHolder, ttlMs);
      if (lockRes.success) {
        acquired = true;
        fencingToken = lockRes.fencingToken;
        break;
      }
      console.log(`[Arena][Matchmaker] Matchmaking lock occupied. Spin-lock retrying attempt ${attempt}/5...`);
      await new Promise(r => setTimeout(r, 100));
    }

    if (!acquired) {
      console.warn(`[Arena][Matchmaker][Conflict] Failed to acquire lock for key: ${lockKey}. Matchmaking pool saturated.`);
      throw new Error('Matchmaking system busy, please try again shortly');
    }

    try {
      // 4. Scan for an active PENDING lobby (must be fresh, created in the last 30s to ensure opponent is still online)
      const freshThreshold = new Date(Date.now() - 30000);
      const availableLobby = await prisma.match.findFirst({
        where: {
          gameId,
          arenaTier,
          status: 'PENDING',
          createdAt: { gte: freshThreshold },
          players: {
            some: {}, // Guarantee there is at least one player in the pending lobby
            none: {
              userId: { in: [...blacklistedOpponents, userId] }
            }
          }
        },
        include: { players: true }
      });

      if (availableLobby && availableLobby.players.length > 0) {
        // Settle as paired match
        console.log(`[Arena][Matchmaker] Opponent paired! Match: ${availableLobby.id} between ${availableLobby.players[0].userId} and ${userId}`);
        
        const updatedMatch = await prisma.match.update({
          where: { id: availableLobby.id },
          data: {
            status: 'ACTIVE',
            players: {
              create: { 
                userId, 
                status: 'WAITING' 
              }
            }
          }
        });
        return { match: updatedMatch, status: 'ACTIVE' };
      }

      // 5. Create a new PENDING match lobby
      console.log(`[Arena][Matchmaker] No open lobbies found. Creating new PENDING match for user: ${userId}`);
      const newLobby = await prisma.match.create({
        data: {
          gameId,
          arenaTier,
          status: 'PENDING',
          players: {
            create: { 
              userId, 
              status: 'WAITING' 
            }
          }
        }
      });

      // 6. Schedule Ghost trigger seeder (if enabled)
      const flags = getArenaFlags();
      if (flags.ARENA_GHOST_SEEDER_ENABLED) {
        this.scheduleGhostTrigger(newLobby.id, userId, gameId, arenaTier);
      }

      return { match: newLobby, status: 'PENDING' };
    } finally {
      // Safe release lock asserting holder ownership
      await LockCoordinator.releaseLock(lockKey, lockHolder);
    }
  }

  private static scheduleGhostTrigger(matchId: string, player1Id: string, gameId: number, arenaTier: ArenaTier) {
    setTimeout(async () => {
      try {
        const flags = getArenaFlags();
        if (!flags.ARENA_GHOST_SEEDER_ENABLED) return;

        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: true }
        });

        if (match && match.status === 'PENDING') {
          console.log(`[Arena][Matchmaker][Ghost] Queue idle threshold reached (30s). Seeding ghost bot for match: ${matchId}`);
          MetricsService.increment('ghost_match_activations_total');
          
          await prisma.match.update({
            where: { id: matchId },
            data: {
              status: 'ACTIVE',
              players: {
                create: {
                  userId: 'ghost:system-seeder-bot',
                  score: Math.floor(1200 + Math.random() * 1800), // Competitive default
                  combo: 2.2,
                  duration: 85000,
                  status: 'SUBMITTED',
                  submittedAt: new Date()
                }
              }
            }
          });
          console.log(`[Arena][Matchmaker][Ghost] Seeder bot paired successfully inside Match: ${matchId}`);
        }
      } catch (err) {
        console.error('[Arena][Matchmaker][Ghost] Error in seeder trigger thread:', err);
      }
    }, 30000); // 30-second delay seeder
  }
}
