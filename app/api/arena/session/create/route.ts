import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { isAllowed } from '@/lib/arena/rate-limiter';
import { getArenaFlags } from '@/lib/arena/flags';
import crypto from 'crypto';

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

    // 2. Dynamic Rate Limiting: Max 5 session requests per minute per Privy DID
    const rateLimitKey = `rate:session_create:${userId}`;
    if (!isAllowed(rateLimitKey, 5, 60000)) {
      return NextResponse.json({ error: 'Session creation rate limit exceeded. Please wait a moment.' }, { status: 429 });
    }

    // 3. Central Feature Flag verify
    const flags = getArenaFlags();
    if (!flags.ARENA_ENABLED) {
      return NextResponse.json({ error: 'Competitive Arena is currently disabled.' }, { status: 503 });
    }

    const body = await req.json();
    const { matchId } = body;

    if (!matchId || typeof matchId !== 'string') {
      return NextResponse.json({ error: 'Invalid matchId parameter' }, { status: 400 });
    }

    // 4. Validate Match & Player Eligibility
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true }
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Confirm that match is active (paired)
    if (match.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Match is not active (Status: ${match.status})` }, { status: 403 });
    }

    // Confirm that player is part of the match
    const playerInMatch = match.players.some(p => p.userId === userId);
    if (!playerInMatch) {
      return NextResponse.json({ error: 'User is not a participant in this match' }, { status: 403 });
    }

    // 5. Idempotent check: If there is already an active session for this user in this match, return it
    const existingSession = await prisma.matchSession.findFirst({
      where: {
        matchId,
        userId,
        status: 'ACTIVE'
      }
    });

    if (existingSession) {
      console.log(`[Arena][Session] Returning existing active session for User: ${userId} | Match: ${matchId} | Session: ${existingSession.id}`);
      return NextResponse.json({
        sessionId: existingSession.id,
        clientSalt: existingSession.clientSalt,
        sessionSeed: existingSession.sessionSeed
      });
    }

    // 6. Generate dynamic cryptographic parameters (unguessable seeds and salts)
    const clientSalt = crypto.randomBytes(16).toString('hex');
    const sessionSeed = crypto.randomBytes(16).toString('hex');

    // 7. Register the MatchSession row
    const newSession = await prisma.matchSession.create({
      data: {
        matchId,
        userId,
        clientSalt,
        sessionSeed,
        status: 'ACTIVE'
      }
    });

    // Update individual player status in database
    await prisma.matchPlayer.update({
      where: { matchId_userId: { matchId, userId } },
      data: { 
        sessionId: newSession.id,
        status: 'PLAYING'
      }
    });

    console.log(`[Arena][Session] State Transition resolved. Created session for User: ${userId} | Match: ${matchId} | Session: ${newSession.id}`);

    return NextResponse.json({
      sessionId: newSession.id,
      clientSalt,
      sessionSeed
    });

  } catch (error: any) {
    console.error('[Arena][Session][API] Session creation fatal error:', error);
    
    // Fail Open path
    return NextResponse.json({
      error: 'Failed to initialize gameplay session',
      details: error.message || 'Internal exception'
    }, { status: 500 });
  }
}
