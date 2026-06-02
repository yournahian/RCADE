export class ArenaMatchFSM {
  private static ALLOWED_TRANSITIONS: Record<string, string[]> = {
    'QUEUED': ['MATCHED', 'CANCELLED'],
    'MATCHED': ['COUNTDOWN', 'ACTIVE', 'CANCELLED', 'COMPLETED'],
    'COUNTDOWN': ['ACTIVE', 'CANCELLED', 'COMPLETED'],
    'ACTIVE': ['SUBMITTED', 'VERIFIED', 'COMPLETED', 'CANCELLED', 'DISPUTED'],
    'SUBMITTED': ['VERIFIED', 'COMPLETED', 'DISPUTED'],
    'VERIFIED': ['COMPLETED', 'DISPUTED'],
    'COMPLETED': [], // Terminal state, no outgoing transitions allowed
    'CANCELLED': [], // Terminal state, no outgoing transitions allowed
    'DISPUTED': ['COMPLETED']
  };

  /**
   * Evaluates if a given state change is valid under FSM rules.
   */
  public static isValidTransition(currentStatus: string, nextStatus: string): boolean {
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed) return false;
    return allowed.includes(nextStatus);
  }

  /**
   * Enforces transition constraints and throws critical errors on invalid attempts.
   */
  public static validateTransition(matchId: string, currentStatus: string, nextStatus: string): void {
    if (currentStatus === nextStatus) {
      console.log(`[FSM][Idempotent] Match ${matchId} is already in state: ${nextStatus}. Update bypassed.`);
      return;
    }

    if (!this.isValidTransition(currentStatus, nextStatus)) {
      const errorMsg = `[FSM][Violation] Invalid state mutation: Cannot transition match ${matchId} from ${currentStatus} -> ${nextStatus}.`;
      console.error(errorMsg);
      throw new Error(`Deterministic state mutation violation: cannot transition match from ${currentStatus} to ${nextStatus}.`);
    }

    console.log(`[FSM][Transition] Match ${matchId} verified: ${currentStatus} -> ${nextStatus}`);
  }
}
