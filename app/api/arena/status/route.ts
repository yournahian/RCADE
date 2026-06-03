import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { TrophyService } from '@/services/arena/TrophyService';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    const { searchParams } = new URL(req.url);
    const gameId = parseInt(searchParams.get('gameId') || '1', 10);

    // 1. Scan for any active Arena Match engagements
    const activeMatch = await prisma.arenaMatch.findFirst({
      where: {
        status: { in: ['QUEUED', 'MATCHED', 'COUNTDOWN', 'ACTIVE', 'SUBMITTED', 'VERIFIED'] },
        OR: [
          { player1Id: userId },
          { player2Id: userId }
        ]
      }
    });

    // Clean up expired queue tickets globally to prevent ghost queue redirects
    try {
      await prisma.arenaQueue.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
    } catch (err) {
      console.warn('[Arena][Status][Cleanup] Failed to clean up expired queues:', err);
    }

    // 2. Scan for any active Custom Room lobbies (only if not actively queuing)
    const activeQueue = await prisma.arenaQueue.findUnique({
      where: { userId }
    });

    // Clean up stale custom rooms (>10 mins old) to prevent ghost redirects
    try {
      await prisma.arenaRoom.updateMany({
        where: {
          status: { in: ['LOBBY', 'READY'] },
          createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) }
        },
        data: { status: 'CANCELLED' }
      });
    } catch (err) {
      console.warn('[Arena][Status][Cleanup] Failed to clean up stale rooms:', err);
    }

    // Clean up stale active matches (>10 mins old) to prevent ghost redirects
    try {
      await prisma.arenaMatch.updateMany({
        where: {
          status: { in: ['QUEUED', 'MATCHED', 'COUNTDOWN', 'ACTIVE', 'SUBMITTED', 'VERIFIED'] },
          createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) }
        },
        data: { status: 'CANCELLED' }
      });
    } catch (err) {
      console.warn('[Arena][Status][Cleanup] Failed to clean up stale matches:', err);
    }

    let activeRoom = null;
    if (!activeQueue) {
      activeRoom = await prisma.arenaRoom.findFirst({
        where: {
          gameId,
          status: { in: ['LOBBY', 'READY'] },
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // Only fetch fresh rooms created in the last 10 minutes
          OR: [
            { creatorId: userId },
            { guestId: userId }
          ]
        }
      });
    }

    // 3. Fetch Player Game Rank using Trophy Service helper
    const rank = await TrophyService.getOrCreatePlayerRank(userId, gameId);

    return NextResponse.json({
      activeMatchId: activeMatch ? activeMatch.id : null,
      activeRoom: activeRoom ? {
        id: activeRoom.id,
        roomCode: activeRoom.roomCode,
        wagerAmount: activeRoom.wagerAmount,
        creatorId: activeRoom.creatorId,
        guestId: activeRoom.guestId,
        status: activeRoom.status
      } : null,
      activeQueue: activeQueue ? {
        id: activeQueue.id,
        mode: activeQueue.mode,
        gameId: activeQueue.gameId,
        wagerAmount: activeQueue.wagerAmount,
        joinedAt: activeQueue.joinedAt instanceof Date 
          ? activeQueue.joinedAt.toISOString() 
          : new Date(activeQueue.joinedAt).toISOString()
      } : null,
      rank
    });


  } catch (error: any) {
    console.error('[Arena][API][Status] Stale recovery status failed:', error);
    return NextResponse.json({ error: 'Internal status failure', details: error.message }, { status: 500 });
  }
}
