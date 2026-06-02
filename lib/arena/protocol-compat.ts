/**
 * RCADE Competitive Arena
 * Protocol Compatibility, Decoders & Schema Freezing Layer
 */

export const ARENA_PROTOCOL_VERSION = '1.0.0-alpha';

export interface ReplayData {
  userId: string;
  durationMs: number;
  score: number;
  events: any[];
}

export interface SettlementReceipt {
  matchId: string;
  winnerId: string | null;
  scores: { [userId: string]: number };
  telemetryHash: string;
  settlementHash: string;
  resolvedAt: string;
  protocolVersion: string;
}

export class CompatibilityDecoder {
  /**
   * Decodes replay data payload based on its protocol version.
   * If format evolves in subsequent versions (e.g. 1.1.0, 2.0.0), this handles dynamic translations.
   */
  static decodeReplay(version: string, payload: any): ReplayData {
    console.log(`[Arena][Compat] Decoding replay data using schema version: ${version}`);

    if (version === '1.0.0-alpha') {
      // Version 1.0.0-alpha expected structure
      return {
        userId: payload.userId || '',
        durationMs: payload.durationMs || payload.duration || 0,
        score: payload.score || 0,
        events: Array.isArray(payload.events) ? payload.events : []
      };
    }

    // Fallback: Attempt standard parsing
    return {
      userId: payload.userId || '',
      durationMs: payload.durationMs || 0,
      score: payload.score || 0,
      events: Array.isArray(payload.events) ? payload.events : []
    };
  }

  /**
   * Decodes match receipts based on their protocol version.
   * Prevents signature validation failure under legacy receipts schema updates.
   */
  static decodeReceipt(version: string, receipt: any): SettlementReceipt {
    console.log(`[Arena][Compat] Decoding match receipt using schema version: ${version}`);

    return {
      matchId: receipt.matchId || '',
      winnerId: receipt.winnerId || null,
      scores: receipt.scores || {},
      telemetryHash: receipt.telemetryHash || '',
      settlementHash: receipt.settlementHash || '',
      resolvedAt: receipt.resolvedAt ? new Date(receipt.resolvedAt).toISOString() : new Date().toISOString(),
      protocolVersion: receipt.protocolVersion || version
    };
  }

  /**
   * Performs deterministic, canonical JSON serialization to prevent cross-runtime
   * signature drifts during hashing and cryptographic verification.
   * Order keys alphabetically before serialization.
   */
  static canonicalizeJson(obj: any): string {
    if (obj === null) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.canonicalizeJson(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const properties = keys.map(key => `"${key}":${this.canonicalizeJson(obj[key])}`);
    return '{' + properties.join(',') + '}';
  }
}
