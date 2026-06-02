export interface GameVerifierStrategy {
  /**
   * Returns the maximum possible score accumulation rate per second.
   */
  getMaxPossibleScore(durationMs: number): number;

  /**
   * Runs game-specific chronological, velocity, and action cadence audits on replay events.
   */
  verifyReplayEvents(
    events: any[],
    matchId: string,
    userId: string
  ): { isValid: boolean; reason?: string };
}
