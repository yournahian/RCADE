import { prisma } from '@/lib/prisma';
import { getRuleAdapter } from '@/lib/arena/rules';
import { TrophyService } from './TrophyService';
import { EscrowService } from './EscrowService';
import { ArenaMatchFSM } from '@/lib/arena/fsm';
type ArenaMatch = any;
import crypto from 'crypto';

export class ReplayService {
  /**
   * Saves a simplified V1 replay payload with match metadata, player inputs, and checksums.
   */
  static async saveReplay(
    matchId: string,
    userId: string,
    inputs: any,
    score: number,
    duration: number,
    seed: string
  ) {
    const serializedInputs = JSON.stringify(inputs);
    const checksum = crypto
      .createHash('sha256')
      .update(`${matchId}${userId}${score}${duration}${seed}${serializedInputs}`)
      .digest('hex');

    const replay = await prisma.matchReplay.create({
      data: {
        matchId,
        userId,
        replayData: serializedInputs as any,
        score,
        duration,
        seed,
        checksum
      }
    });

    return replay;
  }
}

export class AntiFraudService {
  /**
   * Analyzes player behaviors to flag suspicious PvP farms or intentional losses.
   */
  static async auditGameplay(
    userId: string,
    gameId: number,
    score: number,
    durationMs: number,
    matchId: string
  ): Promise<{ isSuspicious: boolean; flagType?: string; severity?: 'LOW' | 'MEDIUM' | 'HIGH' }> {
    console.log(`[AntiFraud][Audit] Auditing user ${userId} for Match: ${matchId}`);

    // 1. Repeated Instant Losses (wager farming / match throw)
    if (durationMs < 5000 && score === 0) {
      console.warn(`[AntiFraud][Violation] Instant loss detected! Duration: ${durationMs}ms | Score: ${score}`);
      await prisma.antiFraudFlag.create({
        data: {
          matchId,
          userId,
          flagType: 'REPEATED_INSTANT_LOSS',
          severity: 'HIGH',
          details: `Immediate round exit in ${durationMs}ms with 0 score.`
        }
      });
      return { isSuspicious: true, flagType: 'REPEATED_INSTANT_LOSS', severity: 'HIGH' };
    }

    // 2. Anti-farming repeated opponent checker
    const playerRank = await TrophyService.getOrCreatePlayerRank(userId, gameId);
    if (playerRank.consecutiveOpponentCount >= 3) {
      console.warn(`[AntiFraud][Violation] Same opponent consecutive farm match threshold breached!`);
      await prisma.antiFraudFlag.create({
        data: {
          matchId,
          userId,
          flagType: 'SUSPICIOUS_WAGER_FARMING',
          severity: 'MEDIUM',
          details: `Matched identical opponent ${playerRank.lastOpponentId} consecutively ${playerRank.consecutiveOpponentCount} times.`
        }
      });
      return { isSuspicious: true, flagType: 'SUSPICIOUS_WAGER_FARMING', severity: 'MEDIUM' };
    }

    return { isSuspicious: false };
  }
}

export class LeaderboardService {
  /**
   * Refreshes and compiles top player standings per game.
   */
  static async refreshLeaderboard(gameId: number, seasonId?: string) {
    console.log(`[Leaderboard] Compiling active standings for Game: ${gameId}`);

    const topRanks = await prisma.playerGameRank.findMany({
      where: {
        gameId,
        seasonId: seasonId || null
      },
      orderBy: { trophies: 'desc' },
      take: 50,
      include: { user: true }
    });

    // Save/cache leaderboard snapshots for fast reads
    await prisma.leaderboardEntry.deleteMany({
      where: { gameId, seasonId: seasonId || null }
    });

    const entries = topRanks.map((rank, index) => ({
      gameId,
      userId: rank.userId,
      seasonId: seasonId || null,
      rank: index + 1,
      trophies: rank.trophies
    }));

    if (entries.length > 0) {
      try {
        await prisma.leaderboardEntry.createMany({
          data: entries
        });
      } catch (createManyErr) {
        console.warn('[Leaderboard] prisma.leaderboardEntry.createMany failed or is not a function. Falling back to individual parallel creates.', createManyErr);
        await Promise.all(
          entries.map(entry =>
            prisma.leaderboardEntry.create({
              data: entry
            }).catch(err => {
              console.error('[Leaderboard] Individual create failed for user:', entry.userId, err);
            })
          )
        );
      }
    }

    return topRanks;
  }
}

export class SeasonService {
  /**
   * Initializes a new competitive Arena Season.
   */
  static async startNewSeason(seasonName: string, durationDays: number = 30) {
    console.log(`[Season] Setting up new season: ${seasonName}`);

    // Set any active seasons to passive
    await prisma.seasonData.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    const season = await prisma.seasonData.create({
      data: {
        seasonName,
        startDate: new Date(),
        endDate: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
        isActive: true
      }
    });

    return season;
  }

  /**
   * Resets trophy counts for all users at season end.
   * Compiles final standings and resets ELO-free values.
   */
  static async resetSeason(seasonId: string) {
    console.log(`[Season][Reset] Wiping seasonal stats for Season ID: ${seasonId}`);

    const ranks = await prisma.playerGameRank.findMany({
      where: { seasonId }
    });

    // Reset trophies above 100 to base 100 (Arcade Ladder Seasonal standard)
    for (const rank of ranks) {
      await prisma.playerGameRank.update({
        where: { id: rank.id },
        data: {
          trophies: 100, // standard baseline reset
          winStreak: 0,
          updatedAt: new Date()
        }
      });
    }
  }
}

export class ArenaService {
  /**
   * Centralized transition runner with strict state-machine guards.
   */
  static async transitionMatch(matchId: string, nextStatus: string, extraData: any = {}): Promise<ArenaMatch> {
    const match = await prisma.arenaMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error(`Match not found: ${matchId}`);

    // Validate transition authority through authoritative FSM guards
    ArenaMatchFSM.validateTransition(matchId, match.status, nextStatus);

    const updated = await prisma.arenaMatch.update({
      where: { id: matchId },
      data: {
        status: nextStatus,
        ...extraData
      }
    });

    return updated;
  }

  /**
   * Transition match lifecycle state.
   */
  static async updateMatchStatus(matchId: string, status: string): Promise<ArenaMatch> {
    return this.transitionMatch(matchId, status);
  }

  /**
   * Authoritative complete match trigger (handles immediate death losses or clean completions)
   */
  static async completeMatch(
    matchId: string,
    userId: string,
    score: number,
    durationMs: number,
    replayInputs: any,
    seed: string,
    completed: boolean = false
  ): Promise<{ success: boolean; match: ArenaMatch }> {
    return this.submitMatchScore(matchId, userId, score, durationMs, replayInputs, seed, completed);
  }

  /**
   * Submits a server-authoritative player score and telemetry inputs.
   */
  static async submitMatchScore(
    matchId: string,
    userId: string,
    score: number,
    durationMs: number,
    replayInputs: any,
    seed: string,
    completed: boolean = true
  ): Promise<{ success: boolean; match: ArenaMatch }> {
    console.log(`[Arena][Submit] User ${userId} submitted Score: ${score} | Duration: ${durationMs}ms | Completed: ${completed} in Match: ${matchId}`);

    const match = await prisma.arenaMatch.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      throw new Error(`Match not found: ${matchId}`);
    }

    if (match.status !== 'ACTIVE' && match.status !== 'MATCHED' && match.status !== 'COUNTDOWN' && match.status !== 'COMPLETED') {
      throw new Error(`Cannot submit scores. Match is in status: ${match.status}`);
    }

    // 1. Fetch Abstract Polymorphic Rule Adapter
    const ruleAdapter = getRuleAdapter(match.gameId);

    // 2. Server-Authoritative score legitimacy validation
    // For premature death/forfeits (completed === false), we bypass strict validation since first-death/forfeits immediately trigger forced loss.
    const isScoreLegit = !completed ? true : ruleAdapter.validateScore(score, durationMs, replayInputs);
    const isReplayLegit = !completed ? true : ruleAdapter.validateReplay(replayInputs, seed);

    if (!isScoreLegit || !isReplayLegit) {
      console.warn(`[Arena][Validation] Server-authoritative check failed! Score Legit: ${isScoreLegit} | Replay Legit: ${isReplayLegit}`);
      // Mark as disqualified / fraud flagged
      await prisma.antiFraudFlag.create({
        data: {
          matchId,
          userId,
          flagType: 'IMPOSSIBLE_SCORE_RATE',
          severity: 'CRITICAL',
          details: `Rejected score validation. Score: ${score} in ${durationMs}ms.`
        }
      });
      throw new Error('Telemetry verification rejected: anomalous score rates detected.');
    }

    // 3. Audit Fraud behavior
    const fraudCheck = await AntiFraudService.auditGameplay(userId, match.gameId, score, durationMs, matchId);

    // 4. Save V1 Simplified Replay inputs
    await ReplayService.saveReplay(matchId, userId, replayInputs, score, durationMs, seed);

    // 5. Update match score state
    let updateData: any = {};
    if (match.player1Id === userId) {
      updateData.player1Score = score;
      updateData.player1Status = 'SUBMITTED';
      updateData.player1SubmittedAt = new Date();
    } else if (match.player2Id === userId) {
      updateData.player2Score = score;
      updateData.player2Status = 'SUBMITTED';
      updateData.player2SubmittedAt = new Date();
    } else {
      throw new Error('User is not a registered player in this match lobby');
    }

    let updatedMatch = await prisma.arenaMatch.update({
      where: { id: matchId },
      data: updateData
    });

    // If the match was already completed (e.g. settled immediately via PLAYER_DEAD event), bypass further FSM settlement checks.
    if (match.status === 'COMPLETED') {
      console.log(`[Arena][Submit] Match already settled. Telemetry saved for User: ${userId} in Match ID: ${matchId}`);
      return { success: true, match: updatedMatch };
    }

    // 6. Check if BOTH players have submitted, or if a death occurred!
    // Under competitive Arena rules, first death triggers immediate loss.
    if (!completed) {
      console.log(`[Arena][Submit] First player death reported. Settling match immediately for Match ID: ${matchId}`);
      const opponentId = updatedMatch.player1Id === userId ? updatedMatch.player2Id : updatedMatch.player1Id;
      updatedMatch = await this.settleArenaMatch(matchId, opponentId);
    } else if (
      updatedMatch.player1Id === 'ghost:system-bot' ||
      updatedMatch.player2Id === 'ghost:system-bot'
    ) {
      // Ghost bot match: auto-settle in favor of the human player immediately
      console.log(`[Arena][Submit] Ghost bot match detected. Auto-settling match in favor of human player: ${userId}`);
      updatedMatch = await this.settleArenaMatch(matchId, userId);
    } else if (
      (updatedMatch.player1Status === 'SUBMITTED' || updatedMatch.player1Score !== null) &&
      (updatedMatch.player2Status === 'SUBMITTED' || updatedMatch.player2Score !== null)
    ) {
      updatedMatch = await this.settleArenaMatch(matchId);
    }

    return { success: true, match: updatedMatch };
  }

  /**
   * Settle and disburse match result.
   */
  public static async settleArenaMatch(matchId: string, forceWinnerId?: string): Promise<ArenaMatch> {
    console.log(`[Arena][Settle] Settle trigger fired for Match: ${matchId} | Forced Winner: ${forceWinnerId}`);

    const match = await prisma.arenaMatch.findUnique({
      where: { id: matchId }
    });

    if (!match) throw new Error('Match not found');

    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      console.log(`[Arena][Settle][Idempotent] Match ${matchId} is already resolved (${match.status}). Settle bypassed.`);
      return match;
    }

    let winnerId: string | null = null;
    let loserId: string | null = null;

    if (forceWinnerId) {
      winnerId = forceWinnerId;
      loserId = forceWinnerId === match.player1Id ? match.player2Id : match.player1Id;
    } else {
      // Look up replay durations to get individual gameplay times accurately
      const replays = await prisma.matchReplay.findMany({
        where: { matchId }
      });
      const p1Replay = replays.find(r => r.userId === match.player1Id);
      const p2Replay = replays.find(r => r.userId === match.player2Id);

      const p1Score = match.player1Score ?? 0;
      const p1Duration = p1Replay ? p1Replay.duration : 60000;
      const p2Score = match.player2Score ?? 0;
      const p2Duration = p2Replay ? p2Replay.duration : 60000;

      // Fetch game rule adapter to determine winner server-authoritatively
      const ruleAdapter = getRuleAdapter(match.gameId);
      const outcome = ruleAdapter.determineWinner(p1Score, p1Duration, null, p2Score, p2Duration, null);

      if (outcome === 'player1') {
        winnerId = match.player1Id;
        loserId = match.player2Id;
      } else if (outcome === 'player2') {
        winnerId = match.player2Id;
        loserId = match.player1Id;
      }
    }

    console.log(`[Arena][Settle] Outcome: Winner -> ${winnerId || 'DRAW'}`);

    // Update consecutive match opponent stats dynamically (Anti-repeat opponent helper)
    if (winnerId && loserId) {
      await Promise.all([
        this.updateConsecutiveStats(winnerId, loserId, match.gameId),
        this.updateConsecutiveStats(loserId, winnerId, match.gameId)
      ]);
    }

    // 1. Process Trophy Rank adjustments if RANKED mode
    if (match.mode === 'RANKED') {
      if (winnerId && loserId) {
        await TrophyService.adjustTrophies(winnerId, match.gameId, true, match.id);
        await TrophyService.adjustTrophies(loserId, match.gameId, false, match.id);
      } else {
        // Draw: no trophy loss/gain
        console.log('[Arena][Settle] Draw in Ranked match. Trophies remain constant.');
      }
    }

    // 2. Process Escrow payouts if WAGER or CUSTOM modes
    if (match.mode === 'WAGER' || match.mode === 'CUSTOM') {
      await EscrowService.disburseWager(match.id, winnerId);
    }

    // Finalize match status to COMPLETED through centralized FSM transition guard
    const finalMatch = await this.transitionMatch(match.id, 'COMPLETED', {
      winnerId,
      resolvedAt: new Date()
    });

    // Clean up and resolve associated Arena Room status
    try {
      await prisma.arenaRoom.updateMany({
        where: { matchId: match.id },
        data: { status: 'COMPLETED' }
      });
      console.log(`[Arena][Settle] Associated ArenaRoom for match ${match.id} resolved to COMPLETED.`);
    } catch (roomErr) {
      console.warn(`[Arena][Settle] Failed to update associated custom room status:`, roomErr);
    }

    // Refresh leaderboards in background
    LeaderboardService.refreshLeaderboard(match.gameId).catch(err => {
      console.error('[Leaderboard][Error] Standing refreshes failed:', err);
    });

    return finalMatch;
  }

  private static async updateConsecutiveStats(userId: string, opponentId: string, gameId: number) {
    const rank = await TrophyService.getOrCreatePlayerRank(userId, gameId);
    const isSameOpponent = rank.lastOpponentId === opponentId;
    await prisma.playerGameRank.update({
      where: { id: rank.id },
      data: {
        lastOpponentId: opponentId,
        consecutiveOpponentCount: isSameOpponent ? { increment: 1 } : 1
      }
    });
  }
}
