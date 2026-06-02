import { prisma } from '@/lib/prisma';
import { TrophyService } from './TrophyService';
import { EscrowService } from './EscrowService';
import { getArenaFlags } from '@/lib/arena/flags';
type ArenaMatch = any;

export class MatchmakingService {
  /**
   * Enqueues a player into the matchmaking queue.
   */
  static async enqueue(
    userId: string,
    gameId: number,
    mode: 'CASUAL' | 'RANKED' | 'WAGER',
    wagerAmount: string | null,
    region: string = 'global',
    ping: number = 50
  ) {
    console.log(`[Matchmake][Enqueue] User: ${userId} | Game: ${gameId} | Mode: ${mode} | Region: ${region}`);

    // If Wager mode, verify they can afford the stake
    if (mode === 'WAGER' && wagerAmount) {
      const balance = await prisma.playerArenaStats.findUnique({ where: { userId } });
      const currentBalance = 500.0 + (balance?.totalWagersWon ?? 0.0);
      if (currentBalance < parseFloat(wagerAmount)) {
        throw new Error('Insufficient wallet balance to enter Wager Arena');
      }
    }

    // WIPE older queue ticket to avoid duplicate queue leakage
    await prisma.arenaQueue.deleteMany({
      where: { userId }
    });

    // Fetch user trophies
    const rank = await TrophyService.getOrCreatePlayerRank(userId, gameId);
    const trophies = rank.trophies;

    // Create a new queue ticket
    // NOTE: joinedAt is explicitly set here because the sandbox mock DB does not apply
    // Prisma schema @default(now()) values, which would leave joinedAt undefined and crash .getTime()
    const ticket = await prisma.arenaQueue.create({
      data: {
        userId,
        gameId,
        mode,
        trophies,
        wagerAmount,
        region,
        ping,
        joinedAt: new Date(),
        expiresAt: new Date(Date.now() + 120000), // 2 minutes queue limit
        status: 'QUEUING'
      }
    });

    // Run dynamic matching pass
    const result = await this.scanAndPair(ticket.id);

    // If no opponent found immediately, schedule ghost bot seeder (if enabled)
    if (result.match === null) {
      const flags = getArenaFlags();
      if (flags.ARENA_GHOST_SEEDER_ENABLED) {
        this.scheduleGhostSeeder(ticket.id, userId, gameId, mode);
      }
    }

    return result;
  }

  /**
   * Scans for a matching ticket in the same game queue.
   */
  static async scanAndPair(ticketId: string): Promise<{ match: ArenaMatch | null; status: 'QUEUING' | 'MATCHED' }> {
    const ticket = await prisma.arenaQueue.findUnique({
      where: { id: ticketId }
    });

    if (!ticket || ticket.status !== 'QUEUING') {
      return { match: null, status: 'QUEUING' };
    }

    // Same-game isolation matching: Scans only tickets of same gameId and same mode
    // Null-safe: joinedAt may be a string (from JSON DB) or missing; normalize to Date
    const joinedAtMs = ticket.joinedAt
      ? (ticket.joinedAt instanceof Date ? ticket.joinedAt.getTime() : new Date(ticket.joinedAt).getTime())
      : Date.now();
    const ageSeconds = (Date.now() - joinedAtMs) / 1000;
    // Trophy range: expands by 50 trophies for every 10 seconds of queuing
    const allowedDelta = 150 + Math.floor(ageSeconds / 10) * 50;

    const minTrophies = Math.max(0, ticket.trophies - allowedDelta);
    const maxTrophies = ticket.trophies + allowedDelta;

    // Anti-repeat opponent filter: Check user's last opponent
    const userRank = await TrophyService.getOrCreatePlayerRank(ticket.userId, ticket.gameId);
    const blacklistedOpponent = (userRank.consecutiveOpponentCount >= 2) ? userRank.lastOpponentId : null;

    // Query candidates
    const candidates = await prisma.arenaQueue.findMany({
      where: {
        gameId: ticket.gameId,
        mode: ticket.mode,
        wagerAmount: ticket.wagerAmount,
        status: 'QUEUING',
        userId: {
          notIn: blacklistedOpponent ? [ticket.userId, blacklistedOpponent] : [ticket.userId]
        },
        trophies: {
          gte: minTrophies,
          lte: maxTrophies
        },
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    if (candidates.length === 0) {
      return { match: null, status: 'QUEUING' };
    }

    // Matchmaking Latency optimization: prioritize candidates in same region
    let opponent = candidates.find(c => c.region === ticket.region);
    if (!opponent) {
      opponent = candidates[0]; // fallback to any candidate in proximity
    }

    console.log(`[Matchmake][Pair] Paired ${ticket.userId} (${ticket.trophies} trophies) with ${opponent.userId} (${opponent.trophies} trophies). Game: ${ticket.gameId}`);

    // Create new Match record
    const match = await prisma.arenaMatch.create({
      data: {
        gameId: ticket.gameId,
        mode: ticket.mode,
        status: 'MATCHED',
        player1Id: ticket.userId,
        player2Id: opponent.userId
      }
    });

    // If wager mode, deploy secure Escrow State
    if (ticket.mode === 'WAGER' && ticket.wagerAmount) {
      const escrowId = await EscrowService.holdWager(
        match.id,
        ticket.userId,
        opponent.userId,
        ticket.wagerAmount,
        false
      );
      await prisma.arenaMatch.update({
        where: { id: match.id },
        data: { escrowId }
      });
    }

    // Delete queue tickets safely
    await prisma.arenaQueue.deleteMany({
      where: { id: { in: [ticket.id, opponent.id] } }
    });

    return { match, status: 'MATCHED' };
  }

  /**
   * Schedules a ghost bot seeder after 30 seconds if the queue ticket is still unmatched.
   * This ensures solo players always get a match instead of waiting forever.
   */
  private static scheduleGhostSeeder(
    ticketId: string,
    userId: string,
    gameId: number,
    mode: 'CASUAL' | 'RANKED' | 'WAGER'
  ) {
    setTimeout(async () => {
      try {
        const flags = getArenaFlags();
        if (!flags.ARENA_GHOST_SEEDER_ENABLED) return;

        // Check if the ticket is still QUEUING (not yet paired)
        const ticket = await prisma.arenaQueue.findUnique({
          where: { id: ticketId }
        });

        if (!ticket || ticket.status !== 'QUEUING') {
          console.log(`[Matchmake][Ghost] Ticket ${ticketId} already consumed or expired. Seeder aborted.`);
          return;
        }

        console.log(`[Matchmake][Ghost] 30s elapsed — seeding ghost bot for user: ${userId} in game: ${gameId}`);

        // Ensure the ghost bot User record exists (FK constraint requirement)
        const ghostBotId = 'ghost:system-bot';
        await prisma.user.upsert({
          where: { id: ghostBotId },
          update: {},
          create: { id: ghostBotId, username: 'GHOST_BOT' }
        });

        // Create ArenaMatch pairing the user against the ghost bot
        const match = await prisma.arenaMatch.create({
          data: {
            gameId,
            mode,
            status: 'MATCHED',
            player1Id: userId,
            player2Id: ghostBotId
          }
        });

        // Clean up queue ticket
        await prisma.arenaQueue.deleteMany({
          where: { id: ticketId }
        });

        // Notify the player via SSE
        const { RealtimeService } = require('@/services/arena/RealtimeService');
        await RealtimeService.publishMatchUpdate(
          match.id,
          match.player1Id,
          match.player2Id,
          'MATCHED',
          match
        );

        console.log(`[Matchmake][Ghost] Ghost match ${match.id} created and broadcasted for user ${userId}.`);
      } catch (err) {
        console.error('[Matchmake][Ghost] Ghost seeder failed:', err);
      }
    }, 30000); // 30-second wait before seeding a ghost
  }

  /**
   * Force removes a user from the matchmaking queues.
   */
  static async dequeue(userId: string): Promise<void> {
    await prisma.arenaQueue.deleteMany({
      where: { userId }
    });
    console.log(`[Matchmake][Dequeue] User ${userId} cancelled queue search.`);
  }

  /**
   * Retrieves active queuing statistics.
   */
  static async getQueueActivity(gameId: number): Promise<{ activeQueuers: number; activeMatches: number }> {
    const activeQueuers = await prisma.arenaQueue.count({
      where: { gameId, status: 'QUEUING' }
    });
    const activeMatches = await prisma.arenaMatch.count({
      where: { gameId, status: { in: ['MATCHED', 'COUNTDOWN', 'ACTIVE'] } }
    });
    return { activeQueuers, activeMatches };
  }
}
