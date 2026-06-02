/**
 * Debounces overlapping refresh operations and collapses concurrent sync runs.
 * Prevents multiple concurrent calls and collapses them to a single running execution.
 */
class SyncQueue {
  private activePromise: Promise<void> | null = null;
  private pendingPromise: Promise<void> | null = null;

  /**
   * Run the provided function, collapsing overlapping or consecutive requests.
   * If a sync is already running, queue a single subsequent sync that will execute
   * once the current one completes, collapsing any additional requests that arrive in the meantime.
   */
  async enqueue(syncFn: () => Promise<void>): Promise<void> {
    if (this.activePromise) {
      // If a pending execution is already queued, return it (collapsing multiple storms)
      if (!this.pendingPromise) {
        this.pendingPromise = (async () => {
          // Wait for the active one to complete
          await this.activePromise;
          try {
            await syncFn();
          } finally {
            this.pendingPromise = null;
          }
        })();
      }
      return this.pendingPromise;
    }

    // No active run, start now
    this.activePromise = (async () => {
      try {
        await syncFn();
      } finally {
        this.activePromise = null;
      }
    })();

    return this.activePromise;
  }
}

export const syncQueue = new SyncQueue();
