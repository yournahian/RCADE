import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { ArenaService } from '@/services/arena/ArenaService';
import { RealtimeService } from '@/services/arena/RealtimeService';
import { isAllowed } from '@/lib/arena/rate-limiter';
import { getArenaFlags } from '@/lib/arena/flags';

export async function POST(req: Request) {
  try {
    // 1. Privy Authenticate
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    // 2. Sliding Rate Limit: Max 10 submissions per minute per Privy ID
    const userLimitKey = `rate:dead:${userId}`;
    if (!isAllowed(userLimitKey, 10, 60000)) {
      return NextResponse.json({ error: 'Too many submissions. Please wait.' }, { status: 429 });
    }

    // 3. Central feature flags verify
    const flags = getArenaFlags();
    if (!flags.ARENA_ENABLED) {
      return NextResponse.json({ error: 'Arena is disabled.' }, { status: 503 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const { matchId } = body;
    if (!matchId) {
      return NextResponse.json({ error: 'Missing matchId parameter' }, { status: 400 });
    }

    // 4. Retrieve match details
    const match = await prisma.arenaMatch.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // 5. Prevent duplicate finalization
    if (match.status === 'COMPLETED') {
      console.log(`[Arena][Session][Dead] Match ${matchId} is already completed. Returning early.`);
      return NextResponse.json({ success: true, message: 'Match already completed', match });
    }

    if (match.status !== 'ACTIVE' && match.status !== 'MATCHED' && match.status !== 'COUNTDOWN') {
      return NextResponse.json({ error: `Cannot register player death in state: ${match.status}` }, { status: 400 });
    }

    // 6. Ensure caller is a participant
    if (match.player1Id !== userId && match.player2Id !== userId) {
      return NextResponse.json({ error: 'User is not a registered player in this match' }, { status: 403 });
    }

    // 7. Authoritatively settle the match with the other player as the winner
    const loserId = userId;
    const winnerId = match.player1Id === userId ? match.player2Id : match.player1Id;

    console.log(`[ARENA_SERVER] PLAYER_DEAD received - Loser: ${loserId} | Winner: ${winnerId} | Match: ${matchId}`);

    const settledMatch = await ArenaService.settleArenaMatch(matchId, winnerId);
    console.log(`[ARENA_SERVER] ArenaMatch finalized in database: ${matchId}`);

    const completedAt = settledMatch.resolvedAt ? settledMatch.resolvedAt.toISOString() : new Date().toISOString();

    const matchCompletedPayload = {
      matchId,
      winnerId,
      loserId,
      reason: 'FIRST_BLOOD',
      completedAt
    };

    console.log(`[ARENA_SERVER] MATCH_COMPLETED broadcast - Match: ${matchId} | Payload:`, matchCompletedPayload);

    // 8. Authoritative broadcast of MATCH_COMPLETED to both players
    RealtimeService.publish(`user:${match.player1Id}`, 'MATCH_COMPLETED', matchCompletedPayload);
    RealtimeService.publish(`user:${match.player2Id}`, 'MATCH_COMPLETED', matchCompletedPayload);
    console.log(`[ARENA_SERVER] MATCH_COMPLETED broadcast emitted for both players: ${match.player1Id} and ${match.player2Id}`);

    // Also broadcast standard MATCH_UPDATE for backward compatibility & page state syncing
    await RealtimeService.publishMatchUpdate(
      matchId,
      match.player1Id,
      match.player2Id,
      'COMPLETED',
      settledMatch
    );

    return NextResponse.json({ success: true, match: settledMatch, matchCompletedPayload });

  } catch (error: any) {
    console.error('[Arena][Session][API][Dead] Dead handler failed:', error);
    return NextResponse.json({
      error: 'Failed to record player death authoritatively',
      details: error.message || 'Server error'
    }, { status: 500 });
  }
}
