import { GameVerifierStrategy } from './types';
import { sendSecurityAlert } from '@/lib/arena/alerts';

export class NeonSnakeStrategy implements GameVerifierStrategy {
  getMaxPossibleScore(durationMs: number): number {
    return (durationMs / 1000) * 750; // Neon Snake top speed cap with x5 peak combo multiplier is ~750 points per second
  }

  verifyReplayEvents(
    events: any[],
    matchId: string,
    userId: string
  ): { isValid: boolean; reason?: string } {
    if (!Array.isArray(events)) return { isValid: true };

    // 1. Polar-opposite directional impossible curves
    let prevDx = 0;
    let prevDy = 0;
    for (const ev of events) {
      if (ev.e === 'dir_change' && typeof ev.val === 'string') {
        const parts = ev.val.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const [dx, dy] = parts;
          if (prevDx !== 0 || prevDy !== 0) {
            const dotProduct = dx * prevDx + dy * prevDy;
            // An instant 180-degree turn in a single frame is physically grid-locked impossible
            if (dotProduct === -1) {
              console.warn(`[Arena][Verifier][Violation] Impossible directional curve. Polar opposite turn at ${ev.t}ms`);
              sendSecurityAlert({
                matchId,
                userId,
                category: 'IMPOSSIBLE_DIRECTION',
                severity: 'HARD',
                details: `Instant 180-degree turn detected at t=${ev.t}ms from (${prevDx},${prevDy}) to (${dx},${dy})`
              });
              return { isValid: false, reason: 'IMPOSSIBLE_DIRECTIONAL_CURVE' };
            }
          }
          prevDx = dx;
          prevDy = dy;
        }
      }
    }

    // 2. Impossible pellet combo cadence
    let lastPelletTime = -1;
    for (const ev of events) {
      if (ev.e === 'pellet') {
        if (lastPelletTime !== -1) {
          const delta = ev.t - lastPelletTime;
          // Eaten under 400ms is grid-locked impossible due to min travel speeds and spacing
          if (delta < 400) {
            console.warn(`[Arena][Verifier][Violation] Impossible pellet collection cadence: ${delta}ms`);
            sendSecurityAlert({
              matchId,
              userId,
              category: 'DRIFT_VIOLATION',
              severity: 'HARD',
              details: `Pellet collected too fast. Time delta ${delta}ms is less than physical limit of 400ms`
            });
            return { isValid: false, reason: 'IMPOSSIBLE_PELLET_CADENCE' };
          }
        }
        lastPelletTime = ev.t;
      }
    }

    return { isValid: true };
  }
}
