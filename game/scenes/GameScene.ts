import Phaser, { Scene } from 'phaser';
import { Snake } from '../objects/Snake';
import { EventBus } from '../EventBus';
import { LevelManager, LevelConfig } from '../managers/LevelManager';
import { ObstacleManager } from '../managers/ObstacleManager';

export class GameScene extends Scene {
    snake!: Snake;
    food!: Phaser.GameObjects.Image;
    obstacleManager!: ObstacleManager;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd!: any;
    
    score = 0;
    startScore = 0;
    level = 1;
    targetScore = 100;
    
    combo = 1.0;
    maxCombo = 1.0;
    timeSinceLastFood = 0;
    comboTimerMax = 3000; // 3 seconds to keep combo
    hasEatenFirstFood = false;
    
    gameWidth = 800;
    gameHeight = 600;
    
    boundHandleMobileInput!: (dir: string) => void;
    boundHandleMatchCompleted!: (data: any) => void;
    levelConfig!: LevelConfig;
    isTransitioning = false;
    isMatchOver = false;
    startTime = 0;
    lastEmittedCombo = 1.0;

    constructor() {
        super('GameScene');
    }

    init(data: any) {
        this.level = data.level || 1;
        this.score = data.score || 0;
        this.startScore = this.score;
    }

    create() {
        this.isTransitioning = false;
        this.isMatchOver = false;
        this.startTime = Date.now();
        this.combo = 1.0;
        this.maxCombo = 1.0;
        this.timeSinceLastFood = 0;
        this.hasEatenFirstFood = false;
        
        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-started');
        
        this.levelConfig = LevelManager.getConfig(this.level);
        this.targetScore = this.score + this.levelConfig.targetScore;
        
        EventBus.emit('level-changed', this.level);
        EventBus.emit('score-changed', this.score);
        EventBus.emit('target-changed', this.targetScore);
        EventBus.emit('combo-changed', 1.0);
        
        this.cameras.main.setBackgroundColor(this.levelConfig.themeColor);
        this.add.rectangle(400, 300, 800, 600, 0x050510, 0.85);

        this.obstacleManager = new ObstacleManager(this);

        this.snake = new Snake(this, this.gameWidth / 2, this.gameHeight / 2);
        this.snake.baseSpeed = this.levelConfig.baseSpeed;
        
        this.obstacleManager.spawnObstacles(
            this.levelConfig.obstacleCount, 
            this.levelConfig.obstacleTypes, 
            this.gameWidth, 
            this.gameHeight, 
            this.snake.head.x, 
            this.snake.head.y
        );

        this.food = this.add.image(0, 0, 'food');
        this.repositionFood();

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = this.input.keyboard.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D
            });
        }

        this.boundHandleMobileInput = (dir: string) => {
            this.snake.setDirection(dir);
        };
        EventBus.on('mobile-input', this.boundHandleMobileInput);

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
            if (this.snake) {
                this.snake.baseSpeed = 0;
            }
            if (this.input.keyboard) {
                try {
                    this.input.keyboard.enabled = false;
                    console.log('[ARENA_PHASER] controls disabled');
                } catch {}
            }
        };
        EventBus.on('match-completed', this.boundHandleMatchCompleted);

        this.events.once('shutdown', () => {
            EventBus.removeListener('mobile-input', this.boundHandleMobileInput);
            EventBus.removeListener('match-completed', this.boundHandleMatchCompleted);
        });
    }

    update(time: number, delta: number) {
        if (this.isMatchOver) {
            return;
        }
        if (this.isTransitioning) return;

        if (this.cursors.left.isDown || this.wasd.left.isDown) this.snake.setDirection('left');
        else if (this.cursors.right.isDown || this.wasd.right.isDown) this.snake.setDirection('right');
        else if (this.cursors.up.isDown || this.wasd.up.isDown) this.snake.setDirection('up');
        else if (this.cursors.down.isDown || this.wasd.down.isDown) this.snake.setDirection('down');

        if (this.hasEatenFirstFood) {
            this.timeSinceLastFood += delta;
            
            // Continuous combo decay over time (e.g. lose 0.3 multiplier per second)
            if (this.combo > 1.0) {
                this.combo -= (delta / 1000) * 0.3;
                if (this.combo < 1.0) this.combo = 1.0;
                
                // Only emit to React if the first decimal place changes to prevent React re-render lag
                if (Math.abs(this.combo - this.lastEmittedCombo) >= 0.1 || this.combo === 1.0) {
                    this.lastEmittedCombo = this.combo;
                    EventBus.emit('combo-changed', this.combo);
                }
            }
        }

        this.snake.update(time, delta, this.combo);

        const distToFood = Phaser.Math.Distance.Between(this.snake.head.x, this.snake.head.y, this.food.x, this.food.y);
        if (distToFood < 12) {
            this.eatFood();
        }

        if (this.obstacleManager.checkCollision(this.snake.head.x, this.snake.head.y, 8)) {
            this.gameOver();
            return;
        }

        if (this.snake.checkCollision(this.gameWidth, this.gameHeight)) {
            this.gameOver();
        }
    }

    eatFood() {
        if (!this.hasEatenFirstFood) {
            this.hasEatenFirstFood = true;
            this.combo = 1.0;
        } else {
            // Faster eating = huge reward (up to +1.5), slow eating = tiny reward (+0.1 minimum)
            const addedCombo = Math.max(0.1, 1.5 - (this.timeSinceLastFood / 2000) * 1.4);
            this.combo += addedCombo;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        }
        
        this.timeSinceLastFood = 0;
        this.lastEmittedCombo = this.combo;
        EventBus.emit('combo-changed', this.combo);

        const earned = Math.floor(10 * this.combo);
        this.score += earned;
        EventBus.emit('score-changed', this.score);
        
        this.snake.grow();
        
        this.cameras.main.shake(100, 0.005 * this.combo);

        if (this.score >= this.targetScore && !this.registry.get('arenaMode')) {
            this.levelComplete();
        } else {
            this.repositionFood();
        }
    }



    levelComplete() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        const duration = Date.now() - this.startTime;
        const scoreEarned = this.score - this.startScore;
        EventBus.emit('save-run', { level: this.level, score: this.score, scoreEarned, combo: this.maxCombo, duration, completed: true });
        this.scene.start('LevelCompleteScene', { level: this.level, score: this.score, combo: this.maxCombo });
    }

    repositionFood() {
        let valid = false;
        let rx = 0;
        let ry = 0;
        while (!valid) {
            rx = Phaser.Math.Between(30, this.gameWidth - 30);
            ry = Phaser.Math.Between(30, this.gameHeight - 30);
            
            if (Phaser.Math.Distance.Between(rx, ry, this.snake.head.x, this.snake.head.y) > 100) {
                if (!this.obstacleManager.checkCollision(rx, ry, 12)) {
                    valid = true;
                }
            }
        }
        this.food.setPosition(rx, ry);
    }

    gameOver() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        const duration = Date.now() - this.startTime;
        const scoreEarned = this.score - this.startScore;
        EventBus.emit('save-run', { level: this.level, score: this.score, scoreEarned, combo: this.maxCombo, duration, completed: false });
        this.cameras.main.shake(300, 0.02);

        if (this.registry.get('arenaMode')) {
            // Under Arena Mode, we freeze and DO NOT start GameOverScene!
            // We just let the main page handle score saving and routing to result screen.
            return;
        }

        this.time.delayedCall(300, () => {
            this.scene.start('GameOverScene', { score: this.score, level: this.level });
        });
    }
}
