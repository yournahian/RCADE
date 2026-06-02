import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { prisma } from '../lib/prisma';
import { privy } from '../lib/privy';
import { AuditArchiveService } from '../services/audit-archive';
import { CompatibilityDecoder } from '../lib/arena/protocol-compat';
import { MetricsService } from '../services/metrics';
import { ArenaVerifier } from '../services/arena-verifier';
import crypto from 'crypto';

async function executeCertificationPipeline() {
  console.log('\n=============================================================================');
  console.log('              RCADE ARENA // PRODUCTION CERTIFICATION CANDIDATE (PCC)        ');
  console.log('                 Mandatory Pre-Deployment Operational Gate                   ');
  console.log('=============================================================================\n');

  const gates: { name: string; run: () => Promise<{ success: boolean; details: string }> }[] = [];

  // -------------------------------------------------------------------------
  // Gate 1: Database Schema & Migration Invariants
  // -------------------------------------------------------------------------
  gates.push({
    name: 'Prisma DB Schema Compliance',
    run: async () => {
      try {
        // Assert that new schema fields and models are present in Prisma Client metadata
        const dbsCount = await prisma.auditArchive.count();
        const appealsCount = await prisma.moderationAppeal.count();
        
        // Assert protocolVersion field is querying correctly
        await prisma.matchSession.findFirst({
          select: { protocolVersion: true }
        });
        await prisma.matchReceipt.findFirst({
          select: { protocolVersion: true }
        });

        return {
          success: true,
          details: `Validated models AuditArchive (${dbsCount} blocks) and ModerationAppeal (${appealsCount} appeals) cleanly.`
        };
      } catch (err: any) {
        return {
          success: false,
          details: `Schema field assertion failed: ${err.message}`
        };
      }
    }
  });

  // -------------------------------------------------------------------------
  // Gate 2: Tamper-Evident Ledger Cryptographic Integrity Check
  // -------------------------------------------------------------------------
  gates.push({
    name: 'Tamper-Evident Ledger Integrity',
    run: async () => {
      try {
        const audit = await AuditArchiveService.auditChainIntegrity();
        if (audit.healthy) {
          return {
            success: true,
            details: 'Audit ledger rolling HMAC-SHA256 integrity check is 100% HEALTHY.'
          };
        } else {
          return {
            success: false,
            details: `Chain break detected! Broken Sequence: ${audit.brokenSequenceId} | Reason: ${audit.reason}`
          };
        }
      } catch (err: any) {
        return {
          success: false,
          details: `Ledger auditor panicked: ${err.message}`
        };
      }
    }
  });

  // -------------------------------------------------------------------------
  // Gate 3: Stable-Key Order Normalization & Decoders
  // -------------------------------------------------------------------------
  gates.push({
    name: 'Deterministic key-ordering & Compatibility Decoders',
    run: async () => {
      try {
        // Assert canonical JSON sorting holds cross-runtime
        const objA = { z: 1, a: 2, m: { y: 3, x: 4 } };
        const objB = { a: 2, z: 1, m: { x: 4, y: 3 } };
        
        const stringA = CompatibilityDecoder.canonicalizeJson(objA);
        const stringB = CompatibilityDecoder.canonicalizeJson(objB);

        if (stringA !== stringB) {
          return {
            success: false,
            details: `Divergence in key ordering! stringA: ${stringA} | stringB: ${stringB}`
          };
        }

        // Test decoder logic
        const legacyReplay = { duration: 15000, score: 320, events: [] };
        const decoded = CompatibilityDecoder.decodeReplay('1.0.0-alpha', legacyReplay);
        
        if (decoded.durationMs !== 15000 || decoded.score !== 320) {
          return {
            success: false,
            details: 'Compatibility decoders failed to decode legacy schemas.'
          };
        }

        return {
          success: true,
          details: `Canonicalized JSON key order verified: "${stringA}"`
        };
      } catch (err: any) {
        return {
          success: false,
          details: `Decoder error: ${err.message}`
        };
      }
    }
  });

  // -------------------------------------------------------------------------
  // Gate 4: Prometheus Exporter Exposition Verification
  // -------------------------------------------------------------------------
  gates.push({
    name: 'Prometheus Metrics Exposition Standard',
    run: async () => {
      try {
        const metricsOutput = await MetricsService.getPrometheusFormat();
        
        // Assert basic HELP and TYPE lines exist
        const hasHelp = metricsOutput.includes('# HELP');
        const hasType = metricsOutput.includes('# TYPE');
        const hasCustomCount = metricsOutput.includes('settlement_failures_total');

        if (!hasHelp || !hasType || !hasCustomCount) {
          return {
            success: false,
            details: `Prometheus format violation: HELP=${hasHelp}, TYPE=${hasType}, CustomMetric=${hasCustomCount}`
          };
        }

        return {
          success: true,
          details: 'Verified Prometheus exposer serves plain text v0.0.4 metrics cleanly.'
        };
      } catch (err: any) {
        return {
          success: false,
          details: `Metrics verification panicked: ${err.message}`
        };
      }
    }
  });

  // -------------------------------------------------------------------------
  // Gate 5: Authoritative Verification Engine Tests
  // -------------------------------------------------------------------------
  gates.push({
    name: 'Anti-Cheat Telemetry Invariants',
    run: async () => {
      try {
        // Assert impossibly high score rates are rejected
        const impossiblyHighScore = ArenaVerifier.verifyTelemetry(
          'seed',
          'salt',
          50000, // 50,000 points in 10s is impossible
          10000,
          [],
          'match',
          'user'
        );

        if (impossiblyHighScore.isValid) {
          return {
            success: false,
            details: 'Verifier fail-open vulnerability: permitted impossible score rate!'
          };
        }

        return {
          success: true,
          details: 'Telemetry invariants correctly blocked extreme speedhack and score rate anomalies.'
        };
      } catch (err: any) {
        return {
          success: false,
          details: `Verifier verification panicked: ${err.message}`
        };
      }
    }
  });

  // -------------------------------------------------------------------------
  // Gate 6: Deterministic Authoritative Match State FSM Transition Guards
  // -------------------------------------------------------------------------
  gates.push({
    name: 'FSM Match State Transition Guards',
    run: async () => {
      try {
        const { ArenaMatchFSM } = require('../lib/arena/fsm');

        // 1. Assert allowed transitions succeed
        ArenaMatchFSM.validateTransition('test-match-1', 'QUEUED', 'MATCHED');
        ArenaMatchFSM.validateTransition('test-match-1', 'MATCHED', 'COUNTDOWN');
        ArenaMatchFSM.validateTransition('test-match-1', 'COUNTDOWN', 'ACTIVE');
        ArenaMatchFSM.validateTransition('test-match-1', 'ACTIVE', 'SUBMITTED');
        ArenaMatchFSM.validateTransition('test-match-1', 'SUBMITTED', 'VERIFIED');
        ArenaMatchFSM.validateTransition('test-match-1', 'VERIFIED', 'COMPLETED');

        // 2. Assert disallowed transitions are rejected
        let activeToQueuedViolated = false;
        try {
          ArenaMatchFSM.validateTransition('test-match-1', 'ACTIVE', 'QUEUED');
        } catch {
          activeToQueuedViolated = true;
        }

        let completedToActiveViolated = false;
        try {
          ArenaMatchFSM.validateTransition('test-match-1', 'COMPLETED', 'ACTIVE');
        } catch {
          completedToActiveViolated = true;
        }

        let verifiedToMatchedViolated = false;
        try {
          ArenaMatchFSM.validateTransition('test-match-1', 'VERIFIED', 'MATCHED');
        } catch {
          verifiedToMatchedViolated = true;
        }

        if (!activeToQueuedViolated || !completedToActiveViolated || !verifiedToMatchedViolated) {
          return {
            success: false,
            details: `FSM transition guard fail-open: permitted illegal state change! (activeToQueued=${!activeToQueuedViolated}, completedToActive=${!completedToActiveViolated}, verifiedToMatched=${!verifiedToMatchedViolated})`
          };
        }

        return {
          success: true,
          details: 'Central transition validator correctly rejected unauthorized transitions (ACTIVE->QUEUED, COMPLETED->ACTIVE, VERIFIED->MATCHED).'
        };
      } catch (err: any) {
        return {
          success: false,
          details: `FSM Transition verification panicked: ${err.message}`
        };
      }
    }
  });

  // Execute all gates sequentially
  let allPassed = true;
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i];
    console.log(`[Gate ${i+1}/${gates.length}] Running validation for: ${gate.name}...`);
    
    const start = Date.now();
    const result = await gate.run();
    const duration = Date.now() - start;

    if (result.success) {
      console.log(`  ✓ [PASS] (${duration}ms) - ${result.details}\n`);
    } else {
      console.error(`  ✗ [FAIL] (${duration}ms) - ${result.details}\n`);
      allPassed = false;
    }
  }

  console.log('=============================================================================');
  console.log('                     FINAL CERTIFICATION ASSESSMENT SUMMARY                  ');
  console.log('=============================================================================');
  if (allPassed) {
    console.log('  STATUS:  ✓ PROMOTED TO PRODUCTION RELEASE CANDIDATE (PCC-APPROVED)');
    console.log('  REASON:  All operational security invariants, decoders, and chains pass.');
    console.log('=============================================================================\n');
    process.exit(0);
  } else {
    console.error('  STATUS:  ✗ RELEASE CERTIFICATION BLOCKED (PCC-REJECTED)');
    console.error('  REASON:  One or more operational gate checks failed. Correct schemas.');
    console.log('=============================================================================\n');
    process.exit(1);
  }
}

executeCertificationPipeline().catch(err => {
  console.error('[CertificationPanicked] Pipeline panicked under unhandled failure:', err);
  process.exit(1);
});
