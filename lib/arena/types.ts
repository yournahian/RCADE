import { ArenaTier } from '@prisma/client';

// Maximum size constraints to prevent DB bloat and payload injection abuse
export const TELEMETRY_MAX_SIZE_BYTES = 128 * 1024; // 128 KB
export const TELEMETRY_MAX_EVENTS = 250;

export interface GameplayEventSnapshot {
  t: number;      // Timestamp offset from start (milliseconds)
  e: 'pellet' | 'collision' | 'combo_up' | 'wall_wrap';
  x: number;      // Grid X-coordinate
  y: number;      // Grid Y-coordinate
  val?: number;   // Contextual value (e.g. combo multiplier, points earned)
}

export interface EntropyCheckpoint {
  sequenceId: number; // Monotonically increasing ID starting from 0
  timestamp: number;  // Quantized timestamp offset in milliseconds
  milestone: string;  // e.g. "score_500", "score_1000"
  hash: string;       // HMAC-SHA256 signature chain block
}

export interface DeviceContinuityInfo {
  renderer: string;         // Canvas WebGL renderer fingerprint signature
  timezone: string;         // Browser locale timezone
  language: string;         // Browser language preference
  screenClass: string;      // Form-factor category e.g., "1920x1080"
  hardwareConcurrency: number; // Core concurrency metrics
}

export interface ReplayPacket {
  matchId: string;
  sessionId: string;
  userId: string;
  gameId: number;
  arenaTier: ArenaTier;
  createdAt: number;
  events: GameplayEventSnapshot[];
  intervals: number[]; // Capped array representing score checkpoints at regular 10-second marks
  continuityInfo?: DeviceContinuityInfo;
}
