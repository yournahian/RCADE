import { EntropyCheckpoint } from '@/lib/arena/types';
import { sendSecurityAlert } from '@/lib/arena/alerts';
import crypto from 'crypto';
import { MetricsService } from '@/services/metrics';
import { getVerifierStrategy } from './verifier-strategies/registry';

export class ArenaVerifier {
  /**
   * Advanced Telemetry & Replay Sequence Integrity Auditor.
   * Audits:
   * 1. Monotonic sequence chain order (blocks skipped or duplicate packets).
   * 2. Chronological timestamp spacing & drift grace window budgets.
   * 3. Deterministic coordinate normalization (grid quantization to filter jitter).
   * 4. Rolling HMAC SHA-256 Checksum Chain verification.
   * 5. Anomaly-scored grace window (limits false-positives under transient lags).
   */
  static verifyTelemetry(
    sessionSeed: string,
    clientSalt: string,
    score: number,
    durationMs: number,
    checkpoints: EntropyCheckpoint[],
    matchId: string,
    userId: string,
    replayData?: any,
    gameId: number = 1
  ): { isValid: boolean; reason?: string } {
    try {
      console.log(`[Arena][Verifier] Auditing match: ${matchId} for player: ${userId}`);

      // Parse and normalize checkpoints array
      const cps = Array.isArray(checkpoints) ? [...checkpoints] : [];
      
      // 1. Extreme absolute time ceiling bounds
      if (durationMs > 600000) {
        console.warn(`[Arena][Verifier][Violation] Time limit exceeded: ${durationMs}ms`);
        sendSecurityAlert({
          matchId,
          userId,
          category: 'DRIFT_VIOLATION',
          severity: 'HARD',
          details: `Time limit exceeded: ${durationMs}ms (Limit: 600,000ms)`
        });
        return { isValid: false, reason: 'EXCEEDED_MAX_DURATION' };
      }

      // 2. Minimum round speed check: Impossibly fast scores
      if (durationMs < 3000 && score > 500) {
        console.warn(`[Arena][Verifier][Violation] Impossibly fast high score: ${score} in ${durationMs}ms`);
        sendSecurityAlert({
          matchId,
          userId,
          category: 'DRIFT_VIOLATION',
          severity: 'CRITICAL',
          details: `Impossibly fast high score: ${score} points in ${durationMs}ms`
        });
        return { isValid: false, reason: 'IMPOSSIBLE_SPEED' };
      }

      const strategy = getVerifierStrategy(gameId);

      const maxPossibleScore = strategy.getMaxPossibleScore(durationMs);
      if (score > maxPossibleScore && score > 1000) {
        console.warn(`[Arena][Verifier][Violation] Impossible score accumulation: ${score} in ${durationMs}ms`);
        sendSecurityAlert({
          matchId,
          userId,
          category: 'DRIFT_VIOLATION',
          severity: 'HARD',
          details: `Score accumulation limit breached: ${score} (Allowed max: ${maxPossibleScore} for ${durationMs}ms)`
        });
        return { isValid: false, reason: 'IMPOSSIBLE_SCORE_RATE' };
      }

      if (cps.length === 0) {
        console.log('[Arena][Verifier] No checkpoints received. Standard verify completed.');
        return { isValid: true };
      }

      // Sort checkpoints by sequence ID to ensure ordering
      cps.sort((a, b) => a.sequenceId - b.sequenceId);

      // 3. Chronology & Monotonic Replay Sequence Audits
      let lastSeqId = -1;
      let lastTimestamp = -1;
      let driftAccumulator = 0;
      let anomalyScore = 0;

      // rolling hash chain init
      let lastHash = sessionSeed;

      for (let i = 0; i < cps.length; i++) {
        const cp = cps[i];

        // Ensure sequenceId is monotonic and contiguous (no gaps, no duplicates)
        if (cp.sequenceId !== i) {
          console.warn(`[Arena][Verifier][Violation] Chronology gap. Expected sequence: ${i}, Got: ${cp.sequenceId}`);
          sendSecurityAlert({
            matchId,
            userId,
            category: 'REPLAY_TAMPERING',
            severity: 'CRITICAL',
            details: `Chronology sequence chain gap. Expected sequence: ${i}, Got: ${cp.sequenceId}`
          });
          return { isValid: false, reason: 'SEQUENCE_CHAIN_GAP' };
        }

        // Quantization: Round timestamps and check chronological increments
        const roundedTimestamp = Math.round(cp.timestamp / 10) * 10;
        if (roundedTimestamp < lastTimestamp) {
          console.warn(`[Arena][Verifier][Violation] Backwards chronological sequence: ${roundedTimestamp} < ${lastTimestamp}`);
          sendSecurityAlert({
            matchId,
            userId,
            category: 'REPLAY_TAMPERING',
            severity: 'CRITICAL',
            details: `Timestamp sequence mismatch. Event ${cp.sequenceId} timestamp ${roundedTimestamp}ms is less than previous ${lastTimestamp}ms`
          });
          return { isValid: false, reason: 'BACKWARDS_TIMESTAMP_SEQUENCE' };
        }

        // 4. Timing Drift budget: Calculate delta jump between sequence snapshots
        if (lastTimestamp !== -1) {
          const timeStepDelta = roundedTimestamp - lastTimestamp;
          
          // Speedhack detector: Sudden local execution frame jumps
          if (timeStepDelta > 800) {
            driftAccumulator += timeStepDelta;
            anomalyScore += 1;
            
            console.log(`[Arena][Verifier][Drift] Large time step delta: ${timeStepDelta}ms at index: ${i}`);
          }
        }

        // 5. Rolling Checksum Chain verification:
        // Binding sequenceId, milestone, and previous hash dynamically to isolate tampered packets.
        const expectedHash = crypto
          .createHmac('sha256', clientSalt)
          .update(`${lastHash}${cp.sequenceId}${roundedTimestamp}${cp.milestone}`)
          .digest('hex');

        if (cp.hash !== expectedHash) {
          console.warn(`[Arena][Verifier][Violation] Checksum chain divergence at sequence: ${cp.sequenceId}`);
          sendSecurityAlert({
            matchId,
            userId,
            category: 'CHECKSUM_DIVERGENCE',
            severity: 'CRITICAL',
            details: `Rolling replay hash chain broken at sequence: ${cp.sequenceId}. Hash: ${cp.hash} | Expected: ${expectedHash}`
          });
          return { isValid: false, reason: `REPLAY_HASH_CHAIN_BROKEN_SEQ_${cp.sequenceId}` };
        }

        lastSeqId = cp.sequenceId;
        lastTimestamp = roundedTimestamp;
        lastHash = cp.hash; // Advance rolling chain hash
      }

      // 6. Grace Window System: Auto-ban bypasses
      // We allow up to 2 isolated timer drift events before failing telemetry.
      if (anomalyScore > 2 && driftAccumulator > 3000) {
        console.warn(`[Arena][Verifier][Violation] Drift budget exhausted: ${driftAccumulator}ms across ${anomalyScore} events.`);
        MetricsService.increment('drift_budget_exhaustions_total');
        sendSecurityAlert({
          matchId,
          userId,
          category: 'DRIFT_VIOLATION',
          severity: 'HARD',
          details: `Drift budget exhausted: ${driftAccumulator}ms across ${anomalyScore} events.`
        });
        return { isValid: false, reason: 'DRIFT_BUDGET_EXHAUSTED' };
      }

      // 7. Replay-based checks delegated polymorphically to game verifier strategies
      if (replayData && Array.isArray(replayData.events)) {
        const strategyVerify = strategy.verifyReplayEvents(replayData.events, matchId, userId);
        if (!strategyVerify.isValid) {
          return strategyVerify;
        }
      }

      console.log('[Arena][Verifier] Telemetry verification and rolling chain passed successfully.');
      return { isValid: true };

    } catch (err: any) {
      console.error('[Arena][Verifier][Crash] Verification engine crash, failing open to INVALIDATED:', err);
      return { isValid: false, reason: 'VERIFIER_PANIC_FALLBACK' };
    }
  }
}
