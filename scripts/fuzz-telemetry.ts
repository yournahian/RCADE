import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ArenaVerifier } from '../services/arena-verifier';
import { EntropyCheckpoint } from '../lib/arena/types';
import crypto from 'crypto';

interface TestResult {
  name: string;
  expectedFail: boolean;
  actualResult: { isValid: boolean; reason?: string };
  passed: boolean;
}

async function runFuzzingTests() {
  console.log("\n=======================================================");
  console.log("   RCADE ADVERSARIAL TELEMETRY FUZZING & MUTATION RUN   ");
  console.log("=======================================================\n");

  const results: TestResult[] = [];

  const sessionSeed = "session_seed_fuzz_12345";
  const clientSalt = "client_salt_fuzz_67890";
  const matchId = "fuzz_match_uuid_abc";
  const userId = "sim:did:user-fuzzer-999";

  // Helper to generate a valid, unbroken chain of checkpoints
  function generateValidSequence(length: number): {
    score: number;
    durationMs: number;
    checkpoints: EntropyCheckpoint[];
    replayData: any;
  } {
    const checkpoints: EntropyCheckpoint[] = [];
    const events: any[] = [];
    let lastHash = sessionSeed;

    for (let i = 0; i < length; i++) {
      const timestamp = (i + 1) * 1000; // 1s intervals
      const roundedTimestamp = Math.round(timestamp / 10) * 10;
      const milestone = `score_${(i + 1) * 500}`;
      
      const expectedHash = crypto
        .createHmac('sha256', clientSalt)
        .update(`${lastHash}${i}${roundedTimestamp}${milestone}`)
        .digest('hex');

      checkpoints.push({
        sequenceId: i,
        timestamp,
        milestone,
        hash: expectedHash
      });

      lastHash = expectedHash;

      // Add a direction change event at step (non-polar-opposite)
      events.push({
        t: timestamp - 500,
        e: 'dir_change',
        val: '1,0' // moving right
      });

      // Add a pellet collect event
      events.push({
        t: timestamp,
        e: 'pellet'
      });
    }

    return {
      score: length * 500,
      durationMs: length * 1000 + 500,
      checkpoints,
      replayData: { events }
    };
  }

  function addTestResult(name: string, expectedFail: boolean, res: { isValid: boolean; reason?: string }) {
    const passed = expectedFail ? !res.isValid : res.isValid;
    results.push({ name, expectedFail, actualResult: res, passed });
    if (passed) {
      console.log(`✅ [PASS] ${name}`);
      console.log(`   - Expected: ${expectedFail ? 'FAIL' : 'VALID'}`);
      console.log(`   - Result: ${res.isValid ? 'VALID' : `FAIL (${res.reason})`}\n`);
    } else {
      console.log(`❌ [FAIL] ${name}`);
      console.log(`   - Expected: ${expectedFail ? 'FAIL' : 'VALID'}`);
      console.log(`   - Result: ${res.isValid ? 'VALID' : `FAIL (${res.reason})`}\n`);
    }
  }

  // --- TEST CASE 1: Valid Telemetry Chain ---
  console.log("🧪 Running Case 1: Perfect, untampered sequence...");
  const validChain = generateValidSequence(5);
  const res1 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    validChain.score,
    validChain.durationMs,
    validChain.checkpoints,
    matchId,
    userId,
    validChain.replayData
  );
  addTestResult("Valid Telemetry Sequence", false, res1);

  // --- TEST CASE 2: Sequence Chronology Gap (Missing step) ---
  console.log("🧪 Running Case 2: Sequence chain gap (skipping checkpoint)...");
  const gapChain = generateValidSequence(5);
  // Remove sequenceId 2
  gapChain.checkpoints.splice(2, 1);
  // Re-adjust sequenceId to cause a sequential mismatch
  gapChain.checkpoints[2].sequenceId = 3; // sequence now goes 0, 1, 3, 4
  gapChain.checkpoints[3].sequenceId = 4;
  const res2 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    gapChain.score,
    gapChain.durationMs,
    gapChain.checkpoints,
    matchId,
    userId,
    gapChain.replayData
  );
  addTestResult("Sequence ID Chronology Gap", true, res2);

  // --- TEST CASE 3: Backwards Timestamps Sequence ---
  console.log("🧪 Running Case 3: Reverse chronological order timestamps...");
  const backwardsChain = generateValidSequence(5);
  // Modify sequenceId 3 timestamp to be less than sequenceId 2
  backwardsChain.checkpoints[3].timestamp = backwardsChain.checkpoints[2].timestamp - 500;
  // Note: this will also fail HMAC hash verification since timestamp is hashed, but verifier audits chronology FIRST.
  const res3 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    backwardsChain.score,
    backwardsChain.durationMs,
    backwardsChain.checkpoints,
    matchId,
    userId,
    backwardsChain.replayData
  );
  addTestResult("Backwards Timestamps", true, res3);

  // --- TEST CASE 4: Chained HMAC Checksum Divergence (Tampered score milestone) ---
  console.log("🧪 Running Case 4: Milestone value tampering (HMAC mismatch)...");
  const tamperedMilestoneChain = generateValidSequence(5);
  // Alter milestone of sequenceId 2 without updating its hash
  tamperedMilestoneChain.checkpoints[2].milestone = "score_99999";
  const res4 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    tamperedMilestoneChain.score,
    tamperedMilestoneChain.durationMs,
    tamperedMilestoneChain.checkpoints,
    matchId,
    userId,
    tamperedMilestoneChain.replayData
  );
  addTestResult("Milestone Value Tampering", true, res4);

  // --- TEST CASE 5: Impossible Direction Snap Turn (Polar opposite direction switch in 1 frame) ---
  console.log("🧪 Running Case 5: Polar-opposite snap turns (instant 180 degree switch)...");
  const snapTurnChain = generateValidSequence(5);
  // Injects: moving right (1, 0) followed instantly by moving left (-1, 0)
  snapTurnChain.replayData.events.push(
    { t: 2100, e: 'dir_change', val: '1,0' },
    { t: 2101, e: 'dir_change', val: '-1,0' }
  );
  const res5 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    snapTurnChain.score,
    snapTurnChain.durationMs,
    snapTurnChain.checkpoints,
    matchId,
    userId,
    snapTurnChain.replayData
  );
  addTestResult("Impossible Polar-Opposite Turn", true, res5);

  // --- TEST CASE 6: Impossible Pellet Collection Cadence ---
  console.log("🧪 Running Case 6: Impossible pellet cadence (two pellets collected under 400ms)...");
  const pelletCadenceChain = generateValidSequence(5);
  // Add two pellets collected 100ms apart
  pelletCadenceChain.replayData.events.push(
    { t: 1500, e: 'pellet' },
    { t: 1600, e: 'pellet' }
  );
  const res6 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    pelletCadenceChain.score,
    pelletCadenceChain.durationMs,
    pelletCadenceChain.checkpoints,
    matchId,
    userId,
    pelletCadenceChain.replayData
  );
  addTestResult("Impossible Pellet Cadence", true, res6);

  // --- TEST CASE 7: Impossible Score Rate ---
  console.log("🧪 Running Case 7: Extreme score injection (high score, low duration)...");
  const impossibleRateChain = generateValidSequence(5);
  // Submit a score of 15,000 for a 5 second run
  const res7 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    15000,
    5000,
    impossibleRateChain.checkpoints,
    matchId,
    userId,
    impossibleRateChain.replayData
  );
  addTestResult("Impossible Score Rate Accumulation", true, res7);

  // --- TEST CASE 8: Impossibly Fast Score Duration ---
  console.log("🧪 Running Case 8: Speedhack duration bypass (<3s with high score)...");
  const speedhackChain = generateValidSequence(5);
  const res8 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    800,
    1500, // 1.5 seconds duration
    speedhackChain.checkpoints,
    matchId,
    userId,
    speedhackChain.replayData
  );
  addTestResult("Impossibly Fast Speed Duration Limit", true, res8);

  // --- TEST CASE 9: Drift Grace Window Budget Triggered ---
  console.log("🧪 Running Case 9: Large timestamp spikes (timers manipulation drift)...");
  const driftChain = generateValidSequence(5);
  // Insert huge timestamp gaps between checkpoints (>800ms jumps multiple times)
  driftChain.checkpoints[1].timestamp = driftChain.checkpoints[0].timestamp + 1900;
  driftChain.checkpoints[2].timestamp = driftChain.checkpoints[1].timestamp + 2200;
  driftChain.checkpoints[3].timestamp = driftChain.checkpoints[2].timestamp + 2500;
  // Recalculate HMAC hashes so they pass hash chain verifications, but timing drifts accumulate and blow budget
  let lastHash = sessionSeed;
  for (let i = 0; i < driftChain.checkpoints.length; i++) {
    const cp = driftChain.checkpoints[i];
    const roundedTimestamp = Math.round(cp.timestamp / 10) * 10;
    const expectedHash = crypto
      .createHmac('sha256', clientSalt)
      .update(`${lastHash}${cp.sequenceId}${roundedTimestamp}${cp.milestone}`)
      .digest('hex');
    cp.hash = expectedHash;
    lastHash = expectedHash;
  }

  const res9 = ArenaVerifier.verifyTelemetry(
    sessionSeed,
    clientSalt,
    driftChain.score,
    driftChain.durationMs,
    driftChain.checkpoints,
    matchId,
    userId,
    driftChain.replayData
  );
  addTestResult("Drift Budget Exhaustion Window", true, res9);

  // --- SUMMARY REPORT ---
  console.log("=======================================================");
  console.log("                 FUZZING AUDIT REPORT                  ");
  console.log("=======================================================");
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  console.log(`Total Scenarios Checked : ${totalTests}`);
  console.log(`Scenarios Safely Passed : ${passedTests} / ${totalTests}`);

  const allPassed = passedTests === totalTests;
  if (allPassed) {
    console.log("\n🎉 ALL FUZZING MUTATION ATTACK SCENARIOS SAFELY BLOCKED BY THE VERIFIER! 🎉\n");
    process.exit(0);
  } else {
    console.error("\n❌ WARNING: Some adversarial fuzzing payloads successfully bypassed verification! ❌\n");
    process.exit(1);
  }
}

runFuzzingTests().catch(err => {
  console.error("Fatal exception during fuzzing runner:", err);
  process.exit(1);
});
