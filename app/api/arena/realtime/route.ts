import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { RealtimeService } from '@/services/arena/RealtimeService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: missing Privy access token parameter' }, { status: 401 });
    }

    // Authenticate client Privy DID
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Heartbeat timer to keep SSE socket connection active
        const heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(':keepalive\n\n'));
          } catch {}
        }, 15000);

        const listenerId = `sse_${userId}_${Date.now()}`;

        // Subscribe to user-specific and global channels
        const unsubscribeUser = RealtimeService.subscribe(`user:${userId}`, listenerId, (packet) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          } catch {}
        });

        const unsubscribeGlobal = RealtimeService.subscribe('global', listenerId, (packet) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          } catch {}
        });

        // Subscribe to queue activity channels for all live game IDs (1-10 range)
        // so QUEUE_ACTIVITY events reach the client in real time
        const queueUnsubscribers: Array<() => void> = [];
        for (let gId = 1; gId <= 10; gId++) {
          const unsub = RealtimeService.subscribe(`queue:${gId}`, listenerId, (packet) => {
            try {
              const msg = { event: 'QUEUE_ACTIVITY', data: packet.data };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
            } catch {}
          });
          queueUnsubscribers.push(unsub);
        }

        // Publish connection confirm event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'CONNECTED', data: { userId } })}\n\n`));

        req.signal.addEventListener('abort', () => {
          console.log(`[Realtime][SSE] Connection aborted by client: ${listenerId}`);
          clearInterval(heartbeatInterval);
          unsubscribeUser();
          unsubscribeGlobal();
          queueUnsubscribers.forEach(fn => fn());

          // Grace period watchdog: check if player is in an active match and has disconnected permanently
          setTimeout(async () => {
            try {
              const { prisma } = require('@/lib/prisma');
              const { ArenaService } = require('@/services/arena/ArenaService');
              const { RealtimeService } = require('@/services/arena/RealtimeService');

              // Check if the user is currently in an ACTIVE match
              const activeMatch = await prisma.arenaMatch.findFirst({
                where: {
                  status: 'ACTIVE',
                  OR: [
                    { player1Id: userId },
                    { player2Id: userId }
                  ]
                }
              });

              if (!activeMatch) {
                // User is not in an active match, no watchdog action needed
                return;
              }

              // Prevent race conditions: do not forfeit if the match was created less than 20 seconds ago (initial loading transition)
              const matchAgeMs = Date.now() - new Date(activeMatch.createdAt).getTime();
              if (matchAgeMs < 20000) {
                console.log(`[Realtime][SSE][Watchdog] Match ${activeMatch.id} was created recently (${matchAgeMs}ms ago). Bypassing watchdog forfeit to allow initial page loading.`);
                return;
              }


              // Check if they re-established a connection (any active listener exists)
              const stillConnected = RealtimeService.isUserConnected(userId);
              if (stillConnected) {
                console.log(`[Realtime][SSE][Watchdog] User ${userId} successfully reconnected within grace period. No forfeit triggered.`);
                return;
              }

              console.warn(`[Realtime][SSE][Watchdog] User ${userId} disconnected beyond 5s grace period. Settle match as forfeit.`);

              // Determine the opponent user ID who wins
              const opponentId = activeMatch.player1Id === userId ? activeMatch.player2Id : activeMatch.player1Id;

              // Force-settle the match with the opponent as the winner
              const settledMatch = await ArenaService.settleArenaMatch(activeMatch.id, opponentId);

              const completedAt = settledMatch.resolvedAt ? settledMatch.resolvedAt.toISOString() : new Date().toISOString();

              const matchCompletedPayload = {
                matchId: activeMatch.id,
                winnerId: opponentId,
                loserId: userId,
                reason: 'DISCONNECT_FORFEIT',
                completedAt
              };

              // Broadcast MATCH_COMPLETED to both players
              RealtimeService.publish(`user:${activeMatch.player1Id}`, 'MATCH_COMPLETED', matchCompletedPayload);
              RealtimeService.publish(`user:${activeMatch.player2Id}`, 'MATCH_COMPLETED', matchCompletedPayload);

              // Broadcast COMPLETED update to all players
              await RealtimeService.publishMatchUpdate(activeMatch.id, activeMatch.player1Id, activeMatch.player2Id, 'COMPLETED', settledMatch);
              console.log(`[Realtime][SSE][Watchdog] Settle completed. Match ${activeMatch.id} marked COMPLETED due to user ${userId} forfeit.`);

            } catch (err: any) {
              console.error(`[Realtime][SSE][Watchdog][Error] Grace watchdog settlement failed:`, err);
            }
          }, 5000); // 5-second grace period

          // Room Grace period watchdog: check if player is in a LOBBY/READY room and has disconnected permanently
          setTimeout(async () => {
            try {
              const { prisma } = require('@/lib/prisma');
              const { RoomService } = require('@/services/arena/RoomService');
              const { RealtimeService } = require('@/services/arena/RealtimeService');

              // Check if the user is currently in a LOBBY or READY room
              const activeRoom = await prisma.arenaRoom.findFirst({
                where: {
                  status: { in: ['LOBBY', 'READY'] },
                  OR: [
                    { creatorId: userId },
                    { guestId: userId }
                  ]
                }
              });

              if (!activeRoom) {
                return;
              }

              // Check if they reconnected
              const stillConnected = RealtimeService.isUserConnected(userId);
              if (stillConnected) {
                console.log(`[Realtime][SSE][RoomWatchdog] User ${userId} successfully reconnected within grace period. Custom room retained.`);
                return;
              }

              console.warn(`[Realtime][SSE][RoomWatchdog] User ${userId} disconnected beyond 8s grace period. Cleaning up custom room.`);

              // Leave/cancel room authoritatively
              const updatedRoom = await RoomService.leaveRoom(userId, activeRoom.roomCode);

              // Broadcast update to remaining players via SSE
              if (updatedRoom.status === 'CANCELLED') {
                RealtimeService.publish(`user:${updatedRoom.creatorId}`, 'ROOM_JOIN', updatedRoom);
                if (updatedRoom.guestId) {
                  RealtimeService.publish(`user:${updatedRoom.guestId}`, 'ROOM_JOIN', updatedRoom);
                }
              } else {
                // Guest left, status returned to LOBBY
                RealtimeService.publish(`user:${updatedRoom.creatorId}`, 'ROOM_JOIN', updatedRoom);
              }
              console.log(`[Realtime][SSE][RoomWatchdog] Cleaned up custom room ${activeRoom.roomCode} for user ${userId}.`);

            } catch (err: any) {
              console.error(`[Realtime][SSE][RoomWatchdog][Error] Grace room watchdog cleanup failed:`, err);
            }
          }, 8000); // 8-second grace period
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });

  } catch (err: any) {
    console.error('[Realtime][SSE][Error] Connection initiation failed:', err);
    return NextResponse.json({ error: 'Failed to establish realtime stream' }, { status: 500 });
  }
}
