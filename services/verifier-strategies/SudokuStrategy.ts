import { GameVerifierStrategy } from './types';
import { sendSecurityAlert } from '@/lib/arena/alerts';

// ============================================================
// 1. DETERMINISTIC SEEDED RANDOM GENERATOR (LCG)
// ============================================================
class SeededRandom {
  private seed: number;
  constructor(seedStr: string) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    this.seed = h >>> 0;
  }
  next(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return (this.seed & 0xFFFFFFF) / 0x10000000;
  }
  between(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

// ============================================================
// 2. DETERMINISTIC SUDOKU MATRIX PUZZLE GENERATOR
// ============================================================
export class SudokuGenerator {
  private rng: SeededRandom;

  constructor(seed: string) {
    this.rng = new SeededRandom(seed);
  }

  generate(level: number): { solution: number[][]; puzzle: number[][] } {
    const board: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    
    // Fill the grid using deterministic backtracking
    this.fill(board);

    // Deep copy to save solution
    const solution = board.map(row => [...row]);

    // Neon Rookie (Level 1) -> 45 clues
    // Cyber Adept (Level 2) -> 35 clues
    // Overlord Matrix (Level 3+) -> 25 clues
    let cluesToKeep = 45;
    if (level === 2) cluesToKeep = 35;
    if (level >= 3) cluesToKeep = 25;

    const puzzle = board.map(row => [...row]);
    const totalToRemove = 81 - cluesToKeep;

    // Generate list of all 81 coordinates
    const coords: { r: number; c: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        coords.push({ r, c });
      }
    }

    // Shuffle coords list using deterministic RNG
    for (let i = coords.length - 1; i > 0; i--) {
      const j = this.rng.between(0, i);
      const temp = coords[i];
      coords[i] = coords[j];
      coords[j] = temp;
    }

    // Mask cells
    for (let i = 0; i < totalToRemove; i++) {
      const { r, c } = coords[i];
      puzzle[r][c] = 0;
    }

    return { solution, puzzle };
  }

  private fill(board: number[][]): boolean {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === 0) {
          const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
          // Shuffling list of numbers deterministically
          for (let i = numbers.length - 1; i > 0; i--) {
            const j = this.rng.between(0, i);
            const temp = numbers[i];
            numbers[i] = numbers[j];
            numbers[j] = temp;
          }

          for (const num of numbers) {
            if (this.isValid(board, row, col, num)) {
              board[row][col] = num;
              if (this.fill(board)) return true;
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  private isValid(board: number[][], row: number, col: number, num: number): boolean {
    for (let x = 0; x < 9; x++) {
      if (board[row][x] === num) return false;
      if (board[x][col] === num) return false;
      
      const boxRow = 3 * Math.floor(row / 3) + Math.floor(x / 3);
      const boxCol = 3 * Math.floor(col / 3) + (x % 3);
      if (board[boxRow][boxCol] === num) return false;
    }
    return true;
  }
}

// ============================================================
// 3. SUDOKU MATRIX TELEMETRY VERIFIER STRATEGY
// ============================================================
export class SudokuStrategy implements GameVerifierStrategy {
  getMaxPossibleScore(durationMs: number): number {
    // Standard solves take at least 15-30s. Allow maximum rate of 150 points per second ceiling.
    return (durationMs / 1000) * 150;
  }

  verifyReplayEvents(
    events: any[],
    matchId: string,
    userId: string
  ): { isValid: boolean; reason?: string } {
    if (!Array.isArray(events)) return { isValid: true };

    // Heuristic 1: Flood/Spam Check
    // Standard Sudoku matrix round will not exceed 350 inputs, select, and checkpoint packets
    if (events.length > 500) {
      console.warn(`[Arena][Verifier][Sudoku][Violation] Replay packet flood: ${events.length} events.`);
      sendSecurityAlert({
        matchId,
        userId,
        category: 'REPLAY_TAMPERING',
        severity: 'CRITICAL',
        details: `Sudoku telemetry event flood rejected. Packet count ${events.length} exceeds max capacity bounds.`
      });
      return { isValid: false, reason: 'INPUT_FLOOD_DETECTED' };
    }

    // Find the 'init' event containing starting seeds and level configuration
    const initEvent = events.find(ev => ev.e === 'init');
    if (!initEvent || !initEvent.seed) {
      console.warn(`[Arena][Verifier][Sudoku] Missing puzzle initialization parameters in event stream.`);
      return { isValid: false, reason: 'MISSING_INIT_PARAMETERS' };
    }

    const { seed, level } = initEvent;
    
    // Generate solution deterministically
    const generator = new SudokuGenerator(seed);
    const { solution, puzzle } = generator.generate(level || 1);

    // Initialise active verification grid
    const grid: number[][] = puzzle.map(row => [...row]);
    
    let strikes = 0;
    let combo = 1.0;
    let lastValidTime = -1;
    let consecutiveImpossiblyFastInputs = 0;

    // Move-by-move telemetry sequence verification
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];

      // Skip the init event
      if (ev.e === 'init') continue;

      // Checkpoint audits
      if (ev.e === 'checkpoint') {
        const expectedHash = grid.flat().join('');
        if (ev.boardHash !== expectedHash) {
          console.warn(`[Arena][Verifier][Sudoku][Checkpoint] Board state diverged. Got: ${ev.boardHash} | Expected: ${expectedHash}`);
          sendSecurityAlert({
            matchId,
            userId,
            category: 'CHECKSUM_DIVERGENCE',
            severity: 'CRITICAL',
            details: `Sudoku checkpoint divergence. Board state did not match expected solution hash at sequence index ${i}.`
          });
          return { isValid: false, reason: 'CHECKPOINT_STATE_DIVERGENCE' };
        }

        // Audit active cells count
        let activeCount = 0;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (grid[r][c] !== 0) activeCount++;
          }
        }
        if (ev.filledCellsCount !== activeCount) {
          console.warn(`[Arena][Verifier][Sudoku][Checkpoint] Active cells count divergence. Got: ${ev.filledCellsCount} | Expected: ${activeCount}`);
          return { isValid: false, reason: 'CHECKPOINT_COUNT_DIVERGENCE' };
        }

        if (ev.strikes !== strikes || Math.abs(ev.comboMultiplier - combo) > 0.01) {
          console.warn(`[Arena][Verifier][Sudoku][Checkpoint] Parameter divergence: strikes (${ev.strikes} vs ${strikes}) or combo (${ev.comboMultiplier} vs ${combo})`);
          return { isValid: false, reason: 'CHECKPOINT_PARAMS_DIVERGENCE' };
        }
        continue;
      }

      // Input Audits
      if (ev.e === 'input_digit' || ev.e === 'invalid_attempt') {
        const { r, c, v } = ev;

        // Legal grid boundary check
        if (r < 0 || r >= 9 || c < 0 || c >= 9 || v < 1 || v > 9) {
          console.warn(`[Arena][Verifier][Sudoku] Out-of-bounds cell/digit index: Cell (${r}, ${c}) = ${v}`);
          return { isValid: false, reason: 'GRID_BOUNDS_VIOLATION' };
        }

        // Clue Tampering Check: Ensure player did not overwrite a locked starting puzzle clue cell
        if (puzzle[r][c] !== 0) {
          console.warn(`[Arena][Verifier][Sudoku][Violation] Tampered starting clue cell position: Cell (${r}, ${c})`);
          sendSecurityAlert({
            matchId,
            userId,
            category: 'REPLAY_TAMPERING',
            severity: 'CRITICAL',
            details: `Tampered starter grid cell. Player tried to overwrite initial Sudoku clue cell at (${r}, ${c}).`
          });
          return { isValid: false, reason: 'CLUE_TAMPERING_DETECTED' };
        }

        // Rapid submission solve speed auditor: Check time delta between successive valid moves
        if (ev.e === 'input_digit') {
          if (lastValidTime !== -1) {
            const dt = ev.t - lastValidTime;
            // Solve input speed ceiling: entering correct grid digits under 180ms is mathematically impossible for humans
            if (dt < 180) {
              consecutiveImpossiblyFastInputs++;
              if (consecutiveImpossiblyFastInputs >= 3) {
                console.warn(`[Arena][Verifier][Sudoku][Violation] Solved puzzle impossibly fast. Consecutive interval < 180ms.`);
                sendSecurityAlert({
                  matchId,
                  userId,
                  category: 'DRIFT_VIOLATION',
                  severity: 'HARD',
                  details: `Sudoku solve rate drift: solved multiple grid cells under 180ms.`
                });
                return { isValid: false, reason: 'IMPOSSIBLE_SOLVE_SPEED' };
              }
            } else {
              consecutiveImpossiblyFastInputs = 0;
            }
          }
          lastValidTime = ev.t;
        }

        // Replay Event Consistency check
        const targetCorrectDigit = solution[r][c];
        if (v === targetCorrectDigit) {
          if (ev.e !== 'input_digit') {
            console.warn(`[Arena][Verifier][Sudoku] Correct input reported as invalid attempt event at (${r}, ${c})`);
            return { isValid: false, reason: 'EVENT_MISMATCH_CORRECT_INPUT' };
          }
          grid[r][c] = v;
          combo += 0.5;
        } else {
          if (ev.e !== 'invalid_attempt') {
            console.warn(`[Arena][Verifier][Sudoku][Violation] Correct/Incorrect mismatch: Input ${v} at (${r}, ${c}) should have been invalid (Expected: ${targetCorrectDigit})`);
            sendSecurityAlert({
              matchId,
              userId,
              category: 'REPLAY_TAMPERING',
              severity: 'HARD',
              details: `Ignored strike bypass. Correct/Incorrect mismatch: input ${v} at (${r}, ${c}) should have been invalid.`
            });
            return { isValid: false, reason: 'STRIKE_BYPASS_ATTEMPT' };
          }
          strikes++;
          combo = 1.0;

          // Strike Cap verification
          if (strikes > 3) {
            console.warn(`[Arena][Verifier][Sudoku] Maximum strike limit (3) exceeded inside telemetry stream.`);
            return { isValid: false, reason: 'STRIKES_EXCEEDED' };
          }
        }
      }

      // Erase Audits
      if (ev.e === 'erase_digit') {
        const { r, c } = ev;
        if (r < 0 || r >= 9 || c < 0 || c >= 9) return { isValid: false, reason: 'GRID_BOUNDS_VIOLATION' };
        if (puzzle[r][c] !== 0) return { isValid: false, reason: 'CLUE_TAMPERING_DETECTED' };
        
        grid[r][c] = 0;
      }
    }

    // Validate Final Board State if victory is claimed
    const isCompleted = events.some(ev => ev.e === 'complete_board');
    if (isCompleted) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] !== solution[r][c]) {
            console.warn(`[Arena][Verifier][Sudoku][Violation] Board incomplete or divergence on completion. Cell (${r}, ${c})`);
            sendSecurityAlert({
              matchId,
              userId,
              category: 'REPLAY_TAMPERING',
              severity: 'CRITICAL',
              details: `Claimed fake victory. Sudoku board was not solved correctly, diverging from solution at (${r}, ${c}).`
            });
            return { isValid: false, reason: 'FAKE_SOLVE_SUBMISSION' };
          }
        }
      }
    }

    return { isValid: true };
  }
}
