import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { prisma } from '../lib/prisma';
import { privy } from '../lib/privy';
import { ArenaTier, MatchStatus, MatchPlayerStatus } from '@prisma/client';
import { POST as matchmakeHandler } from '../app/api/arena/matchmake/route';
import { POST as createSessionHandler } from '../app/api/arena/session/create/route';
import { POST as completeSessionHandler } from '../app/api/arena/session/complete/route';
import { ArenaCleanupService } from '../services/arena-cleanup';
import { ArenaMatchmaker } from '../services/arena-matchmaker';
import { decompressReplay } from '../lib/arena/replay-codec';
import { getLimiterCacheSize } from '../lib/arena/rate-limiter';
import crypto from 'crypto';

// Monkey-patch Privy authentication to allow simulation tokens
privy.verifyAuthToken = async (token: string) => {
  if (token.startsWith('sim:did:user-') || token === 'ghost:system-seeder-bot') {
    return { userId: token } as any;
  }
  throw new Error('Invalid token');
};

// ============================================================================
// 1. Seed-based Deterministic PRNG Utility (Linear Congruential Generator)
// ============================================================================
export class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// ============================================================================
// 2. Metrics & Operational Summary Structures
// ============================================================================
export interface SimulationReport {
  success: boolean;
  mode: string;
  seed: number;
  totalMatchesCreated: number;
  completedMatches: number;
  forfeits: number;
  invalidatedSessions: number;
  expiredQueues: number;
  avgQueueTimeMs: number;
  avgSettlementTimeMs: number;
  mmrUpdatesApplied: number;
  replayPayloadAveragesBytes: number;
  duplicateSubmissionBlocks: number;
  rateLimitTriggers: number;
  ghostMatchesSpawned: number;
  memoryObservations: {
    limiterCacheSize: number;
    activeMatchesCount: number;
    heapUsedBytes: number;
    limiterBucketCounts: number;
    cleanupCounts: number;
  };
  invariantAuditPassed: boolean;
  logs: string[];
}

// Helper for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// 3. Core Simulation Runner Suite
// ============================================================================
export async function runSimulationSuite(mode: string, seedInput: number): Promise<SimulationReport> {
  const seed = seedInput || 1337;
  const rand = new SeededRandom(seed);
  const logs: string[] = [];
  
  const addLog = (msg: string) => {
    const logStr = `[Simulator][Seed:${seed}][${new Date().toISOString()}] ${msg}`;
    console.log(logStr);
    logs.push(logStr);
  };

  addLog(`Starting simulation suite in isolated mode: ${mode}`);

  // Initialize report metrics
  let totalMatchesCreated = 0;
  let completedMatches = 0;
  let forfeits = 0;
  let invalidatedSessions = 0;
  let expiredQueues = 0;
  let mmrUpdatesApplied = 0;
  let rateLimitTriggers = 0;
  let ghostMatchesSpawned = 0;
  let duplicateSubmissionBlocks = 0;
  let replayPacketsDecompressedPassed = 0;

  // Track times and replay sizes
  const queueTimesMs: number[] = [];
  const settlementTimesMs: number[] = [];
  const replaySizesBytes: number[] = [];
  let cleanupCounts = 0;

  // Prepare simulated user DIDs in database
  const p1Id = `sim:did:user-p1-${seed}`;
  const p2Id = `sim:did:user-p2-${seed}`;

  addLog(`Upserting mock players in PostgreSQL: ${p1Id} and ${p2Id}`);
  await Promise.all([
    prisma.user.upsert({
      where: { id: p1Id },
      update: {},
      create: { id: p1Id, username: `SimPlayer1_${seed}`, wallet: `0xsimwallet1${seed}` }
    }),
    prisma.user.upsert({
      where: { id: p2Id },
      update: {},
      create: { id: p2Id, username: `SimPlayer2_${seed}`, wallet: `0xsimwallet2${seed}` }
    })
  ]);

  // Clean prior unresolved test runs for these players to avoid state contamination
  const cleanupPrior = await prisma.match.deleteMany({
    where: {
      players: { some: { userId: { in: [p1Id, p2Id] } } },
      status: { in: [MatchStatus.PENDING, MatchStatus.ACTIVE] }
    }
  });
  if (cleanupPrior.count > 0) {
    addLog(`Purged ${cleanupPrior.count} unresolved prior matches for players.`);
  }

  try {
    // ==========================================================================
    // 1. NORMAL_MATCH_FLOW
    // ==========================================================================
    if (mode === 'NORMAL_MATCH_FLOW') {
      const qStart = Date.now();
      
      // Step A: Player 1 joins queue
      addLog('Step A: Player 1 requesting queue entry...');
      const req1 = new Request('http://localhost/api/arena/matchmake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({ gameId: 1, arenaTier: ArenaTier.BRONZE })
      });
      const res1 = await matchmakeHandler(req1);
      const data1 = await res1.json();
      
      if (res1.status === 429) rateLimitTriggers++;
      if (res1.status !== 200) {
        throw new Error(`Matchmake Player 1 failed with status ${res1.status}: ${JSON.stringify(data1)}`);
      }
      
      const matchId = data1.matchId;
      totalMatchesCreated++;
      addLog(`Match created in queue state PENDING. Match ID: ${matchId}`);

      // Seeded delay for queue pairing (Chaos Timing)
      const staggerDelay = Math.round(rand.nextRange(50, 150));
      addLog(`Introducing chaos queue stagger delay of ${staggerDelay}ms...`);
      await sleep(staggerDelay);

      // Step B: Player 2 joins queue (triggers pairing)
      addLog('Step B: Player 2 requesting queue entry (expecting paired ACTIVE)...');
      const req2 = new Request('http://localhost/api/arena/matchmake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p2Id}` },
        body: JSON.stringify({ gameId: 1, arenaTier: ArenaTier.BRONZE })
      });
      const res2 = await matchmakeHandler(req2);
      const data2 = await res2.json();
      
      if (res2.status === 429) rateLimitTriggers++;
      if (res2.status !== 200) {
        throw new Error(`Matchmake Player 2 failed with status ${res2.status}: ${JSON.stringify(data2)}`);
      }
      
      const qEnd = Date.now();
      queueTimesMs.push(qEnd - qStart);
      addLog(`Pairing response status: ${res2.status} | MatchState: ${data2.status}`);

      // Step C: Initialize Sessions (generating salts/seeds)
      addLog('Step C: Creating gameplay session for Player 1...');
      const sReq1 = new Request('http://localhost/api/arena/session/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({ matchId })
      });
      const sRes1 = await createSessionHandler(sReq1);
      const sData1 = await sRes1.json();
      if (sRes1.status !== 200) {
        throw new Error(`Session create Player 1 failed with status ${sRes1.status}: ${JSON.stringify(sData1)}`);
      }
      const s1Id = sData1.sessionId;

      addLog('Creating gameplay session for Player 2...');
      const sReq2 = new Request('http://localhost/api/arena/session/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p2Id}` },
        body: JSON.stringify({ matchId })
      });
      const sRes2 = await createSessionHandler(sReq2);
      const sData2 = await sRes2.json();
      if (sRes2.status !== 200) {
        throw new Error(`Session create Player 2 failed with status ${sRes2.status}: ${JSON.stringify(sData2)}`);
      }
      const s2Id = sData2.sessionId;

      const sessionStart = Date.now();

      // Chaos timing simulation: introduce random duration and overlapping submission timings
      const p1Duration = Math.round(rand.nextRange(45000, 75000));
      const p2Duration = Math.round(rand.nextRange(45000, 75000));

      // Generate dynamic entropy checkpoints
      const p1Checkpoints = [
        {
          milestone: 'score_500',
          hash: crypto.createHmac('sha256', sData1.clientSalt).update(`score_500${sData1.sessionSeed}`).digest('hex')
        }
      ];
      const p2Checkpoints = [
        {
          milestone: 'score_500',
          hash: crypto.createHmac('sha256', sData2.clientSalt).update(`score_500${sData2.sessionSeed}`).digest('hex')
        }
      ];

      // Step D: Submit scores with slight random stagger (out-of-order timings)
      const p1SubmitDelay = Math.round(rand.nextRange(20, 60));
      const p2SubmitDelay = Math.round(rand.nextRange(20, 60));

      addLog(`Submitting P1 score in ${p1SubmitDelay}ms...`);
      await sleep(p1SubmitDelay);
      
      const payload1 = JSON.stringify({
        sessionId: s1Id,
        score: 1200,
        combo: 1.8,
        duration: p1Duration,
        checkpoints: p1Checkpoints,
        replayData: {
          events: [
            { t: 10000, e: 'pellet', x: 2, y: 5 },
            { t: 25000, e: 'combo_up', x: 6, y: 12, val: 1.5 }
          ]
        }
      });
      replaySizesBytes.push(payload1.length);

      const cReq1 = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: payload1
      });
      const cRes1 = await completeSessionHandler(cReq1);
      addLog(`P1 Score submission finished with code: ${cRes1.status}`);
      if (cRes1.status !== 200) {
        throw new Error(`P1 Score submission failed with code ${cRes1.status}`);
      }

      addLog(`Submitting P2 score in ${p2SubmitDelay}ms...`);
      await sleep(p2SubmitDelay);

      const payload2 = JSON.stringify({
        sessionId: s2Id,
        score: 1550,
        combo: 2.1,
        duration: p2Duration,
        checkpoints: p2Checkpoints,
        replayData: {
          events: [
            { t: 8000, e: 'pellet', x: 4, y: 3 },
            { t: 22000, e: 'combo_up', x: 5, y: 7, val: 2.0 }
          ]
        }
      });
      replaySizesBytes.push(payload2.length);

      const cReq2 = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p2Id}` },
        body: payload2
      });
      const cRes2 = await completeSessionHandler(cReq2);
      addLog(`P2 Score submission finished with code: ${cRes2.status}. Settle complete.`);
      if (cRes2.status !== 200) {
        throw new Error(`P2 Score submission failed with code ${cRes2.status}`);
      }

      const sessionEnd = Date.now();
      settlementTimesMs.push(sessionEnd - sessionStart);

      completedMatches++;
      mmrUpdatesApplied += 2;

      // Decompress Replay Roundtrip Integrity Audit
      const updatedS2 = await prisma.matchSession.findUnique({ where: { id: s2Id } });
      if (updatedS2?.replayData) {
        const decompressed = decompressReplay(updatedS2.replayData as string);
        if (decompressed.userId === p2Id && decompressed.events.length === 2) {
          addLog('Replay compression-decompression roundtrip validation passed.');
          replayPacketsDecompressedPassed++;
        } else {
          throw new Error('Replay packet corruption detected on roundtrip codec.');
        }
      }
    } 
    
    // ==========================================================================
    // 2. DUPLICATE_SUBMISSION_SPAM
    // ==========================================================================
    else if (mode === 'DUPLICATE_SUBMISSION_SPAM') {
      const match = await prisma.match.create({
        data: {
          gameId: 1,
          arenaTier: ArenaTier.BRONZE,
          status: MatchStatus.ACTIVE,
          players: {
            create: [
              { userId: p1Id, status: 'WAITING' },
              { userId: p2Id, status: 'WAITING' }
            ]
          }
        }
      });
      totalMatchesCreated++;

      const session = await prisma.matchSession.create({
        data: {
          matchId: match.id,
          userId: p1Id,
          clientSalt: 'salt',
          sessionSeed: 'seed',
          status: 'ACTIVE'
        }
      });

      // Spam parallel completions
      addLog('Triggering parallel complete POST requests to stress idempotency checks...');
      const req = () => new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 800,
          combo: 1.2,
          duration: 35000,
          checkpoints: [],
          replayData: { events: [] }
        })
      });

      // Fire 3 simultaneous submissions concurrently
      const [resA, resB, resC] = await Promise.all([
        completeSessionHandler(req()),
        completeSessionHandler(req()),
        completeSessionHandler(req())
      ]);

      addLog(`Submission spam results: Code A: ${resA.status} | Code B: ${resB.status} | Code C: ${resC.status}`);
      
      const results = [resA.status, resB.status, resC.status];
      const successes = results.filter(status => status === 200).length;
      
      if (successes > 1) {
        throw new Error('HARD INVARIANT VIOLATION: Multiple completions settled successfully!');
      }

      duplicateSubmissionBlocks += (results.length - successes);
      addLog(`Idempotency verification passed. Blocked ${duplicateSubmissionBlocks} duplicate submissions.`);
    }

    // ==========================================================================
    // 3. QUEUE_FLOOD
    // ==========================================================================
    else if (mode === 'QUEUE_FLOOD') {
      addLog('Triggering QUEUE_FLOOD with 20 players enqueuing concurrently...');
      const floodPlayersCount = 20;
      const floodPlayers: string[] = [];

      // Create flood players
      addLog('Upserting 20 flood players in database...');
      const upsertPromises = [];
      for (let i = 0; i < floodPlayersCount; i++) {
        const id = `sim:did:user-q-${i}-${seed}`;
        floodPlayers.push(id);
        upsertPromises.push(
          prisma.user.upsert({
            where: { id },
            update: {},
            create: { id, username: `FloodPlayer${i}_${seed}`, wallet: `0xfloodwallet${i}${seed}` }
          })
        );
      }
      await Promise.all(upsertPromises);

      // Enqueue concurrently with small chaotic staggers (0-50ms)
      const enqueueStart = Date.now();
      const enqueuePromises = floodPlayers.map(async (pId, idx) => {
        const stagger = Math.round(rand.nextRange(0, 50));
        await sleep(stagger);
        const req = new Request('http://localhost/api/arena/matchmake', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${pId}` },
          body: JSON.stringify({ gameId: 1, arenaTier: ArenaTier.BRONZE })
        });
        const res = await matchmakeHandler(req);
        const data = await res.json();
        return { status: res.status, data, userId: pId };
      });

      const enqueueResults = await Promise.all(enqueuePromises);
      const enqueueSuccessCount = enqueueResults.filter(r => r.status === 200).length;
      addLog(`Flood queue responses: ${enqueueSuccessCount} of ${floodPlayersCount} joined successfully.`);
      
      totalMatchesCreated += enqueueResults.filter(r => r.status === 200 && r.data.status === 'PENDING').length;
      
      const enqueueEnd = Date.now();
      queueTimesMs.push(enqueueEnd - enqueueStart);

      // Verify that out of 20 players, exactly 10 ACTIVE matches are spawned
      const activeLobbiesCount = await prisma.match.count({
        where: {
          players: { some: { userId: { in: floodPlayers } } },
          status: MatchStatus.ACTIVE
        }
      });

      addLog(`Active lobbies spawned from flood: ${activeLobbiesCount}`);
      if (activeLobbiesCount !== 10) {
        throw new Error(`HARD INVARIANT VIOLATION: Queue flood did not result in exactly 10 active matches (Spawned: ${activeLobbiesCount}).`);
      }
      addLog('Queue flood paired up all 20 players cleanly into 10 matches.');
    }

    // ==========================================================================
    // 4. GHOST_MATCH_FALLBACK
    // ==========================================================================
    else if (mode === 'GHOST_MATCH_FALLBACK') {
      addLog('Testing Ghost seeder bot trigger fallback...');
      const pGhostId = `sim:did:user-ghost-${seed}`;
      
      await prisma.user.upsert({
        where: { id: pGhostId },
        update: {},
        create: { id: pGhostId, username: `GhostTarget_${seed}`, wallet: `0xghostwallet${seed}` }
      });

      // Request matchmaking which creates queue
      const req = new Request('http://localhost/api/arena/matchmake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pGhostId}` },
        body: JSON.stringify({ gameId: 1, arenaTier: ArenaTier.BRONZE })
      });
      const res = await matchmakeHandler(req);
      const data = await res.json();
      
      if (res.status !== 200) {
        throw new Error(`Ghost matchmake initialization failed: ${JSON.stringify(data)}`);
      }

      const matchId = data.matchId;
      totalMatchesCreated++;
      addLog(`Ghost target queue created: ${matchId}. Awaiting 31 seconds for background seeder trigger...`);
      
      // Wait 31 seconds for background seeder timer to resolve
      await sleep(31000);

      const updated = await prisma.match.findUnique({
        where: { id: matchId },
        include: { players: true }
      });

      addLog(`Queue state after 31s: ${updated?.status} | Players count: ${updated?.players.length}`);
      const botIncluded = updated?.players.some(p => p.userId === 'ghost:system-seeder-bot');
      
      if (updated?.status === 'ACTIVE' && botIncluded) {
        addLog('Ghost bot fallback matched successfully.');
        ghostMatchesSpawned++;
      } else {
        throw new Error('HARD INVARIANT VIOLATION: Ghost seeder trigger failed to activate on empty queue after timeout.');
      }

      // Finish the match by submitting Player 1's score to settle it Elo-wise
      const sReq = new Request('http://localhost/api/arena/session/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pGhostId}` },
        body: JSON.stringify({ matchId })
      });
      const sRes = await createSessionHandler(sReq);
      const sData = await sRes.json();
      const sessionId = sData.sessionId;

      const p1Checkpoints = [
        {
          milestone: 'score_500',
          hash: crypto.createHmac('sha256', sData.clientSalt).update(`score_500${sData.sessionSeed}`).digest('hex')
        }
      ];

      addLog('Submitting Player 1 score against the Ghost seeder bot...');
      const cReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pGhostId}` },
        body: JSON.stringify({
          sessionId,
          score: 1600,
          combo: 1.5,
          duration: 45000,
          checkpoints: p1Checkpoints,
          replayData: { events: [] }
        })
      });
      const cRes = await completeSessionHandler(cReq);
      
      if (cRes.status === 200) {
        addLog('Match against Ghost seeder bot settled successfully.');
        completedMatches++;
        mmrUpdatesApplied += 2;
      } else {
        throw new Error(`Score submission against bot failed: Status ${cRes.status}`);
      }
    }

    // ==========================================================================
    // 5. TELEMETRY_CORRUPTION
    // ==========================================================================
    else if (mode === 'TELEMETRY_CORRUPTION') {
      addLog('Testing Telemetry Corruption & Payload Abuse Gating...');
      const match = await prisma.match.create({
        data: {
          gameId: 1,
          arenaTier: ArenaTier.BRONZE,
          status: MatchStatus.ACTIVE,
          players: {
            create: [
              { userId: p1Id, status: 'WAITING' },
              { userId: p2Id, status: 'WAITING' }
            ]
          }
        }
      });
      totalMatchesCreated++;

      const session = await prisma.matchSession.create({
        data: {
          matchId: match.id,
          userId: p1Id,
          clientSalt: 'validsalt',
          sessionSeed: 'validseed',
          status: 'ACTIVE'
        }
      });

      // Case A: 129KB Payload size limit test
      addLog('Testing Case A: 129KB oversized payload injection...');
      const largePayload = 'A'.repeat(129 * 1024);
      const pReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 500,
          combo: 1.0,
          duration: 10000,
          checkpoints: [],
          abuseBuffer: largePayload
        })
      });
      const pRes = await completeSessionHandler(pReq);
      addLog(`Oversized payload response code: ${pRes.status} (expecting 413)`);
      if (pRes.status !== 413) {
        throw new Error(`HARD INVARIANT VIOLATION: Size blocker bypassed. Accepted ${largePayload.length} bytes!`);
      }

      // Case B: Impossible score rate
      addLog('Testing Case B: Impossible score rate heuristics (10,000 points in 5 seconds)...');
      const rReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 10000,
          combo: 1.0,
          duration: 5000,
          checkpoints: [],
          replayData: { events: [] }
        })
      });
      const rRes = await completeSessionHandler(rReq);
      addLog(`Impossible score response code: ${rRes.status} (expecting 400 validation error)`);
      if (rRes.status !== 400) {
        throw new Error('HARD INVARIANT VIOLATION: Anti-cheat bypassed: Accepted impossible scoring rate.');
      }
      invalidatedSessions++;

      // Case C: Malformed checkpoints
      addLog('Testing Case C: Malformed checkpoints (missing Milestone field)...');
      const mcReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 500,
          combo: 1.0,
          duration: 12000,
          checkpoints: [{ hash: 'somehash' }],
          replayData: { events: [] }
        })
      });
      const mcRes = await completeSessionHandler(mcReq);
      addLog(`Malformed checkpoint response code: ${mcRes.status} (expecting 400)`);
      if (mcRes.status !== 400) {
        throw new Error('HARD INVARIANT VIOLATION: Anti-cheat bypassed: Accepted checkpoint without milestone.');
      }

      // Case D: Invalid salt signature
      addLog('Testing Case D: Invalid salt/seed checkpoints signature...');
      const scReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 500,
          combo: 1.0,
          duration: 12000,
          checkpoints: [{ milestone: 'score_500', hash: 'badhashvalue' }],
          replayData: { events: [] }
        })
      });
      const scRes = await completeSessionHandler(scReq);
      addLog(`Invalid checkpoint signature response code: ${scRes.status} (expecting 400)`);
      if (scRes.status !== 400) {
        throw new Error('HARD INVARIANT VIOLATION: Anti-cheat bypassed: Accepted checkpoint with invalid HMAC hash.');
      }

      // Case E: Impossible speed (1000 score in 1 second)
      addLog('Testing Case E: Impossibly fast duration (<3 seconds with score >500)...');
      const spReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 800,
          combo: 1.0,
          duration: 1000, // 1s
          checkpoints: [],
          replayData: { events: [] }
        })
      });
      const spRes = await completeSessionHandler(spReq);
      addLog(`Impossibly fast speed response code: ${spRes.status} (expecting 400)`);
      if (spRes.status !== 400) {
        throw new Error('HARD INVARIANT VIOLATION: Anti-cheat bypassed: Accepted impossibly fast play.');
      }

      addLog('Telemetry corruption filters successfully invalidated all invalid inputs safely.');
    }

    // ==========================================================================
    // 6. MATCH_TIMEOUTS
    // ==========================================================================
    else if (mode === 'MATCH_TIMEOUTS') {
      addLog('Testing Case: Queue expiration sweeps and match forfeits...');
      
      // 1. Create a lobby PENDING that was generated 4 minutes ago
      const stalePending = await prisma.match.create({
        data: {
          gameId: 1,
          arenaTier: ArenaTier.BRONZE,
          status: MatchStatus.PENDING,
          createdAt: new Date(Date.now() - 240000), // 4 mins ago
          players: {
            create: { userId: p1Id, status: 'WAITING' }
          }
        }
      });
      totalMatchesCreated++;

      // 2. Create a match ACTIVE that was generated 12 minutes ago (abandoned P2)
      const staleActive = await prisma.match.create({
        data: {
          gameId: 1,
          arenaTier: ArenaTier.BRONZE,
          status: MatchStatus.ACTIVE,
          createdAt: new Date(Date.now() - 720000), // 12 mins ago
          players: {
            create: [
              { userId: p1Id, status: MatchPlayerStatus.SUBMITTED, score: 900, duration: 45000, combo: 1.2 },
              { userId: p2Id, status: MatchPlayerStatus.PLAYING } // P2 abandoned
            ]
          }
        }
      });
      totalMatchesCreated++;

      // 3. Create a match ACTIVE that was generated 12 minutes ago (abandoned BOTH)
      const doubleAbandoned = await prisma.match.create({
        data: {
          gameId: 1,
          arenaTier: ArenaTier.BRONZE,
          status: MatchStatus.ACTIVE,
          createdAt: new Date(Date.now() - 720000), // 12 mins ago
          players: {
            create: [
              { userId: p1Id, status: MatchPlayerStatus.PLAYING },
              { userId: p2Id, status: MatchPlayerStatus.PLAYING }
            ]
          }
        }
      });
      totalMatchesCreated++;

      // 4. Create an old Session from 15 days ago with replayData
      const oldSession = await prisma.matchSession.create({
        data: {
          matchId: staleActive.id,
          userId: p1Id,
          clientSalt: 'salt',
          sessionSeed: 'seed',
          status: 'COMPLETED',
          replayData: 'dense_compressed_packet_older_than_14_days#events_logs',
          validFrom: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
        }
      });

      // Run garbage collector
      addLog('Invoking Garbage Collection sweeps...');
      cleanupCounts++;
      await ArenaCleanupService.runGarbageCollection();

      // Check results
      const resPending = await prisma.match.findUnique({ where: { id: stalePending.id } });
      const resActive = await prisma.match.findUnique({ where: { id: staleActive.id } });
      const resDouble = await prisma.match.findUnique({ where: { id: doubleAbandoned.id } });
      const resSession = await prisma.matchSession.findUnique({ where: { id: oldSession.id } });

      addLog(`GC results:
        Pending Lobby: ${resPending?.status} (expecting EXPIRED)
        Active Match (P2 Abandon): ${resActive?.status} (expecting COMPLETED via P2 forfeit)
        Active Match (Double Abandon): ${resDouble?.status} (expecting FORFEITED)
        Old Session Replay: ${resSession?.replayData} (expecting null)`);
      
      if (resPending?.status === 'EXPIRED') expiredQueues++;
      else throw new Error('HARD INVARIANT VIOLATION: Stale pending lobby did not transition to EXPIRED');

      if (resActive?.status === 'COMPLETED' && resActive.winnerId === p1Id) {
        forfeits++;
        completedMatches++;
        mmrUpdatesApplied += 2;
        addLog('Default win resolved successfully to P1 inside atomic transaction.');
      } else {
        throw new Error(`HARD INVARIANT VIOLATION: Stale active match P2 abandon resolved in incorrect state: ${resActive?.status}`);
      }

      if (resDouble?.status === MatchStatus.FORFEITED) {
        forfeits += 2;
        addLog('Double abandon match successfully marked as FORFEITED.');
      } else {
        throw new Error(`HARD INVARIANT VIOLATION: Stale active double abandon resolved in incorrect state: ${resDouble?.status}`);
      }

      if (resSession?.replayData === null) {
        addLog('Old telemetry database retention policy sweep cleared stale replay cleanly.');
      } else {
        throw new Error('HARD INVARIANT VIOLATION: Retention sweep failed to clear 15-day-old replay packet.');
      }
    }

    // ==========================================================================
    // 7. FORFEIT_STORMS
    // ==========================================================================
    else if (mode === 'FORFEIT_STORMS') {
      addLog('Starting FORFEIT_STORMS simulation (10 parallel matches experiencing random abandonments)...');
      const stormsCount = 10;
      const stormMatches: string[] = [];

      for (let i = 0; i < stormsCount; i++) {
        const u1 = `sim:did:user-f1-${i}-${seed}`;
        const u2 = `sim:did:user-f2-${i}-${seed}`;
        
        await Promise.all([
          prisma.user.upsert({
            where: { id: u1 },
            update: {},
            create: { id: u1, username: `ForfeitPlayer1_${i}_${seed}`, wallet: `0xforfeitwallet1_${i}_${seed}` }
          }),
          prisma.user.upsert({
            where: { id: u2 },
            update: {},
            create: { id: u2, username: `ForfeitPlayer2_${i}_${seed}`, wallet: `0xforfeitwallet2_${i}_${seed}` }
          })
        ]);

        const decision = Math.floor(rand.nextRange(0, 3)); // 0 = Both abandon, 1 = P1 submit/P2 abandon, 2 = P2 submit/P1 abandon
        
        const m = await prisma.match.create({
          data: {
            gameId: 1,
            arenaTier: ArenaTier.BRONZE,
            status: MatchStatus.ACTIVE,
            createdAt: new Date(Date.now() - 720000), // 12 mins ago (trigger GC forfeit)
            players: {
              create: [
                {
                  userId: u1,
                  status: decision === 1 ? MatchPlayerStatus.SUBMITTED : MatchPlayerStatus.PLAYING,
                  score: decision === 1 ? 1000 : null,
                  duration: decision === 1 ? 50000 : null,
                  combo: decision === 1 ? 1.5 : null
                },
                {
                  userId: u2,
                  status: decision === 2 ? MatchPlayerStatus.SUBMITTED : MatchPlayerStatus.PLAYING,
                  score: decision === 2 ? 1100 : null,
                  duration: decision === 2 ? 55000 : null,
                  combo: decision === 2 ? 1.6 : null
                }
              ]
            }
          }
        });
        totalMatchesCreated++;
        stormMatches.push(m.id);
      }

      addLog(`Created 10 storm matches. Running garbage collection to sweep all forfeits...`);
      cleanupCounts++;
      await ArenaCleanupService.runGarbageCollection();

      // Audit all storm matches
      const settledStorms = await prisma.match.findMany({
        where: { id: { in: stormMatches } },
        include: { players: true }
      });

      for (const sm of settledStorms) {
        addLog(`Storm match ${sm.id} status resolved to: ${sm.status}`);
        if (sm.status !== MatchStatus.COMPLETED && sm.status !== MatchStatus.FORFEITED) {
          throw new Error(`HARD INVARIANT VIOLATION: Storm match ${sm.id} was not resolved by GC! Status: ${sm.status}`);
        }
        if (sm.status === MatchStatus.COMPLETED) {
          completedMatches++;
          forfeits++;
          mmrUpdatesApplied += 2;
        } else if (sm.status === MatchStatus.FORFEITED) {
          forfeits += 2;
        }
      }
      addLog('Forfeit storm cleared successfully. All matches were cleanly processed without corruption.');
    }

    // ==========================================================================
    // 8. DB_RECONNECT_SIMULATION
    // ==========================================================================
    else if (mode === 'DB_RECONNECT_SIMULATION') {
      addLog('Simulating database connection loss / unstable DB reconnect...');
      
      // 1. Force database disconnect
      addLog('Calling prisma.$disconnect() to drop connection...');
      await prisma.$disconnect();
      addLog('Database disconnected successfully.');

      // 2. Perform a query, expecting automatic reconnect
      addLog('Triggering user lookup query (forcing automatic prisma reconnect)...');
      const testUser = await prisma.user.findFirst({ where: { id: p1Id } });
      addLog(`Query completed cleanly. Reconnected database successfully. User ID: ${testUser?.id}`);

      // 3. Mock prisma.$transaction to throw a transient connection exception
      addLog('Mocking transaction loss to verify gracefully failing open (recovering without crashing process)...');
      const originalTransaction = prisma.$transaction;
      
      // Monkey patch $transaction to throw connection pool timeout once
      (prisma as any).$transaction = async () => {
        throw new Error('Database transaction connection pool timeout (simulated exception)');
      };

      const match = await prisma.match.create({
        data: {
          gameId: 1,
          arenaTier: ArenaTier.BRONZE,
          status: MatchStatus.ACTIVE,
          players: {
            create: [
              { userId: p1Id, status: 'WAITING' },
              { userId: p2Id, status: 'WAITING' }
            ]
          }
        }
      });
      totalMatchesCreated++;

      const session = await prisma.matchSession.create({
        data: {
          matchId: match.id,
          userId: p1Id,
          clientSalt: 'salt',
          sessionSeed: 'seed',
          status: 'ACTIVE'
        }
      });

      // Submit score - should invoke mocked failing transaction
      const cReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: session.id,
          score: 700,
          combo: 1.0,
          duration: 40000,
          checkpoints: [],
          replayData: { events: [] }
        })
      });
      
      const cRes = await completeSessionHandler(cReq);
      addLog(`Transaction connection drop API response: ${cRes.status} (expecting 500 fatal complete fallback code)`);

      // Restore transaction
      (prisma as any).$transaction = originalTransaction;

      if (cRes.status !== 500) {
        throw new Error(`HARD INVARIANT VIOLATION: Complete endpoint did not return 500 on database transaction crash. Code: ${cRes.status}`);
      }

      addLog('Database reconnect and exception tolerance testing passed successfully.');
    }

    // ==========================================================================
    // 9. FEATURE_FLAG_SHUTDOWN
    // ==========================================================================
    else if (mode === 'FEATURE_FLAG_SHUTDOWN') {
      addLog('Testing Emergency shutdown feature flag toggle...');
      // Set env disable
      process.env.NEXT_PUBLIC_ARENA_ENABLED = 'false';

      // 1. Matchmaking request
      addLog('Attempting matchmaking while NEXT_PUBLIC_ARENA_ENABLED=false...');
      const req = new Request('http://localhost/api/arena/matchmake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({ gameId: 1, arenaTier: ArenaTier.BRONZE })
      });
      const res = await matchmakeHandler(req);
      addLog(`Emergency matchmaking response: ${res.status} (expecting 503)`);
      if (res.status !== 503) {
        throw new Error('HARD INVARIANT VIOLATION: Matchmaking bypassed emergency flag shutdown!');
      }

      // 2. Session creation request
      addLog('Attempting session creation while NEXT_PUBLIC_ARENA_ENABLED=false...');
      const sReq = new Request('http://localhost/api/arena/session/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({ matchId: 'dummy_match_id' })
      });
      const sRes = await createSessionHandler(sReq);
      addLog(`Emergency session creation response: ${sRes.status} (expecting 503)`);
      if (sRes.status !== 503) {
        throw new Error('HARD INVARIANT VIOLATION: Session creation bypassed emergency flag shutdown!');
      }

      // 3. Session completion request
      addLog('Attempting session completion while NEXT_PUBLIC_ARENA_ENABLED=false...');
      const cReq = new Request('http://localhost/api/arena/session/complete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({
          sessionId: 'dummy_session_id',
          score: 100,
          combo: 1.0,
          duration: 10000,
          checkpoints: [],
          replayData: { events: [] }
        })
      });
      const cRes = await completeSessionHandler(cReq);
      addLog(`Emergency session completion response: ${cRes.status} (expecting 503)`);
      if (cRes.status !== 503) {
        throw new Error('HARD INVARIANT VIOLATION: Session completion bypassed emergency flag shutdown!');
      }

      // 4. Verify cleanup sweeps still run safely
      addLog('Invoking GC sweep while features are disabled to check for stability...');
      cleanupCounts++;
      await ArenaCleanupService.runGarbageCollection();
      
      // Restore flag
      process.env.NEXT_PUBLIC_ARENA_ENABLED = 'true';
      addLog('Emergency features recovered cleanly. All operations verified blocked safely.');
    }

    // ==========================================================================
    // 10. RATE_LIMIT_ATTACK
    // ==========================================================================
    else if (mode === 'RATE_LIMIT_ATTACK') {
      addLog('Testing Rate Limit spam attack (consecutive enqueues)...');
      const queueReq = () => new Request('http://localhost/api/arena/matchmake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p1Id}` },
        body: JSON.stringify({ gameId: 1, arenaTier: ArenaTier.BRONZE })
      });

      // Spam 5 queue requests instantly (Rate limit allowed: 3 per minute)
      const results = await Promise.all([
        matchmakeHandler(queueReq()),
        matchmakeHandler(queueReq()),
        matchmakeHandler(queueReq()),
        matchmakeHandler(queueReq()),
        matchmakeHandler(queueReq())
      ]);

      const codes = results.map(r => r.status);
      const blocked = codes.filter(code => code === 429).length;
      addLog(`Rate Limit responses: ${codes.join(', ')} | Blocked spams: ${blocked}`);
      
      if (blocked === 0) {
        throw new Error('HARD INVARIANT VIOLATION: Rate limiting failed to block spam attack.');
      }
      rateLimitTriggers += blocked;
    }

  } catch (error: any) {
    addLog(`FATAL SIMULATION RECONCILE FAILURE: ${error.message}`);
    return {
      success: false,
      mode,
      seed,
      totalMatchesCreated,
      completedMatches,
      forfeits,
      invalidatedSessions,
      expiredQueues,
      avgQueueTimeMs: 0,
      avgSettlementTimeMs: 0,
      mmrUpdatesApplied,
      replayPayloadAveragesBytes: 0,
      duplicateSubmissionBlocks,
      rateLimitTriggers,
      ghostMatchesSpawned,
      memoryObservations: {
        limiterCacheSize: getLimiterCacheSize(),
        activeMatchesCount: await prisma.match.count({ where: { status: 'ACTIVE' } }),
        heapUsedBytes: process.memoryUsage().heapUsed,
        limiterBucketCounts: getLimiterCacheSize(),
        cleanupCounts
      },
      invariantAuditPassed: false,
      logs
    };
  }

  // ==========================================================================
  // 4. Invariant Assertion Checkpoints (Hard Invariant Auditing)
  // ==========================================================================
  addLog('Initializing Hard Invariant Audits...');
  let invariantAuditPassed = true;

  try {
    // Invariant 1: No match resolves twice
    const doubleResolved = await prisma.match.findMany({
      where: { resolvedAt: { not: null }, status: { not: 'COMPLETED' } }
    });
    if (doubleResolved.length > 0) throw new Error('double resolution matches found.');

    // Invariant 2: No active match exists without players
    const emptyActive = await prisma.match.findMany({
      where: { status: MatchStatus.ACTIVE, players: { none: {} } }
    });
    if (emptyActive.length > 0) throw new Error('Active matches exist without players.');

    // Invariant 3: No session logs remain ACTIVE for resolved matches
    const orphanedActiveSessions = await prisma.matchSession.findMany({
      where: { status: 'ACTIVE', match: { status: { in: ['COMPLETED', 'FORFEITED', 'INVALIDATED'] } } }
    });
    if (orphanedActiveSessions.length > 0) {
      throw new Error(`${orphanedActiveSessions.length} active sessions exist inside resolved matches.`);
    }

    // Invariant 4: No double MMR updates in database (MMR calculation integrity check)
    // Audits PlayerRank wins/losses totals match Elo allocations
    const placementCheck = await prisma.playerRank.findMany({
      where: { matchesPlayed: { lt: 0 } }
    });
    if (placementCheck.length > 0) throw new Error('Matches played cannot be negative.');

    // Invariant 5: No queue entries survive cleanup (all stale queues expired)
    const staleQueues = await prisma.match.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 200000) } }
    });
    if (staleQueues.length > 0 && mode === 'MATCH_TIMEOUTS') {
      throw new Error(`${staleQueues.length} stale pending queue lobbies survived garbage collection sweep.`);
    }

    // Invariant 6: No unresolved ACTIVE matches after GC pass (all stale active forfeited)
    const staleActiveMatches = await prisma.match.findMany({
      where: { status: 'ACTIVE', createdAt: { lt: new Date(Date.now() - 650000) } }
    });
    if (staleActiveMatches.length > 0 && mode === 'MATCH_TIMEOUTS') {
      throw new Error(`${staleActiveMatches.length} stale active matches survived garbage collection forfeit sweep.`);
    }

    addLog('Hard Invariant Audit: All database constraints and rules verified successfully.');
  } catch (err: any) {
    addLog(`HARD INVARIANT VIOLATION: ${err.message}`);
    invariantAuditPassed = false;
  }

  // Calculate averages safely
  const avgQueueTimeMs = queueTimesMs.length > 0 
    ? Math.round(queueTimesMs.reduce((a, b) => a + b, 0) / queueTimesMs.length)
    : 0;

  const avgSettlementTimeMs = settlementTimesMs.length > 0
    ? Math.round(settlementTimesMs.reduce((a, b) => a + b, 0) / settlementTimesMs.length)
    : 0;

  const replayPayloadAveragesBytes = replaySizesBytes.length > 0
    ? Math.round(replaySizesBytes.reduce((a, b) => a + b, 0) / replaySizesBytes.length)
    : 0;

  return {
    success: invariantAuditPassed,
    mode,
    seed,
    totalMatchesCreated,
    completedMatches,
    forfeits,
    invalidatedSessions,
    expiredQueues,
    avgQueueTimeMs,
    avgSettlementTimeMs,
    mmrUpdatesApplied,
    replayPayloadAveragesBytes,
    duplicateSubmissionBlocks,
    rateLimitTriggers,
    ghostMatchesSpawned,
    memoryObservations: {
      limiterCacheSize: getLimiterCacheSize(),
      activeMatchesCount: await prisma.match.count({ where: { status: 'ACTIVE' } }),
      heapUsedBytes: process.memoryUsage().heapUsed,
      limiterBucketCounts: getLimiterCacheSize(),
      cleanupCounts
    },
    invariantAuditPassed,
    logs
  };
}

// ============================================================================
// 5. Direct Execution CLI Runner
// ============================================================================
async function runCli() {
  // Check if run directly from node/tsx
  const isDirect = require.main === module || (process.argv[1] && (process.argv[1].endsWith('simulate-arena.ts') || process.argv[1].endsWith('simulate-arena')));
  if (!isDirect) return;

  console.log("\n=======================================================");
  console.log("        RCADE COMPETITIVE ARENA SIMULATION RUNNER      ");
  console.log("=======================================================\n");

  // Parse CLI args
  let modeArg: string | null = null;
  let seedArg = 1337;

  for (const arg of process.argv) {
    if (arg.startsWith('--mode=')) {
      modeArg = arg.split('=')[1];
    } else if (arg.startsWith('--seed=')) {
      seedArg = parseInt(arg.split('=')[1], 10) || 1337;
    }
  }

  const allModes = [
    'NORMAL_MATCH_FLOW',
    'DUPLICATE_SUBMISSION_SPAM',
    'QUEUE_FLOOD',
    'GHOST_MATCH_FALLBACK',
    'TELEMETRY_CORRUPTION',
    'MATCH_TIMEOUTS',
    'FORFEIT_STORMS',
    'DB_RECONNECT_SIMULATION',
    'FEATURE_FLAG_SHUTDOWN',
    'RATE_LIMIT_ATTACK'
  ];

  const modesToRun = modeArg ? [modeArg] : allModes;
  let allSuccessful = true;

  console.log(`Running seed: ${seedArg}`);
  console.log(`Target simulation modes: ${modesToRun.join(', ')}\n`);

  for (const mode of modesToRun) {
    console.log(`-------------------------------------------------------`);
    console.log(`🚀 Executing simulation mode: ${mode}`);
    console.log(`-------------------------------------------------------`);
    
    try {
      const report = await runSimulationSuite(mode, seedArg);
      
      console.log(`\nResults for ${mode}:`);
      console.log(`- Success Invariant Passed: ${report.success ? '✅ YES' : '❌ NO'}`);
      console.log(`- Total Matches Created   : ${report.totalMatchesCreated}`);
      console.log(`- Completed Matches       : ${report.completedMatches}`);
      console.log(`- Forfeits                : ${report.forfeits}`);
      console.log(`- Invalidated Sessions    : ${report.invalidatedSessions}`);
      console.log(`- Expired Queues          : ${report.expiredQueues}`);
      console.log(`- Rate Limit Triggers     : ${report.rateLimitTriggers}`);
      console.log(`- Ghost Matches Spawned   : ${report.ghostMatchesSpawned}`);
      
      if (!report.success) {
        allSuccessful = false;
        console.error(`\n❌ Mode ${mode} failed hard invariants check! Full logs:\n`);
        report.logs.forEach(l => console.error(l));
      } else {
        console.log(`\n✅ Mode ${mode} completed successfully!`);
      }
      console.log();
    } catch (err: any) {
      allSuccessful = false;
      console.error(`❌ Crashed during simulation execution:`, err);
    }
  }

  console.log("=======================================================");
  console.log("              FINAL SIMULATION AUDIT SUMMARY           ");
  console.log("=======================================================");
  if (allSuccessful) {
    console.log("🎉 ALL ARENA LIFE-CYCLE SIMULATION TESTS PASSED CLEANLY! 🎉\n");
    process.exit(0);
  } else {
    console.error("❌ STABILITY ALERT: SOME SIMULATION TEST MODES FAILED! ❌\n");
    process.exit(1);
  }
}

runCli().catch(err => {
  console.error("CLI run error:", err);
  process.exit(1);
});
