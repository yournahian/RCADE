import { prisma } from '@/lib/prisma';

export class TrophyService {
  /**
   * Adjusts player trophies based on match results.
   * Win = +20 trophies, Loss = -15 trophies.
   * Win Streak (>= 3) = +5 additional trophies.
   * Trophies can never drop below 0.
   */
  static async adjustTrophies(
    userId: string,
    gameId: number,
    isWin: boolean,
    matchId: string,
    seasonId?: string
  ): Promise<{ delta: number; absoluteTrophies: number }> {
    console.log(`[Trophy][Service] Adjusting trophies for user ${userId} in game ${gameId}. Result: ${isWin ? 'WIN' : 'LOSS'}`);

    // Fetch or create the active player rank
    const playerGameRank = await this.getOrCreatePlayerRank(userId, gameId, seasonId);

    let delta = 0;
    let newStreak = playerGameRank.winStreak;

    if (isWin) {
      newStreak += 1;
      delta = 20;
      // Streak bonus: 3 or more consecutive wins gives +5 extra trophies
      if (newStreak >= 3) {
        delta += 5;
        console.log(`[Trophy][Streak] User ${userId} is on a ${newStreak} win streak! +5 bonus trophies awarded.`);
      }
    } else {
      newStreak = 0;
      delta = -15;
    }

    const currentTrophies = playerGameRank.trophies;
    let absoluteTrophies = currentTrophies + delta;
    if (absoluteTrophies < 0) {
      absoluteTrophies = 0;
      delta = -currentTrophies; // capped drop
    }

    const peakTrophies = Math.max(playerGameRank.peakTrophies, absoluteTrophies);
    const xpGain = isWin ? 50 : 15; // Fast XP progression increments

    // Transactionally update PlayerGameRank and insert TrophyHistory ledger record
    await prisma.$transaction([
      prisma.playerGameRank.update({
        where: { id: playerGameRank.id },
        data: {
          trophies: absoluteTrophies,
          peakTrophies,
          xp: { increment: xpGain },
          matchesPlayed: { increment: 1 },
          matchesWon: { increment: isWin ? 1 : 0 },
          matchesLost: { increment: isWin ? 0 : 1 },
          winStreak: newStreak,
          updatedAt: new Date()
        }
      }),
      prisma.trophyHistory.create({
        data: {
          userId,
          gameId,
          seasonId: seasonId || null,
          matchId,
          delta,
          absoluteTrophies
        }
      }),
      // Accumulate global user statistics
      prisma.playerArenaStats.upsert({
        where: { userId },
        update: {
          totalMatches: { increment: 1 },
          totalWins: { increment: isWin ? 1 : 0 },
          totalLosses: { increment: isWin ? 0 : 1 },
          totalXp: { increment: xpGain }
        },
        create: {
          userId,
          totalMatches: 1,
          totalWins: isWin ? 1 : 0,
          totalLosses: isWin ? 0 : 1,
          totalXp: xpGain
        }
      })
    ]);

    return { delta, absoluteTrophies };
  }

  static async getOrCreatePlayerRank(userId: string, gameId: number, seasonId?: string) {
    // Ensure the User record exists in the database to prevent foreign key violations
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      await prisma.user.create({
        data: {
          id: userId,
          username: `User_${userId.substring(12, 18)}`
        }
      });
    }

    let rank = await prisma.playerGameRank.findFirst({
      where: {
        userId,
        gameId,
        seasonId: seasonId || null
      }
    });

    if (!rank) {
      rank = await prisma.playerGameRank.create({
        data: {
          userId,
          gameId,
          seasonId: seasonId || null,
          trophies: 100, // starting trophies
          peakTrophies: 100
        }
      });
    }

    return rank;
  }
}

export class RankedService {
  /**
   * Retrieves user rank details.
   */
  static async getPlayerRankDetails(userId: string, gameId: number, seasonId?: string) {
    return TrophyService.getOrCreatePlayerRank(userId, gameId, seasonId);
  }

  /**
   * Translates absolute trophies into clean Arcade Ladder Tier names.
   */
  static getTrophyLadderTier(trophies: number): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'GRANDMASTER' {
    if (trophies < 300) return 'BRONZE';
    if (trophies < 800) return 'SILVER';
    if (trophies < 1500) return 'GOLD';
    if (trophies < 2500) return 'PLATINUM';
    return 'GRANDMASTER';
  }
}
