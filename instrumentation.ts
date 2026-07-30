export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startIndexer } = await import('./services/indexer');
        const { reconcileOwnerships, startPeriodicReconciliation } = await import('./services/reconciliation');

        console.log("[System] Booting Self-Healing Inventory Infrastructure...");

        // Defer all heavy background work by 3s so the first browser request
        // is never blocked by blockchain RPC calls or DB queries at startup.
        setTimeout(() => {
            // 1. One-time Startup Reconciliation (fire and forget)
            reconcileOwnerships(true).catch(console.error);

            // 2. Start the Indexer (backfill + live watchers)
            startIndexer().catch(console.error);

            // 3. Start Periodic 120s Heartbeat
            startPeriodicReconciliation();

            console.log("[System] Background infrastructure services started.");
        }, 3000);

        console.log("[System] Server ready. Background tasks deferred by 3s.");
    }
}
