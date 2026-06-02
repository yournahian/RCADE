import { ReplayPacket, GameplayEventSnapshot } from './types';
import { ArenaTier } from '@prisma/client';
import { CODEC_REGISTRY, DEFAULT_CODEC } from './replay-codec-registry';

/**
 * Encodes a dense ReplayPacket into a highly compressed delta-string.
 * Format: "matchId|sessionId|userId|gameId|arenaTier|createdAt#eventCode,deltaT,x,y,val;..."
 */
export function compressReplay(packet: ReplayPacket): string {
  try {
    const matchId = packet.matchId || '';
    const sessionId = packet.sessionId || '';
    const userId = packet.userId || '';
    const gameId = packet.gameId || 0;
    const arenaTier = packet.arenaTier || ArenaTier.BRONZE;
    const createdAt = packet.createdAt || Date.now();

    const meta = `${matchId}|${sessionId}|${userId}|${gameId}|${arenaTier}|${createdAt}`;
    
    const eventCodes = (CODEC_REGISTRY[gameId] || DEFAULT_CODEC).eventCodes;
    
    const eventsToProcess = Array.isArray(packet.events) ? packet.events : [];
    const compressedEvents = eventsToProcess
      .slice(0, 250) // Enforce budget limits strictly
      .map(ev => {
        const code = eventCodes[ev.e] ?? 'U';
        return `${code},${ev.t ?? 0},${ev.x ?? 0},${ev.y ?? 0},${ev.val ?? ''}`;
      })
      .join(';');
      
    return `${meta}#${compressedEvents}`;
  } catch (err) {
    console.error('[Arena][ReplayCodec] Compression error, falling back to empty seeder:', err);
    return 'error|error|error|0|BRONZE|0#';
  }
}

/**
 * Decodes the delta-string back into a clean ReplayPacket for diagnostic reviews.
 */
export function decompressReplay(compressed: string): ReplayPacket {
  try {
    if (!compressed || typeof compressed !== 'string') {
      throw new Error('Invalid compressed payload type');
    }

    const [metaStr, eventStr] = compressed.split('#');
    if (!metaStr) {
      throw new Error('Missing meta header section');
    }

    const [matchId, sessionId, userId, gameId, arenaTier, createdAt] = metaStr.split('|');
    
    const gId = parseInt(gameId || '0', 10);
    const eventNames = (CODEC_REGISTRY[gId] || DEFAULT_CODEC).eventNames;
    
    const events: GameplayEventSnapshot[] = (eventStr && eventStr.length > 0)
      ? eventStr.split(';').map(item => {
          const [code, t, x, y, val] = item.split(',');
          return {
            t: parseInt(t || '0', 10),
            e: (eventNames[code] ?? 'unknown') as any,
            x: parseInt(x || '0', 10),
            y: parseInt(y || '0', 10),
            val: val ? parseFloat(val) : undefined
          };
        })
      : [];
      
    return {
      matchId: matchId || '',
      sessionId: sessionId || '',
      userId: userId || '',
      gameId: parseInt(gameId || '0', 10),
      arenaTier: (arenaTier as ArenaTier) || ArenaTier.BRONZE,
      createdAt: parseInt(createdAt || '0', 10),
      events,
      intervals: []
    };
  } catch (err) {
    console.error('[Arena][ReplayCodec] Decompression failure, returning empty seeder packet:', err);
    return {
      matchId: '',
      sessionId: '',
      userId: '',
      gameId: 0,
      arenaTier: ArenaTier.BRONZE,
      createdAt: Date.now(),
      events: [],
      intervals: []
    };
  }
}
