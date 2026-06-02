import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { RoomService } from '@/services/arena/RoomService';
import { RealtimeService } from '@/services/arena/RealtimeService';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    const body = await req.json();
    const { gameId, wagerAmount } = body;

    const parsedGameId = parseInt(gameId, 10);
    if (isNaN(parsedGameId)) {
      return NextResponse.json({ error: 'Invalid gameId parameter' }, { status: 400 });
    }

    const room = await RoomService.createRoom(userId, parsedGameId, wagerAmount || null);

    return NextResponse.json(room);

  } catch (error: any) {
    console.error('[Arena][Room][API] Create room failed:', error);
    return NextResponse.json({ error: error.message || 'Lobby creation failed' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    const body = await req.json();
    const { roomCode } = body;

    if (!roomCode) {
      return NextResponse.json({ error: 'Missing roomCode parameter' }, { status: 400 });
    }

    const room = await RoomService.joinRoom(userId, roomCode);

    // Publish join event to the room code topic and creators
    RealtimeService.publishRoomJoin(room.roomCode, userId, 'READY');
    RealtimeService.publish(`user:${room.creatorId}`, 'ROOM_JOIN', room);

    return NextResponse.json(room);

  } catch (error: any) {
    console.error('[Arena][Room][API] Join room failed:', error);
    return NextResponse.json({ error: error.message || 'Lobby join failed' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    const body = await req.json();
    const { roomCode } = body;

    if (!roomCode) {
      return NextResponse.json({ error: 'Missing roomCode parameter' }, { status: 400 });
    }

    // Start match
    const match = await RoomService.startRoomMatch(roomCode);

    // Notify guest player immediately via SSE
    await RealtimeService.publishMatchUpdate(match.id, match.player1Id, match.player2Id, 'ACTIVE', match);

    return NextResponse.json(match);

  } catch (error: any) {
    console.error('[Arena][Room][API] Start match failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to start custom room match' }, { status: 400 });
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

    const { searchParams } = new URL(req.url);
    const roomCode = searchParams.get('roomCode');

    if (!roomCode) {
      return NextResponse.json({ error: 'Missing roomCode parameter' }, { status: 400 });
    }

    const room = await RoomService.leaveRoom(userId, roomCode);

    // Notify participants via SSE global registry
    if (room.status === 'CANCELLED') {
      RealtimeService.publish(`user:${room.creatorId}`, 'ROOM_JOIN', room);
      if (room.guestId) {
        RealtimeService.publish(`user:${room.guestId}`, 'ROOM_JOIN', room);
      }
    } else {
      // Guest left, room status returned back to LOBBY
      RealtimeService.publish(`user:${room.creatorId}`, 'ROOM_JOIN', room);
    }

    return NextResponse.json({ success: true, room });

  } catch (error: any) {
    console.error('[Arena][Room][API] Exit/cancel lobby failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to exit lobby' }, { status: 400 });
  }
}
