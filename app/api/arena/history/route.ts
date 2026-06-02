import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    // Fetch player's Arena Matches
    const userMatches = await prisma.arenaMatch.findMany({
      where: {
        OR: [
          { player1Id: userId },
          { player2Id: userId }
        ]
      },
      include: {
        player1: { select: { username: true } },
        player2: { select: { username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const history = userMatches.map(match => {
      const isPlayer1 = match.player1Id === userId;
      const myScore = isPlayer1 ? (match.player1Score ?? 0) : (match.player2Score ?? 0);
      const oppScore = isPlayer1 ? (match.player2Score ?? 0) : (match.player1Score ?? 0);
      const opponentName = isPlayer1 
        ? (match.player2?.username || 'CyberPlayer') 
        : (match.player1?.username || 'CyberPlayer');

      let outcome: 'VICTORY' | 'DEFEAT' | 'DRAW' | 'PENDING' | 'CANCELLED' = 'PENDING';

      if (match.status === 'COMPLETED') {
        if (match.winnerId === userId) {
          outcome = 'VICTORY';
        } else if (match.winnerId === null) {
          outcome = 'DRAW';
        } else {
          outcome = 'DEFEAT';
        }
      } else if (match.status === 'CANCELLED') {
        outcome = 'CANCELLED';
      }

      const toIsoString = (val: any) => {
        if (!val) return null;
        return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
      };

      return {
        matchId: match.id,
        opponent: opponentName,
        outcome,
        myScore,
        oppScore,
        resolvedAt: match.resolvedAt ? toIsoString(match.resolvedAt) : toIsoString(match.createdAt)
      };
    });

    return NextResponse.json({ history });

  } catch (error: any) {
    console.error('[Arena][API][History] History fetch exception:', error);
    return NextResponse.json({ error: 'Internal server failure', details: error.message }, { status: 500 });
  }
}
