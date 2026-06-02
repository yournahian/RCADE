import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { ArenaService } from '@/services/arena/ArenaService';
import { isAllowed } from '@/lib/arena/rate-limiter';
import { getArenaFlags } from '@/lib/arena/flags';
import { RealtimeService } from '@/services/arena/RealtimeService';

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

    // 2. Sliding Rate Limit: Max 10 completes per minute per Privy ID
    const userLimitKey = `rate:complete:${userId}`;
    if (!isAllowed(userLimitKey, 10, 60000)) {
      return NextResponse.json({ error: 'Too many submissions. Please wait.' }, { status: 429 });
    }

    // 3. Central feature flags verify
    const flags = getArenaFlags();
    if (!flags.ARENA_ENABLED) {
      return NextResponse.json({ error: 'Arena is disabled.' }, { status: 503 });
    }

    // 4. Verify Payload Budget Constraints (max 128KB)
    const textBody = await req.text();
    if (textBody.length > 128 * 1024) {
      console.warn(`[Arena][Session][Violation] Payload size exceeded limit: ${textBody.length} bytes`);
      return NextResponse.json({ error: 'Payload size exceeds 128KB limit' }, { status: 413 });
    }

    let body;
    try {
      body = JSON.parse(textBody);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const { matchId, score, duration, replayInputs, seed, completed } = body;

    const parsedScore = parseInt(score, 10);
    const parsedDuration = parseInt(duration, 10);
    const parsedCompleted = completed !== false; // default to true unless explicitly false

    if (!matchId || isNaN(parsedScore) || isNaN(parsedDuration)) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
    }

    // 5. Authoritatively complete the match
    const result = await ArenaService.completeMatch(
      matchId,
      userId,
      parsedScore,
      parsedDuration,
      replayInputs || {},
      seed || 'system-seed-v1',
      parsedCompleted
    );

    // 6. Broadcast match updates in real-time via SSE
    await RealtimeService.publishMatchUpdate(
      matchId,
      result.match.player1Id,
      result.match.player2Id,
      result.match.status,
      result.match
    );

    return NextResponse.json({ success: true, match: result.match });

  } catch (error: any) {
    console.error('[Arena][Session][API][Complete] Complete handler failed:', error);
    return NextResponse.json({
      error: 'Score submission verification rejected',
      details: error.message || 'Verification exception'
    }, { status: 500 });
  }
}
