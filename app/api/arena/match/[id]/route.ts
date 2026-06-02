import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { ArenaService } from '@/services/arena/ArenaService';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
      await privy.verifyAuthToken(token);
    } catch (authErr: any) {
      console.warn('[Arena][API][MatchDetails] Authentication rejected:', authErr.message);
      return NextResponse.json({ error: 'Unauthorized', details: authErr.message }, { status: 401 });
    }

    if (!matchId) {
      return NextResponse.json({ error: 'Invalid match ID parameter' }, { status: 400 });
    }

    let match;
    try {
      match = await prisma.arenaMatch.findUnique({
        where: { id: matchId },
        include: {
          player1: { select: { username: true } },
          player2: { select: { username: true } }
        }
      });
    } catch (dbErr: any) {
      console.error('[Arena][API][MatchDetails] Database query failed:', dbErr);
      return NextResponse.json({ error: 'Database query exception', details: dbErr.message }, { status: 500 });
    }

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const toIsoString = (val: any) => {
      if (!val) return null;
      return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
    };

    const formattedPlayers = [
      {
        userId: match.player1Id,
        username: match.player1?.username || 'Challenger',
        score: match.player1Score,
        status: match.player1Status,
        submittedAt: toIsoString(match.player1SubmittedAt)
      },
      {
        userId: match.player2Id,
        username: match.player2?.username || 'Defender',
        score: match.player2Score,
        status: match.player2Status,
        submittedAt: toIsoString(match.player2SubmittedAt)
      }
    ];

    return NextResponse.json({
      id: match.id,
      gameId: match.gameId,
      mode: match.mode,
      roomCode: match.roomCode,
      status: match.status,
      winnerId: match.winnerId,
      createdAt: toIsoString(match.createdAt),
      resolvedAt: toIsoString(match.resolvedAt),
      players: formattedPlayers
    });

  } catch (error: any) {
    console.error('[Arena][API][MatchDetails] General exception:', error);
    return NextResponse.json({ error: 'Internal server exception', details: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matchId } = await params;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    if (!matchId) {
      return NextResponse.json({ error: 'Invalid match ID parameter' }, { status: 400 });
    }

    const match = await prisma.arenaMatch.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (match.player1Id !== userId && match.player2Id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow cancelling queued/matched/countdown states before gameplay active
    if (match.status === 'QUEUED' || match.status === 'MATCHED' || match.status === 'COUNTDOWN') {
      await ArenaService.updateMatchStatus(matchId, 'CANCELLED');
      return NextResponse.json({ success: true, message: 'Match successfully cancelled' });
    }

    return NextResponse.json({ error: 'Match cannot be cancelled once active' }, { status: 400 });

  } catch (error: any) {
    console.error('[Arena][API][Match][Cancel] Failed to cancel match:', error);
    return NextResponse.json({ error: 'Internal server exception', details: error.message }, { status: 500 });
  }
}
