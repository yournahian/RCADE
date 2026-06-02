import Phaser, { Scene } from 'phaser';
import { EventBus } from '../../EventBus';
import { SudokuGenerator } from '../../../services/verifier-strategies/SudokuStrategy';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: number;
}

export class SudokuScene extends Scene {
  private level: number = 1;
  private seed: string = 'rcade-seed-default';
  
  // Game state
  private puzzle!: number[][];
  private solution!: number[][];
  private grid!: number[][];
  
  private selectedCell = { r: 0, c: 0 };
  private score: number = 0;
  private combo: number = 1.0;
  private maxCombo: number = 1.0;
  private shields: number = 3;
  private strikes: number = 0;
  
  private startTime: number = 0;
  private isTransitioning: boolean = false;
  private isMatchOver: boolean = false;
  private boundHandleMatchCompleted!: (data: any) => void;

  // Render variables
  private gridStartX = 175;
  private gridStartY = 55;
  private gridSize = 450;
  private cellSize = 50;
  
  // Telemetry event log
  private telemetryEvents: any[] = [];
  
  // Custom lightweight particles
  private particles: Particle[] = [];
  
  // Graphics draw canvas
  private gridGraphics!: Phaser.GameObjects.Graphics;
  
  // Rendered texts array for the cells
  private cellTexts: Phaser.GameObjects.Text[][] = [];

  // Input buffering deduplication helper
  private lastActionTime: number = 0;
  private lastInputEvent: { r: number; c: number; v: number; e: string } | null = null;
  private lastInputTimestamp: number = 0;

  // Checkpoint counting helper
  private correctInputCount: number = 0;

  constructor() {
    super('SudokuScene');
  }

  init(data: { level?: number }) {
    this.level = data.level || this.registry.get('startLevel') || 1;
    this.seed = this.registry.get('sessionSeed') || `sudoku-matrix-seed-${Date.now()}`;
    
    this.score = 0;
    this.combo = 1.0;
    this.maxCombo = 1.0;
    this.shields = 3;
    this.strikes = 0;
    this.isTransitioning = false;
    this.isMatchOver = false;
    this.telemetryEvents = [];
    this.particles = [];
    this.correctInputCount = 0;
    this.lastActionTime = 0;
    this.lastInputEvent = null;
    this.lastInputTimestamp = 0;
  }

  create() {
    this.startTime = Date.now();

    // 1. Telemetry Stream Initialization Event
    this.telemetryEvents.push({
      e: 'init',
      seed: this.seed,
      level: this.level,
      t: 0
    });

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Dark cyberpunk matrix backing
    this.add.rectangle(0, 0, width, height, 0x05050f).setOrigin(0);

    // Dynamic Board Generation using Seeded LCG Backtracker
    const generator = new SudokuGenerator(this.seed);
    const { solution, puzzle } = generator.generate(this.level);
    this.solution = solution;
    this.puzzle = puzzle;
    this.grid = puzzle.map(row => [...row]);

    console.log(`[SudokuScene] Seed: "${this.seed}" | Level: ${this.level}`);
    console.log("[SudokuScene] Solution Grid:\n" + solution.map(row => row.join(" ")).join("\n"));
    console.log("[SudokuScene] Puzzle Grid:\n" + puzzle.map(row => row.join(" ")).join("\n"));

    // 2. Initialize Canvas Graphics rendering node
    this.gridGraphics = this.add.graphics();

    // Create 9x9 Text grid elements for high-performance visual display
    this.cellTexts = [];
    for (let r = 0; r < 9; r++) {
      this.cellTexts[r] = [];
      for (let c = 0; c < 9; c++) {
        const cx = this.gridStartX + c * this.cellSize + this.cellSize / 2;
        const cy = this.gridStartY + r * this.cellSize + this.cellSize / 2;
        
        const initialVal = this.grid[r][c];
        const isClue = this.puzzle[r][c] !== 0;

        const txt = this.add.text(cx, cy, initialVal === 0 ? '' : initialVal.toString(), {
          fontFamily: 'monospace',
          fontSize: '22px',
          fontWeight: isClue ? '900' : 'normal',
          color: isClue ? '#10b981' : '#fbbf24' // Green clues, Amber user input
        }).setOrigin(0.5);

        this.cellTexts[r][c] = txt;
      }
    }

    // 3. Coordinate click cell selector
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isMatchOver || this.isTransitioning) return;
      const rx = pointer.x - this.gridStartX;
      const ry = pointer.y - this.gridStartY;
      
      if (rx >= 0 && rx < this.gridSize && ry >= 0 && ry < this.gridSize) {
        const col = Math.floor(rx / this.cellSize);
        const row = Math.floor(ry / this.cellSize);
        
        this.selectCell(row, col);
      }
    });

    // 4. Keyboard Listener Mappings
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.isMatchOver || this.isTransitioning) return;

      const key = event.key;
      
      // Select cell cursor movement
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        this.selectCell((this.selectedCell.r - 1 + 9) % 9, this.selectedCell.c);
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        this.selectCell((this.selectedCell.r + 1) % 9, this.selectedCell.c);
      } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.selectCell(this.selectedCell.r, (this.selectedCell.c - 1 + 9) % 9);
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.selectCell(this.selectedCell.r, (this.selectedCell.c + 1) % 9);
      }
      
      // Numeric Digit Placement
      else if (key >= '1' && key <= '9') {
        this.placeDigit(parseInt(key, 10));
      }
      
      // Cell Erase/Clear
      else if (key === 'Backspace' || key === 'Delete' || key === '0') {
        this.eraseDigit();
      }
    });

    // 5. Mobile event receiver
    EventBus.on('mobile-input', this.handleMobileInput, this);

    this.boundHandleMatchCompleted = (data: any) => {
      console.log('[ARENA_PHASER] match-completed received', data);
      console.log('[ARENA_PHASER] freeze handler triggered');
      this.isMatchOver = true;
      this.isTransitioning = true;
      if (this.physics) {
        try {
          this.physics.pause();
          console.log('[ARENA_PHASER] physics paused');
        } catch {}
      }
      try {
        this.scene.pause();
      } catch {}
      if (this.input.keyboard) {
        try {
          this.input.keyboard.enabled = false;
          console.log('[ARENA_PHASER] controls disabled');
        } catch {}
      }
    };
    EventBus.on('match-completed', this.boundHandleMatchCompleted);

    this.events.once('shutdown', () => {
      EventBus.removeListener('mobile-input', this.handleMobileInput, this);
      EventBus.removeListener('match-completed', this.boundHandleMatchCompleted);
    });

    // Send initial EventBus states to sync React UI
    EventBus.emit('current-scene-ready', this);
    EventBus.emit('game-started');
    EventBus.emit('level-changed', this.level);
    EventBus.emit('score-changed', this.score);
    EventBus.emit('combo-changed', this.combo);
    EventBus.emit('shields-changed', this.shields);
    EventBus.emit('target-changed', this.level === 1 ? 1000 : this.level === 2 ? 2000 : 3500);
  }

  private handleMobileInput(action: string) {
    if (this.isMatchOver || this.isTransitioning) return;

    if (action.startsWith('input-')) {
      const digit = parseInt(action.split('-')[1], 10);
      if (digit >= 1 && digit <= 9) this.placeDigit(digit);
    } else if (action === 'erase') {
      this.eraseDigit();
    }
  }

  // Get rounded normalized 10ms bucket timestamp
  private getNormalizedTime(): number {
    return Math.round((Date.now() - this.startTime) / 10) * 10;
  }

  private selectCell(r: number, c: number) {
    this.selectedCell = { r, c };
    
    // Add select cell telemetry event
    this.telemetryEvents.push({
      e: 'S',
      r,
      c,
      t: this.getNormalizedTime()
    });
  }

  private placeDigit(v: number) {
    const { r, c } = this.selectedCell;
    
    // Lock initial puzzle starting clues
    if (this.puzzle[r][c] !== 0) return;

    const t = this.getNormalizedTime();

    // 1. Input Buffering & Replay Protections
    // Ignore rapid duplicate inputs under 50ms interval (protects payload inflation)
    if (t - this.lastActionTime < 50) {
      console.warn(`[Arcade][Sudoku] Discarded rapid spam event input.`);
      return;
    }
    
    // Reject identical duplicate inputs within 150ms
    if (
      this.lastInputEvent &&
      this.lastInputEvent.r === r &&
      this.lastInputEvent.c === c &&
      this.lastInputEvent.v === v &&
      this.lastInputEvent.e === 'input_digit' &&
      t - this.lastInputTimestamp < 150
    ) {
      console.warn(`[Arcade][Sudoku] Discarded duplicate input placement.`);
      return;
    }

    // Heuristic Event Flood Protection: limit total events within session boundaries
    if (this.telemetryEvents.length > 450) {
      console.error(`[Arcade][Sudoku] Telemetry size limits reached. Triggering flood security fail.`);
      this.gameOver();
      return;
    }

    this.lastActionTime = t;
    this.lastInputTimestamp = t;
    this.lastInputEvent = { r, c, v, e: 'input_digit' };

    const targetVal = this.solution[r][c];

    // Loose comparison with Number conversion to avoid any string/number type mismatches at runtime
    if (Number(v) === Number(targetVal)) {
      // SUCCESSFUL DIGIT ENTRY
      this.grid[r][c] = v;
      this.cellTexts[r][c].setText(v.toString());
      this.cellTexts[r][c].setColor('#22d3ee'); // Native highly stable color text api
      
      this.combo += 0.5;
      const earned = Math.floor(10 * this.combo);
      this.score += earned;

      // Spawn retro particle juice
      const cx = this.gridStartX + c * this.cellSize + this.cellSize / 2;
      const cy = this.gridStartY + r * this.cellSize + this.cellSize / 2;
      this.spawnExplosion(cx, cy, 0x22d3ee);

      // Trigger correct digit event
      this.telemetryEvents.push({ e: 'I', r, c, v, t });

      // Checkpoint Generation
      this.correctInputCount++;
      if (this.correctInputCount % 5 === 0) {
        this.telemetryEvents.push({
          e: 'checkpoint',
          boardHash: this.grid.flat().join(''),
          filledCellsCount: this.getFilledCellsCount(),
          strikes: this.strikes,
          comboMultiplier: this.combo,
          elapsedTime: Date.now() - this.startTime,
          t
        });
      }

      EventBus.emit('score-changed', this.score);
      EventBus.emit('combo-changed', this.combo);

      // Check Row/Col/Box sectors completeness to trigger sector alerts
      this.checkSectorCompletions(r, c);

      // Check Victory Condition
      if (this.isBoardComplete()) {
        this.telemetryEvents.push({ e: 'V', t });
        this.levelComplete();
      }
    } else {
      // INCORRECT DIGIT ENTRY - STRIKE ALARM
      this.strikes++;
      this.combo = 1.0;
      this.shields = Math.max(0, this.shields - 1);
      
      const cx = this.gridStartX + c * this.cellSize + this.cellSize / 2;
      const cy = this.gridStartY + r * this.cellSize + this.cellSize / 2;
      this.spawnExplosion(cx, cy, 0xef4444); // Red explosion
      this.cameras.main.shake(150, 0.01);

      // Trigger invalid attempt event
      this.telemetryEvents.push({ e: 'X', r, c, v, t });

      EventBus.emit('combo-changed', this.combo);
      EventBus.emit('shields-changed', this.shields);

      if (this.shields <= 0) {
        this.gameOver();
      }
    }
  }

  private eraseDigit() {
    const { r, c } = this.selectedCell;
    if (this.puzzle[r][c] !== 0) return;

    const t = this.getNormalizedTime();

    if (this.grid[r][c] !== 0) {
      this.grid[r][c] = 0;
      this.cellTexts[r][c].setText('');
      this.telemetryEvents.push({ e: 'E', r, c, t });
    }
  }

  private checkSectorCompletions(r: number, c: number) {
    const t = this.getNormalizedTime();
    
    // Check row
    let rowComplete = true;
    for (let x = 0; x < 9; x++) {
      if (this.grid[r][x] !== this.solution[r][x]) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) {
      this.telemetryEvents.push({ e: 'B', idx: `row-${r}`, t });
    }

    // Check col
    let colComplete = true;
    for (let x = 0; x < 9; x++) {
      if (this.grid[x][c] !== this.solution[x][c]) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) {
      this.telemetryEvents.push({ e: 'B', idx: `col-${c}`, t });
    }
  }

  private getFilledCellsCount(): number {
    let count = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0) count++;
      }
    }
    return count;
  }

  private isBoardComplete(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== this.solution[r][c]) return false;
      }
    }
    return true;
  }

  private spawnExplosion(x: number, y: number, color: number) {
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        size: 3 + Math.random() * 5,
        color
      });
    }
  }

  private isBoardSolvedIncorrectly(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0 && this.grid[r][c] !== this.solution[r][c]) {
          return true;
        }
      }
    }
    return false;
  }

  update() {
    if (this.isMatchOver) {
      return;
    }
    // 1. Draw Native Canvas Board
    this.drawGrid();

    // 2. Custom particles calculations and update loop
    this.gridGraphics.lineStyle(1, 0xffffff, 1);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.03;
      p.size = Math.max(0.1, p.size - 0.08);

      if (p.alpha <= 0 || p.size <= 0.1) {
        this.particles.splice(i, 1);
        continue;
      }

      this.gridGraphics.fillStyle(p.color, p.alpha);
      this.gridGraphics.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  private drawGrid() {
    this.gridGraphics.clear();

    // Highlights for selected rows/cols/boxes to achieve premium guide assists
    const { r: selR, c: selC } = this.selectedCell;

    // Translucent light guides
    this.gridGraphics.fillStyle(0xfbbf24, 0.02); // 2% opacity amber glow
    // Row guide
    this.gridGraphics.fillRect(this.gridStartX, this.gridStartY + selR * this.cellSize, this.gridSize, this.cellSize);
    // Column guide
    this.gridGraphics.fillRect(this.gridStartX + selC * this.cellSize, this.gridStartY, this.cellSize, this.gridSize);
    
    // Box guide
    const boxRow = Math.floor(selR / 3) * 3;
    const boxCol = Math.floor(selC / 3) * 3;
    this.gridGraphics.fillRect(
      this.gridStartX + boxCol * this.cellSize,
      this.gridStartY + boxRow * this.cellSize,
      this.cellSize * 3,
      this.cellSize * 3
    );

    // Draw individual cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cx = this.gridStartX + c * this.cellSize;
        const cy = this.gridStartY + r * this.cellSize;

        const isSelected = r === selR && c === selC;
        const isClashing = this.grid[r][c] !== 0 && this.grid[r][c] !== this.solution[r][c];

        // Draw individual grid borders
        this.gridGraphics.lineStyle(1, 0x141424, 0.5);
        this.gridGraphics.strokeRect(cx, cy, this.cellSize, this.cellSize);

        if (isSelected) {
          // Glow select frames
          const borderAlpha = 0.5 + Math.sin(this.time.now / 150) * 0.35;
          this.gridGraphics.fillStyle(0xfbbf24, 0.08);
          this.gridGraphics.fillRect(cx, cy, this.cellSize, this.cellSize);
          
          this.gridGraphics.lineStyle(3, 0xfbbf24, borderAlpha);
          this.gridGraphics.strokeRect(cx + 1.5, cy + 1.5, this.cellSize - 3, this.cellSize - 3);
        } else if (isClashing) {
          // Highlight conflicts in red
          this.gridGraphics.fillStyle(0xef4444, 0.15);
          this.gridGraphics.fillRect(cx, cy, this.cellSize, this.cellSize);
        }
      }
    }

    // Draw 3x3 outer box layout borders
    for (let b = 0; b <= 3; b++) {
      const lineWeight = b === 0 || b === 3 ? 4 : 2;
      const lineColor = b === 0 || b === 3 ? 0xfbbf24 : 0x78350f; // Outer bright amber, inner darker brown/amber

      // Vertical separators
      this.gridGraphics.lineStyle(lineWeight, lineColor, 0.85);
      this.gridGraphics.lineBetween(
        this.gridStartX + b * 3 * this.cellSize,
        this.gridStartY,
        this.gridStartX + b * 3 * this.cellSize,
        this.gridStartY + this.gridSize
      );

      // Horizontal separators
      this.gridGraphics.lineStyle(lineWeight, lineColor, 0.85);
      this.gridGraphics.lineBetween(
        this.gridStartX,
        this.gridStartY + b * 3 * this.cellSize,
        this.gridStartX + this.gridSize,
        this.gridStartY + b * 3 * this.cellSize
      );
    }
  }

  private levelComplete() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const duration = Date.now() - this.startTime;
    
    // Save-run payload containing compressed events
    EventBus.emit('save-run', {
      level: this.level,
      score: this.score,
      scoreEarned: this.score,
      combo: this.maxCombo,
      duration,
      completed: true,
      replayData: {
        events: this.telemetryEvents
      }
    });

    if (this.registry.get('arenaMode')) {
      // Under Arena Mode, we freeze and DO NOT start SudokuLevelCompleteScene!
      return;
    }

    this.scene.start('SudokuLevelCompleteScene', {
      level: this.level,
      score: this.score,
      combo: this.combo
    });
  }

  private gameOver() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const duration = Date.now() - this.startTime;

    EventBus.emit('save-run', {
      level: this.level,
      score: this.score,
      scoreEarned: this.score,
      combo: this.maxCombo,
      duration,
      completed: false,
      replayData: {
        events: this.telemetryEvents
      }
    });

    if (this.registry.get('arenaMode')) {
      // Under Arena Mode, we freeze and DO NOT start SudokuGameOverScene!
      return;
    }

    this.time.delayedCall(400, () => {
      this.scene.start('SudokuGameOverScene', {
        score: this.score,
        level: this.level
      });
    });
  }
}
