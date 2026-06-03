import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { RealtimeService } from '@/services/arena/RealtimeService';

export async function POST(req: Request) {
  try {
    // 1. Authenticate user via Privy
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    const body = await req.json();
    const { action, matchId } = body;

    if (!action || !matchId) {
      return NextResponse.json({ error: 'Missing action or matchId parameters' }, { status: 400 });
    }

    // 2. Fetch the completed match
    const match = await prisma.arenaMatch.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (match.mode !== 'CUSTOM') {
      return NextResponse.json({ error: 'Rematch is only supported in custom private lobbies' }, { status: 400 });
    }

    // Ensure user is a participant
    if (match.player1Id !== userId && match.player2Id !== userId) {
      return NextResponse.json({ error: 'Forbidden: User is not a participant in this match' }, { status: 403 });
    }

    const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;

    if (action === 'request') {
      // Find sender details
      const sender = await prisma.user.findUnique({ where: { id: userId } });
      const senderUsername = sender?.username || `Player_${userId.substring(12, 18)}`;

      console.log(`[Rematch][Request] User ${userId} (${senderUsername}) requesting rematch for match ${matchId} to opponent ${opponentId}`);

      // Publish REMATCH_REQUEST to the opponent via SSE
      RealtimeService.publish(`user:${opponentId}`, 'REMATCH_REQUEST', {
        matchId,
        senderId: userId,
        senderUsername,
        roomCode: match.roomCode
      });

      return NextResponse.json({ success: true, message: 'Rematch request sent' });
    }

    if (action === 'decline') {
      const sender = await prisma.user.findUnique({ where: { id: userId } });
      const senderUsername = sender?.username || `Player_${userId.substring(12, 18)}`;

      console.log(`[Rematch][Decline] User ${userId} (${senderUsername}) declined rematch for match ${matchId} to opponent ${opponentId}`);

      // Publish REMATCH_DECLINED to the opponent via SSE
      RealtimeService.publish(`user:${opponentId}`, 'REMATCH_DECLINED', {
        matchId,
        senderId: userId,
        senderUsername
      });

      return NextResponse.json({ success: true, message: 'Rematch declined' });
    }

    if (action === 'leave') {
      const sender = await prisma.user.findUnique({ where: { id: userId } });
      const senderUsername = sender?.username || `Player_${userId.substring(12, 18)}`;

      console.log(`[Rematch][Leave] User ${userId} (${senderUsername}) left results page for match ${matchId} to opponent ${opponentId}`);

      // Publish OPPONENT_LEFT to the opponent via SSE
      RealtimeService.publish(`user:${opponentId}`, 'OPPONENT_LEFT', {
        matchId,
        senderId: userId,
        senderUsername
      });

      return NextResponse.json({ success: true, message: 'Leave notification sent' });
    }

    if (action === 'start') {
      console.log(`[Rematch][Start] User ${userId} starting rematch match ${matchId} for both players...`);

      // Publish REMATCH_START to both participants via SSE
      RealtimeService.publish(`user:${match.player1Id}`, 'REMATCH_START', {
        matchId: match.id,
        roomCode: match.roomCode,
        gameId: match.gameId
      });
      RealtimeService.publish(`user:${match.player2Id}`, 'REMATCH_START', {
        matchId: match.id,
        roomCode: match.roomCode,
        gameId: match.gameId
      });

      return NextResponse.json({ success: true, message: 'Rematch started' });
    }

    if (action === 'accept') {
      console.log(`[Rematch][Accept] User ${userId} accepted rematch for match ${matchId}. Creating new match...`);

      if (!match.roomCode) {
        return NextResponse.json({ error: 'No room code associated with this match' }, { status: 400 });
      }

      const room = await prisma.arenaRoom.findUnique({
        where: { roomCode: match.roomCode }
      });

      if (!room) {
        return NextResponse.json({ error: 'Associated custom room lobby not found' }, { status: 404 });
      }

      // 3. Create a fresh consecutive CUSTOM match
      let newMatch = await prisma.arenaMatch.create({
        data: {
          gameId: match.gameId,
          mode: 'CUSTOM',
          roomCode: match.roomCode,
          status: 'ACTIVE',
          player1Id: match.player1Id,
          player2Id: match.player2Id
        }
      });

      // Handle custom wagers in Escrow for consecutive rematch rounds
      if (room.wagerAmount && parseFloat(room.wagerAmount) > 0) {
        try {
          const { EscrowService } = require('@/services/arena/EscrowService');
          const escrowId = await EscrowService.holdWager(
            newMatch.id,
            match.player1Id,
            match.player2Id,
            room.wagerAmount,
            true // isCustomRoom = true triggers 10% platform fee
          );

          newMatch = await prisma.arenaMatch.update({
            where: { id: newMatch.id },
            data: { escrowId }
          });
          console.log(`[Rematch][Escrow] Locked wager escrow ${escrowId} for rematch match ${newMatch.id}`);
        } catch (escrowErr: any) {
          console.error('[Rematch][Escrow][Error] Failed to hold wager for rematch match:', escrowErr);
          // Delete created match to keep db clean
          await prisma.arenaMatch.delete({ where: { id: newMatch.id } });
          return NextResponse.json({ error: escrowErr.message || 'Rematch failed: Insufficient balance for wager stake.' }, { status: 400 });
        }
      }

      // 4. Update the room to PLAYING and reference the new match
      await prisma.arenaRoom.update({
        where: { id: room.id },
        data: {
          status: 'PLAYING',
          matchId: newMatch.id
        }
      });

      // Compile payload
      const payload = {
        matchId: newMatch.id,
        roomCode: match.roomCode,
        gameId: match.gameId
      };

      console.log(`[Rematch][Accepted] Rematch started successfully: ${newMatch.id}. Broadcasting to both players.`);

      // 5. Broadcast REMATCH_ACCEPTED to both participants via SSE
      RealtimeService.publish(`user:${match.player1Id}`, 'REMATCH_ACCEPTED', payload);
      RealtimeService.publish(`user:${match.player2Id}`, 'REMATCH_ACCEPTED', payload);

      return NextResponse.json({ success: true, match: newMatch });
    }

    return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 });

  } catch (error: any) {
    console.error('[Arena][Rematch][API] Rematch handler failed:', error);
    return NextResponse.json({
      error: 'Failed to process rematch transaction',
      details: error.message || 'Server error'
    }, { status: 500 });
  }
}
