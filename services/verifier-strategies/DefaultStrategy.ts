import { GameVerifierStrategy } from './types';

export class DefaultStrategy implements GameVerifierStrategy {
  getMaxPossibleScore(durationMs: number): number {
    return 0; // Zero scoring budget
  }

  verifyReplayEvents(events: any[], matchId: string, userId: string): { isValid: boolean; reason?: string } {
    console.error(`[Arena][Verifier][Fallback] Hard rejecting telemetry: unknown gameId.`);
    return { isValid: false, reason: 'UNSUPPORTED_GAME' };
  }
}
