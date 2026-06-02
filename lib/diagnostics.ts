export interface DiagnosticMetrics {
    rpcFailureCount: number;
    indexerReconnectCount: number;
    websocketFailures: number;
    pollingFallbackActive: boolean;
    consecutiveWebsocketFailures: number;
    lastReconnectionTimestamp: string | null;
    lastSyncDurationMs: number;
    lastProgressionDurationMs: number;
    transactionFailures: Record<string, number>;
    latencyHistoryMs: number[];
}

const globalForDiagnostics = globalThis as unknown as {
    metrics?: DiagnosticMetrics;
};

export const metrics: DiagnosticMetrics = globalForDiagnostics.metrics ?? {
    rpcFailureCount: 0,
    indexerReconnectCount: 0,
    websocketFailures: 0,
    pollingFallbackActive: false,
    consecutiveWebsocketFailures: 0,
    lastReconnectionTimestamp: null,
    lastSyncDurationMs: 0,
    lastProgressionDurationMs: 0,
    transactionFailures: {},
    latencyHistoryMs: []
};

if (process.env.NODE_ENV !== 'production') {
    globalForDiagnostics.metrics = metrics;
}

export function recordRPCFailure() {
    metrics.rpcFailureCount++;
}

export function recordIndexerReconnect() {
    metrics.indexerReconnectCount++;
    metrics.lastReconnectionTimestamp = new Date().toISOString();
}

export function recordWebsocketFailure() {
    metrics.websocketFailures++;
    metrics.consecutiveWebsocketFailures++;
}

export function resetConsecutiveWebsocketFailures() {
    metrics.consecutiveWebsocketFailures = 0;
}

export function setPollingFallbackActive(active: boolean) {
    metrics.pollingFallbackActive = active;
}

export function recordSyncDuration(ms: number) {
    metrics.lastSyncDurationMs = ms;
    metrics.latencyHistoryMs.push(ms);
    if (metrics.latencyHistoryMs.length > 50) {
        metrics.latencyHistoryMs.shift();
    }
}

export function recordProgressionDuration(ms: number) {
    metrics.lastProgressionDurationMs = ms;
}

export function recordTransactionFailure(category: string) {
    metrics.transactionFailures[category] = (metrics.transactionFailures[category] || 0) + 1;
}
