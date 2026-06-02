import { prisma } from '@/lib/prisma';
import { ArenaTier } from '@prisma/client';
import { ARENA_PROTOCOL_VERSION, CompatibilityDecoder } from '@/lib/arena/protocol-compat';
import { AuditArchiveService } from '@/services/audit-archive';
import { MetricsService } from '@/services/metrics';
import crypto from 'crypto';

export class ArenaRank {
  /**
   * Performs Elo MMR calculations and transacts match updates, winner assignments,
   * and player rating adjustments in a single safe database transaction.
   * Enforces strict idempotency.
   */
  static async settleMatch(matchId: string, gameId: number, arenaTier: ArenaTier) {
    console.log(`[Arena][Settlement] Initializing transactional settlement for Match: ${matchId}`);

    const { RollbackJournalService } = require('@/services/rollback-journal');
    await RollbackJournalService.startSettlement(matchId);

    try {
      // 1. Fetch match and players under verification
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { players: true }
      });

      if (!match) {
        throw new Error(`Match not found: ${matchId}`);
      }

      // IDEMPOTENCY CHECK: If already resolved, bypass to prevent duplicate MMR calculations
      if (match.status === 'COMPLETED' || match.resolvedAt !== null) {
        console.log(`[Arena][Settlement][Idempotent] Match ${matchId} is already COMPLETED. Settle bypassed.`);
        await RollbackJournalService.completeSettlement(matchId);
        return;
      }

      if (match.players.length !== 2) {
        throw new Error(`Match ${matchId} does not have exactly 2 players (Actual: ${match.players.length})`);
      }

      const [p1, p2] = match.players;
      if (p1.score === null || p2.score === null) {
        throw new Error(`Cannot settle match ${matchId} before both players have scores`);
      }

      // 2. Fetch or seed PlayerRanks
      const [r1, r2] = await Promise.all([
        this.getOrCreateRank(p1.userId, gameId, arenaTier),
        this.getOrCreateRank(p2.userId, gameId, arenaTier)
      ]);

      // 3. Elo rating calculations
      const K = 32;
      const E1 = 1 / (1 + Math.pow(10, (r2.mmr - r1.mmr) / 400));
      const E2 = 1 - E1;

      let S1 = 0.5;
      let S2 = 0.5;
      let winnerId: string | null = null;

      if (p1.score > p2.score) {
        S1 = 1;
        S2 = 0;
        winnerId = p1.userId;
      } else if (p2.score > p1.score) {
        S1 = 0;
        S2 = 1;
        winnerId = p2.userId;
      }

      // Calculate new ratings (enforcing floor limit of 100 MMR)
      const newMmr1 = Math.max(100, Math.round(r1.mmr + K * (S1 - E1)));
      const newMmr2 = Math.max(100, Math.round(r2.mmr + K * (S2 - E2)));

      // Placements progression
      const p1MatchesRemaining = r1.isPlaced ? 0 : Math.max(0, r1.placementMatchesRemaining - 1);
      const p2MatchesRemaining = r2.isPlaced ? 0 : Math.max(0, r2.placementMatchesRemaining - 1);

      // Calculate receipt anchors using deterministic canonical ordering
      const secretKey = process.env.ADMIN_SECRET_KEY || 'rcade-secret-super-key-alpha-2026';
      const scoresMap = {
        [p1.userId]: p1.score,
        [p2.userId]: p2.score
      };
      
      // Stable key order canonical JSON serialization
      const canonicalScores = CompatibilityDecoder.canonicalizeJson(scoresMap);
      
      const telemetryHash = crypto
          .createHash('sha256')
          .update(canonicalScores)
          .digest('hex');
          
      const settlementHash = crypto
        .createHmac('sha256', secretKey)
        .update(`${matchId}${winnerId || 'DRAW'}${telemetryHash}`)
        .digest('hex');

      console.log(`[Arena][Settlement] Calculations resolved. Player1 (${p1.userId}): ${r1.mmr} -> ${newMmr1} | Player2 (${p2.userId}): ${r2.mmr} -> ${newMmr2} | Winner: ${winnerId}`);

      // 4. Wrap everything in a single database transaction to guarantee atomic consistency
      await prisma.$transaction([
        // Update Player 1 Rank
        prisma.playerRank.update({
          where: { id: r1.id },
          data: {
            mmr: newMmr1,
            matchesPlayed: { increment: 1 },
            matchesWon: { increment: S1 === 1 ? 1 : 0 },
            matchesLost: { increment: S1 === 0 ? 1 : 0 },
            winStreak: S1 === 1 ? { increment: 1 } : 0,
            placementMatchesRemaining: p1MatchesRemaining,
            isPlaced: r1.isPlaced ? true : p1MatchesRemaining === 0
          }
        }),
        // Update Player 2 Rank
        prisma.playerRank.update({
          where: { id: r2.id },
          data: {
            mmr: newMmr2,
            matchesPlayed: { increment: 1 },
            matchesWon: { increment: S2 === 1 ? 1 : 0 },
            matchesLost: { increment: S2 === 0 ? 1 : 0 },
            winStreak: S2 === 1 ? { increment: 1 } : 0,
            placementMatchesRemaining: p2MatchesRemaining,
            isPlaced: r2.isPlaced ? true : p2MatchesRemaining === 0
          }
        }),
        // Settle the overall Match
        prisma.match.update({
          where: { id: matchId },
          data: {
            status: 'COMPLETED',
            winnerId,
            resolvedAt: new Date()
          }
        }),
        // Save Immutable Signed Receipt
        prisma.matchReceipt.upsert({
          where: { matchId },
          update: {
            winnerId,
            telemetryHash,
            settlementHash,
            protocolVersion: ARENA_PROTOCOL_VERSION,
            payload: { scores: scoresMap, resolvedAt: new Date().toISOString() } as any
          },
          create: {
            matchId,
            winnerId,
            telemetryHash,
            settlementHash,
            protocolVersion: ARENA_PROTOCOL_VERSION,
            payload: { scores: scoresMap, resolvedAt: new Date().toISOString() } as any
          }
        })
      ]);

      await RollbackJournalService.completeSettlement(matchId);

      // 5. Append to tamper-evident chained ledger
      try {
        await AuditArchiveService.appendEntry('RECEIPT', {
          matchId,
          winnerId,
          scores: scoresMap
        }, {
          settlementReceiptHash: settlementHash
        });
      } catch (auditErr) {
        console.error('[Arena][Settlement][Warning] Settle succeeded but AuditArchive append failed:', auditErr);
      }

      console.log(`[Arena][Settlement] Transaction completed successfully. Match: ${matchId} is resolved.`);
    } catch (err: any) {
      try {
        await RollbackJournalService.failSettlement(matchId, err.message || String(err));
      } catch (journalErr) {
        console.error('[Arena][Settlement][JournalError] Failed to log failed settlement status:', journalErr);
      }
      console.error(`[Arena][Settlement][Fatal] Match settlement failed: ${err.message}`);
      MetricsService.increment('settlement_failures_total');
      throw err;
    }
  }

  private static async getOrCreateRank(userId: string, gameId: number, arenaTier: ArenaTier) {
    let rank = await prisma.playerRank.findUnique({
      where: { userId_gameId_arenaTier: { userId, gameId, arenaTier } }
    });
    if (!rank) {
      rank = await prisma.playerRank.create({
        data: { 
          userId, 
          gameId, 
          arenaTier, 
          mmr: 1000,
          confidence: 350.0,
          isPlaced: false,
          placementMatchesRemaining: 5
        }
      });
    }
    return rank;
  }
}
