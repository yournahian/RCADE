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
