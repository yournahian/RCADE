export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startIndexer } = await import('./services/indexer');
        const { reconcileOwnerships, startPeriodicReconciliation } = await import('./services/reconciliation');

        console.log("[System] Booting Self-Healing Inventory Infrastructure...");
        
        // 1. One-time Startup Reconciliation (repair immediately before watcher starts)
        await reconcileOwnerships(true).catch(console.error);

        // 2. Start the Indexer (will backfill any missed logs)
        startIndexer().catch(console.error);

        // 3. Start Periodic 120s Heartbeat
        startPeriodicReconciliation();
    }
}
