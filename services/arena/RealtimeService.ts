type RealtimeListener = (data: any) => void;

const globalForRealtime = globalThis as unknown as {
  realtimeListeners: Map<string, Set<{ id: string; callback: RealtimeListener }>> | undefined;
};

const listeners = globalForRealtime.realtimeListeners ?? new Map();
globalForRealtime.realtimeListeners = listeners;

export class RealtimeService {
  private static get listeners() {
    return listeners;
  }

  /**
   * Subscribes a client to a specific real-time channel.
   * Channels can be "user:{userId}", "room:{roomCode}", "queue", or "global".
   */
  static subscribe(channel: string, listenerId: string, callback: RealtimeListener): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }

    const channelListeners = this.listeners.get(channel)!;
    channelListeners.add({ id: listenerId, callback });

    console.log(`[Realtime][Sub] Client ${listenerId} subscribed to channel: ${channel}`);

    // Return unsubscribe callback
    return () => {
      const active = this.listeners.get(channel);
      if (active) {
        // filter out listenerId
        for (const item of active) {
          if (item.id === listenerId) {
            active.delete(item);
            break;
          }
        }
        if (active.size === 0) {
          this.listeners.delete(channel);
        }
      }
      console.log(`[Realtime][Unsub] Client ${listenerId} removed from channel: ${channel}`);
    };
  }

  /**
   * Broadcasts a real-time event packet down to all active channel subscribers.
   */
  static publish(channel: string, eventName: string, payload: any): void {
    const channelListeners = this.listeners.get(channel);
    if (!channelListeners || channelListeners.size === 0) {
      console.log(`[ARENA_SERVER] [Realtime][Publish] 0 active listeners on channel: ${channel} for event: ${eventName}`);
      return;
    }

    console.log(`[ARENA_SERVER] [Realtime][Publish] Broadcasting event ${eventName} to channel ${channel} (${channelListeners.size} active listeners).`);

    const packet = {
      event: eventName,
      timestamp: Date.now(),
      data: payload
    };

    for (const listener of channelListeners) {
      try {
        listener.callback(packet);
      } catch (err) {
        console.error(`[Realtime][Error] Dispatch failed for listener ${listener.id} on channel ${channel}:`, err);
      }
    }
  }

  /**
   * Publishes updates dynamically to multiple targets with fully formatted MatchDto payloads.
   */
  static async publishMatchUpdate(matchId: string, player1Id: string, player2Id: string, status: string, matchData: any) {
    let formattedMatch = matchData;

    // Dynamically retrieve and compile full Dto with player details if it's missing players details
    if (!matchData || !matchData.players || matchData.players.length === 0) {
      try {
        const { prisma } = require('@/lib/prisma');
        const fullMatch = await prisma.arenaMatch.findUnique({
          where: { id: matchId },
          include: {
            player1: { select: { username: true } },
            player2: { select: { username: true } }
          }
        });

        if (fullMatch) {
          const formattedPlayers = [
            {
              userId: fullMatch.player1Id,
              username: fullMatch.player1?.username || 'Challenger',
              score: fullMatch.player1Score,
              status: fullMatch.player1Status,
              submittedAt: fullMatch.player1SubmittedAt ? (fullMatch.player1SubmittedAt instanceof Date ? fullMatch.player1SubmittedAt.toISOString() : new Date(fullMatch.player1SubmittedAt).toISOString()) : null
            },
            {
              userId: fullMatch.player2Id,
              username: fullMatch.player2?.username || 'Defender',
              score: fullMatch.player2Score,
              status: fullMatch.player2Status,
              submittedAt: fullMatch.player2SubmittedAt ? (fullMatch.player2SubmittedAt instanceof Date ? fullMatch.player2SubmittedAt.toISOString() : new Date(fullMatch.player2SubmittedAt).toISOString()) : null
            }
          ];

          formattedMatch = {
            id: fullMatch.id,
            gameId: fullMatch.gameId,
            mode: fullMatch.mode,
            roomCode: fullMatch.roomCode,
            status: fullMatch.status,
            winnerId: fullMatch.winnerId,
            createdAt: fullMatch.createdAt instanceof Date ? fullMatch.createdAt.toISOString() : fullMatch.createdAt,
            resolvedAt: fullMatch.resolvedAt instanceof Date ? fullMatch.resolvedAt.toISOString() : fullMatch.resolvedAt,
            players: formattedPlayers
          };
        }
      } catch (err) {
        console.error('[RealtimeService] Failed to dynamically format match details:', err);
      }
    } else {
      // Ensure dates are stringified cleanly
      formattedMatch = {
        ...matchData,
        createdAt: matchData.createdAt instanceof Date ? matchData.createdAt.toISOString() : matchData.createdAt,
        resolvedAt: matchData.resolvedAt instanceof Date ? matchData.resolvedAt.toISOString() : matchData.resolvedAt
      };
    }

    const payload = { matchId, status, matchData: formattedMatch };
    this.publish(`match:${matchId}`, 'MATCH_UPDATE', payload);
    this.publish(`user:${player1Id}`, 'MATCH_UPDATE', payload);
    this.publish(`user:${player2Id}`, 'MATCH_UPDATE', payload);
  }

  static publishQueueUpdate(gameId: number, activeQueuers: number, activeMatches: number) {
    this.publish(`queue:${gameId}`, 'QUEUE_ACTIVITY', { gameId, activeQueuers, activeMatches });
  }

  static publishRoomJoin(roomCode: string, guestId: string, status: string) {
    this.publish(`room:${roomCode}`, 'ROOM_JOIN', { roomCode, guestId, status });
  }

  static isUserConnected(userId: string): boolean {
    const channelListeners = this.listeners.get(`user:${userId}`);
    return channelListeners ? channelListeners.size > 0 : false;
  }
}
