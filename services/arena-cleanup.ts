import { prisma } from '@/lib/prisma';
import { ArenaRank } from './arena-rank';
import { MatchPlayerStatus, MatchStatus } from '@prisma/client';

export class ArenaCleanupService {
  /**
   * Sweeps match states to clear orphans, expire queues, resolve abandoned plays
   * with default wins, and purge old logs under the database retention policy.
   */
  static async runGarbageCollection() {
    const now = new Date();
    console.log(`[Arena][Cleanup] Garbage collection cycle started at: ${now.toISOString()}`);

    try {
      // 1. Expire idle queue matches (longer than 30 seconds waiting in queue)
      const queueLimit = new Date(now.getTime() - 30000);
      const expiredLobbies = await prisma.match.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: queueLimit }
        },
        data: { status: 'EXPIRED' }
      });
      if (expiredLobbies.count > 0) {
        console.log(`[Arena][Cleanup] Expired Lobbies: ${expiredLobbies.count} stale queue queues marked as EXPIRED.`);
      }

      // 2. Forfeit stale active match sessions (longer than 60 seconds elapsed)
      const activeLimit = new Date(now.getTime() - 60000);
      const staleMatches = await prisma.match.findMany({
        where: {
          status: 'ACTIVE',
          createdAt: { lt: activeLimit }
        },
        include: { players: true }
      });

      for (const match of staleMatches) {
        console.log(`[Arena][Cleanup] Processing stale ACTIVE Match: ${match.id} (elapsed > 10m)`);
        const [p1, p2] = match.players;

        // CASE A: Both players failed to submit within the 10-minute cap
        if (p1.status !== MatchPlayerStatus.SUBMITTED && p2.status !== MatchPlayerStatus.SUBMITTED) {
          console.log(`[Arena][Cleanup] Double abandonment. Forfeiting both players in Match: ${match.id}`);
          await prisma.$transaction([
            prisma.matchPlayer.updateMany({
              where: { matchId: match.id },
              data: { status: MatchPlayerStatus.FORFEITED }
            }),
            prisma.match.update({
              where: { id: match.id },
              data: { 
                status: MatchStatus.FORFEITED,
                resolvedAt: new Date()
              }
            })
          ]);
        }
        // CASE B: Player 1 submitted, but Player 2 abandoned (P1 wins by default)
        else if (p1.status === MatchPlayerStatus.SUBMITTED && p2.status !== MatchPlayerStatus.SUBMITTED) {
          console.log(`[Arena][Cleanup] Player 2 abandoned. Awarding default win to Player 1: ${p1.userId}`);
          await prisma.matchPlayer.update({
            where: { id: p2.id },
            data: { 
              status: MatchPlayerStatus.FORFEITED,
              score: 0,
              combo: 1.0,
              duration: 600000
            }
          });
          await ArenaRank.settleMatch(match.id, match.gameId, match.arenaTier);
        }
        // CASE C: Player 2 submitted, but Player 1 abandoned (P2 wins by default)
        else if (p2.status === MatchPlayerStatus.SUBMITTED && p1.status !== MatchPlayerStatus.SUBMITTED) {
          console.log(`[Arena][Cleanup] Player 1 abandoned. Awarding default win to Player 2: ${p2.userId}`);
          await prisma.matchPlayer.update({
            where: { id: p1.id },
            data: { 
              status: MatchPlayerStatus.FORFEITED,
              score: 0,
              combo: 1.0,
              duration: 600000
            }
          });
          await ArenaRank.settleMatch(match.id, match.gameId, match.arenaTier);
        }
      }

      // 3. Database Retention Policy: Purge raw replay data older than 14 days to conserve storage
      const retentionLimit = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const purgedSessions = await prisma.matchSession.updateMany({
        where: {
          validFrom: { lt: retentionLimit },
          replayData: { not: null as any }
        },
        data: {
          replayData: null as any // Set JSON string to null
        }
      });
      if (purgedSessions.count > 0) {
        console.log(`[Arena][Cleanup] Database Retention Policy: Cleared raw replay data for ${purgedSessions.count} sessions older than 14 days.`);
      }

      console.log('[Arena][Cleanup] Garbage collection cycle completed successfully.');

    } catch (error) {
      console.error('[Arena][Cleanup][Error] Failed during garbage collection execution:', error);
      // Fail-Open: log warning and continue without crashing server
    }
  }
}
