export interface ArenaRuleAdapter {
  /**
   * Evaluates match parameters to determine the winner.
   * Returns "player1", "player2", or null (for a draw).
   */
  determineWinner(
    p1Score: number, p1Duration: number, p1Replay: any,
    p2Score: number, p2Duration: number, p2Replay: any
  ): 'player1' | 'player2' | null;

  /**
   * Server-authoritative validation check on score vs duration.
   */
  validateScore(score: number, duration: number, replayData: any): boolean;

  /**
   * Server-authoritative validation check on player inputs / checksums.
   */
  validateReplay(replayData: any, seed: string): boolean;

  /**
   * Timeout threshold in seconds after which the match is forfeited / timed out.
   */
  getTimeoutThreshold(): number;
}

export class SnakeRuleAdapter implements ArenaRuleAdapter {
  determineWinner(
    p1Score: number, p1Duration: number, p1Replay: any,
    p2Score: number, p2Duration: number, p2Replay: any
  ): 'player1' | 'player2' | null {
    // Survival-based win condition: First death loses (duration)
    if (p1Duration > p2Duration) return 'player1';
    if (p2Duration > p1Duration) return 'player2';

    // Tie-breaker: Highest score
    if (p1Score > p2Score) return 'player1';
    if (p2Score > p1Score) return 'player2';

    return null; // Absolute Draw
  }

  validateScore(score: number, duration: number, replayData: any): boolean {
    // In Neon Snake, score rate shouldn't exceed 200 points per second
    const maxScore = (duration / 1000) * 200;
    return score <= maxScore || score < 500;
  }

  validateReplay(replayData: any, seed: string): boolean {
    if (!replayData || !Array.isArray(replayData.events)) return false;
    // Check for impossible move jumps or timestamps
    let lastTime = 0;
    for (const ev of replayData.events) {
      if (ev.t < lastTime) return false; // Backwards chronos
      lastTime = ev.t;
    }
    return true;
  }

  getTimeoutThreshold(): number {
    return 600; // 10 minutes maximum time limit (play until you die!)
  }
}

export class SpaceImpactRuleAdapter implements ArenaRuleAdapter {
  determineWinner(
    p1Score: number, p1Duration: number, p1Replay: any,
    p2Score: number, p2Duration: number, p2Replay: any
  ): 'player1' | 'player2' | null {
    // Score-based win condition: Highest score wins
    if (p1Score > p2Score) return 'player1';
    if (p2Score > p1Score) return 'player2';

    // Tie-breaker: Longer survival duration
    if (p1Duration > p2Duration) return 'player1';
    if (p2Duration > p1Duration) return 'player2';

    return null; // Absolute Draw
  }

  validateScore(score: number, duration: number, replayData: any): boolean {
    // In Space Impact, maximum points rate shouldn't exceed 500 points per second
    const maxScore = (duration / 1000) * 500;
    return score <= maxScore || score < 1000;
  }

  validateReplay(replayData: any, seed: string): boolean {
    if (!replayData || !Array.isArray(replayData.events)) return false;
    return true;
  }

  getTimeoutThreshold(): number {
    return 600; // 10 minutes maximum space shootout limit (play until you die!)
  }
}

export class SudokuRuleAdapter implements ArenaRuleAdapter {
  determineWinner(
    p1Score: number, p1Duration: number, p1Replay: any,
    p2Score: number, p2Duration: number, p2Replay: any
  ): 'player1' | 'player2' | null {
    // Puzzle-based win condition: Fastest completion wins (shortest duration)
    // Both players must complete the Sudoku correctly.
    // If one completes and the other doesn't, the completing player wins.
    const p1Completed = p1Score >= 100; // completion milestone check
    const p2Completed = p2Score >= 100;

    if (p1Completed && !p2Completed) return 'player1';
    if (p2Completed && !p1Completed) return 'player2';
    if (!p1Completed && !p2Completed) {
      // If neither completed, highest progress (score) wins
      if (p1Score > p2Score) return 'player1';
      if (p2Score > p1Score) return 'player2';
      return null;
    }

    // Both completed successfully: fastest wins
    if (p1Duration < p2Duration) return 'player1';
    if (p2Duration < p1Duration) return 'player2';

    return null; // Absolute Draw
  }

  validateScore(score: number, duration: number, replayData: any): boolean {
    // Complete Sudoku grid is 81 squares. Score represents correct boxes.
    return score <= 81 && duration >= 10000; // must take at least 10 seconds to solve a full board
  }

  validateReplay(replayData: any, seed: string): boolean {
    if (!replayData || !Array.isArray(replayData.events)) return false;
    // Solve interval must be humanly possible (e.g. >180ms per number insertion)
    let insertions = 0;
    let lastTime = 0;
    for (const ev of replayData.events) {
      if (ev.e === 'input_digit') {
        const delta = ev.t - lastTime;
        if (delta < 180 && insertions > 0) return false; // INPUT_FLOOD_DETECTED
        insertions++;
        lastTime = ev.t;
      }
    }
    return true;
  }

  getTimeoutThreshold(): number {
    return 900; // 15 minutes maximum puzzle solving timeframe
  }
}

export class RunnerRuleAdapter implements ArenaRuleAdapter {
  determineWinner(
    p1Score: number, p1Duration: number, p1Replay: any,
    p2Score: number, p2Duration: number, p2Replay: any
  ): 'player1' | 'player2' | null {
    // Survival-based win condition: First death loses (duration)
    if (p1Duration > p2Duration) return 'player1';
    if (p2Duration > p1Duration) return 'player2';

    // Tie-breaker: Highest score
    if (p1Score > p2Score) return 'player1';
    if (p2Score > p1Score) return 'player2';

    return null; // Absolute Draw
  }

  validateScore(score: number, duration: number, replayData: any): boolean {
    // In Cyber Runner, maximum score rate shouldn't exceed 1000 points per second
    const maxScore = (duration / 1000) * 1000;
    return score <= maxScore || score < 1000;
  }

  validateReplay(replayData: any, seed: string): boolean {
    if (!replayData || !Array.isArray(replayData.events)) return false;
    return true;
  }

  getTimeoutThreshold(): number {
    return 600; // 10 minutes maximum time limit
  }
}

export const RULE_ADAPTERS: Record<number, ArenaRuleAdapter> = {
  1: new SnakeRuleAdapter(),
  2: new RunnerRuleAdapter(),
  5: new SpaceImpactRuleAdapter(),
  6: new SudokuRuleAdapter()
};

export function getRuleAdapter(gameId: number): ArenaRuleAdapter {
  const adapter = RULE_ADAPTERS[gameId];
  if (!adapter) {
    throw new Error(`No rule adapter registered for game ID: ${gameId}`);
  }
  return adapter;
}
