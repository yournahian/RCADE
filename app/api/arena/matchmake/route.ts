import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { MatchmakingService } from '@/services/arena/MatchmakingService';
import { isAllowed } from '@/lib/arena/rate-limiter';
import { getArenaFlags } from '@/lib/arena/flags';

export async function POST(req: Request) {
  try {
    // 1. Authenticate Privy user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    // 2. Validate Rate Limiting (max 6 matchmake actions per minute)
    const rateLimitKey = `rate:matchmake:${userId}`;
    if (!isAllowed(rateLimitKey, 6, 60000)) {
      return NextResponse.json({ error: 'Matchmaking rate limit exceeded. Please wait a moment.' }, { status: 429 });
    }

    // 3. Central Feature Flag Check
    const flags = getArenaFlags();
    if (!flags.ARENA_ENABLED) {
      return NextResponse.json({ error: 'Competitive Arena is currently disabled for maintenance.' }, { status: 503 });
    }

    const body = await req.json();
    const { gameId, mode, wagerAmount, region, ping } = body;

    const parsedGameId = parseInt(gameId, 10);
    if (isNaN(parsedGameId)) {
      return NextResponse.json({ error: 'Invalid gameId parameter' }, { status: 400 });
    }

    if (!['CASUAL', 'RANKED', 'WAGER'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode parameter' }, { status: 400 });
    }

    // 4. Trigger Matchmaker Queue
    const result = await MatchmakingService.enqueue(
      userId,
      parsedGameId,
      mode as 'CASUAL' | 'RANKED' | 'WAGER',
      wagerAmount || null,
      region || 'global',
      ping ? parseInt(ping, 10) : 50
    );

    // Broadcast queue activity update to the SSE stream
    const activity = await MatchmakingService.getQueueActivity(parsedGameId);
    const { RealtimeService } = require('@/services/arena/RealtimeService');
    RealtimeService.publishQueueUpdate(parsedGameId, activity.activeQueuers, activity.activeMatches);

    // If paired, publish match ready to both players immediately
    if (result.match) {
      await RealtimeService.publishMatchUpdate(
        result.match.id,
        result.match.player1Id,
        result.match.player2Id,
        'MATCHED',
        result.match
      );
    }

    return NextResponse.json({
      matchId: result.match?.id || null,
      status: result.status
    });

  } catch (error: any) {
    console.error('[Arena][Matchmake][API] Matchmaking enqueue failed:', error);
    return NextResponse.json({
      error: 'Matchmaking failed to initialize',
      details: error.message || 'Internal exception'
    }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    // Remove user from all queue tickets
    await MatchmakingService.dequeue(userId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Arena][Matchmake][API] Matchmaking dequeue failed:', error);
    return NextResponse.json({ error: 'Failed to cancel matchmaking queue search' }, { status: 500 });
  }
}
