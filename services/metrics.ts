import { prisma } from '../lib/prisma';
import { AuditArchiveService } from './audit-archive';

// Define a global singleton to survive Next.js dev hot-reloads and route invocations
const globalMetrics = global as unknown as {
  prometheusMetrics: Record<string, number>;
};

if (!globalMetrics.prometheusMetrics) {
  globalMetrics.prometheusMetrics = {
    settlement_failures_total: 0,
    replay_chain_breaks_total: 0,
    authority_transfer_attempts_total: 0,
    observer_mode_activations_total: 0,
    drift_budget_exhaustions_total: 0,
    ghost_match_activations_total: 0,
    invalidation_false_positive_reviews_total: 0,
  };
}

export class MetricsService {
  /**
   * Increments a custom metric counter atomically.
   */
  static increment(metricName: string, amount: number = 1) {
    if (globalMetrics.prometheusMetrics[metricName] !== undefined) {
      globalMetrics.prometheusMetrics[metricName] += amount;
      console.log(`[Metrics][Increment] ${metricName} increased by ${amount}. New value: ${globalMetrics.prometheusMetrics[metricName]}`);
    } else {
      globalMetrics.prometheusMetrics[metricName] = amount;
    }
  }

  /**
   * Sets a specific gauge value.
   */
  static set(metricName: string, value: number) {
    globalMetrics.prometheusMetrics[metricName] = value;
  }

  /**
   * Retrieves current metrics, merging in-memory counts with active database audit state.
   */
  static async getPrometheusFormat(): Promise<string> {
    // Dynamically query database state to provide real-time accurate counts for chain breaks
    try {
      const integrity = await AuditArchiveService.auditChainIntegrity();
      if (!integrity.healthy) {
        globalMetrics.prometheusMetrics.replay_chain_breaks_total = 1;
      } else {
        globalMetrics.prometheusMetrics.replay_chain_breaks_total = 0;
      }
    } catch (err) {
      console.error('[Metrics] Failed to fetch live ledger integrity status:', err);
    }

    // Also get active database metrics e.g. active matches in progress
    let activeMatches = 0;
    try {
      activeMatches = await prisma.match.count({
        where: { status: 'ACTIVE' }
      });
    } catch (err) {
      console.error('[Metrics] Failed to query active match count:', err);
    }

    let completedMatches = 0;
    try {
      completedMatches = await prisma.match.count({
        where: { status: 'COMPLETED' }
      });
    } catch (err) {
      console.error('[Metrics] Failed to query completed match count:', err);
    }

    const metrics = {
      ...globalMetrics.prometheusMetrics,
      active_match_count: activeMatches,
      completed_match_count: completedMatches
    };

    let output = '';
    
    // Format according to Prometheus standard exposition text
    for (const [key, value] of Object.entries(metrics)) {
      const help = getMetricHelp(key);
      const type = getMetricType(key);
      
      output += `# HELP ${key} ${help}\n`;
      output += `# TYPE ${key} ${type}\n`;
      output += `${key} ${value}\n\n`;
    }

    return output;
  }
}

function getMetricHelp(name: string): string {
  switch (name) {
    case 'settlement_failures_total':
      return 'Total number of match settlement failures or aborts.';
    case 'replay_chain_breaks_total':
      return 'Total number of validation chain breaks detected in the immutable ledger.';
    case 'authority_transfer_attempts_total':
      return 'Total number of tab-authority takeover or multi-tab hijack attempts.';
    case 'observer_mode_activations_total':
      return 'Total number of instances a secondary tab was downgraded to passive observer mode.';
    case 'drift_budget_exhaustions_total':
      return 'Total number of match sessions that exceeded the acceptable latency drift budget.';
    case 'ghost_match_activations_total':
      return 'Total number of fallback AI-ghost match activations during matchmaking timeouts.';
    case 'invalidation_false_positive_reviews_total':
      return 'Total number of false-positive anti-cheat invalidations reviewed and reverted.';
    case 'active_match_count':
      return 'Number of concurrent match arenas actively running.';
    case 'completed_match_count':
      return 'Cumulative count of successfully finalized matches.';
    default:
      return 'Custom competitive arena metric.';
  }
}

function getMetricType(name: string): string {
  if (name.endsWith('_count') || name.endsWith('_total')) {
    return 'counter';
  }
  return 'gauge';
}
