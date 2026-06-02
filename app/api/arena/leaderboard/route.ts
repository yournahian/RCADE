import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gameIdParam = searchParams.get('gameId') || '1';

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    await privy.verifyAuthToken(token);

    const gameId = parseInt(gameIdParam, 10);
    if (isNaN(gameId)) {
      return NextResponse.json({ error: 'Invalid gameId parameter' }, { status: 400 });
    }

    // Query top 100 ranks ordered by Trophies
    const ranks = await prisma.playerGameRank.findMany({
      where: { gameId },
      orderBy: { trophies: 'desc' },
      take: 100,
      include: {
        user: {
          select: { username: true }
        }
      }
    });

    const formattedLeaderboard = ranks.map((r, index) => {
      const winRate = r.matchesPlayed > 0 
        ? `${((r.matchesWon / r.matchesPlayed) * 100).toFixed(1)}%` 
        : '0.0%';
        
      return {
        rank: index + 1,
        username: r.user?.username || r.userId.substring(0, 12) || 'CyberPlayer',
        trophies: r.trophies,
        winRate,
        matchesPlayed: r.matchesPlayed
      };
    });

    return NextResponse.json({ leaderboard: formattedLeaderboard });

  } catch (error: any) {
    console.error('[Arena][API][Leaderboard] Standings fetch failed:', error);
    return NextResponse.json({ error: 'Internal standings exception', details: error.message }, { status: 500 });
  }
}
