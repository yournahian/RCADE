import { GameVerifierStrategy } from './types';
import { sendSecurityAlert } from '@/lib/arena/alerts';

export class SpaceImpactStrategy implements GameVerifierStrategy {
  getMaxPossibleScore(durationMs: number): number {
    return (durationMs / 1000) * 1200; // Space Impact allows max 1,200 points per second accumulation ceiling
  }

  verifyReplayEvents(
    events: any[],
    matchId: string,
    userId: string
  ): { isValid: boolean; reason?: string } {
    if (!Array.isArray(events)) return { isValid: true };

    // 1. Fire Rate Limit Validation (Maximum 10 shots per second safety ceiling)
    let lastFireTime = -1;
    for (const ev of events) {
      if (ev.e === 'fire') {
        if (lastFireTime !== -1) {
          const delta = ev.t - lastFireTime;
          // Delta under 90ms implies an impossible fire rate exceeding 11 shots/sec
          if (delta < 90) {
            console.warn(`[Arena][Verifier][Violation] Impossible projectile fire rate: ${delta}ms`);
            sendSecurityAlert({
              matchId,
              userId,
              category: 'DRIFT_VIOLATION',
              severity: 'CRITICAL',
              details: `Impossible laser fire rate detected. Interval ${delta}ms is below physical bounds of 90ms.`
            });
            return { isValid: false, reason: 'IMPOSSIBLE_FIRE_RATE' };
          }
        }
        lastFireTime = ev.t;
      }
    }

    // 2. Velocity / Position Acceleration Checks
    let prevMove: { t: number; x: number; y: number } | null = null;
    for (const ev of events) {
      // Assuming generic moves might be logged as movement changes or coordinates
      if (ev.e === 'dir_change') {
        if (prevMove) {
          const dt = ev.t - prevMove.t;
          if (dt > 0) {
            const dx = ev.x - prevMove.x;
            const dy = ev.y - prevMove.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speed = (dist / dt) * 1000; // Speed in pixels per second
            
            // Top ship speed limit is 800 pixels/second
            if (speed > 1200) {
              console.warn(`[Arena][Verifier][Violation] Impossible movement speed: ${speed.toFixed(1)}px/s`);
              sendSecurityAlert({
                matchId,
                userId,
                category: 'IMPOSSIBLE_DIRECTION',
                severity: 'HARD',
                details: `Spaceship teleportation anomaly: moved at ${speed.toFixed(1)}px/s (Limit: 1200px/s)`
              });
              return { isValid: false, reason: 'IMPOSSIBLE_MOVEMENT_SPEED' };
            }
          }
        }
        prevMove = { t: ev.t, x: ev.x, y: ev.y };
      }
    }

    return { isValid: true };
  }
}
