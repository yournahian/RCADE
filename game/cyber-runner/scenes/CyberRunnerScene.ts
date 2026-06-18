import Phaser, { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

// ============================================================
// 1. SOUND MANAGER (SAFE AUDIO FLOW)
// ============================================================
class SoundManager {
    static playSFX(path: string) {
        try {
            const audio = new Audio(path);
            audio.volume = 0.35;
            audio.play().catch(e => {
                console.warn('[SoundManager] Audio autoplay restricted:', e.message);
            });
        } catch (err) {
            console.warn('[SoundManager] HTML5 Audio failed:', err);
        }
    }
}

// ============================================================
// 2. RANDOM GENERATOR FOR PROCEDURAL DETAILED PLACEMENTS
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
// 3. LEVEL ABILITIES DESCRIPTIONS
// ============================================================
const LEVEL_ABILITIES: Record<number, string[]> = {
    1: ["Run", "Jump", "Melee Attack"],
    2: ["Run", "Jump", "Melee Attack", "Wall Jump"],
    3: ["Run", "Jump", "Melee Attack", "Wall Jump"],
    4: ["Run", "Jump", "Melee Attack", "Wall Jump", "Slide"],
    5: ["Run", "Jump", "Melee Attack", "Wall Jump", "Slide", "Dash"],
    6: ["Run", "Jump", "Melee Attack", "Wall Jump", "Slide", "Dash", "Hacking"],
    7: ["Run", "Jump", "Melee Attack", "Wall Jump", "Slide", "Dash", "Hacking", "Moving Platforms"],
    8: ["Run", "Jump", "Melee Attack", "Wall Jump", "Slide", "Dash", "Hacking", "Moving Platforms", "Double Jump"],
    9: ["Run", "Jump", "Melee Attack", "Wall Jump", "Slide", "Dash", "Hacking", "Moving Platforms", "Double Jump", "Advanced Combat"],
    10: ["ALL MECHANICS UNLOCKED!"]
};

// ============================================================
// 4. MAIN GAMEPLAY SCENE
// ============================================================
export class CyberRunnerScene extends Scene {
    // Entities
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: any;
    wasd!: any;
    
    // Physics Groups
    platforms!: Phaser.Physics.Arcade.StaticGroup;
    movingPlatforms!: Phaser.Physics.Arcade.Group;
    hazards!: Phaser.Physics.Arcade.StaticGroup;
    terminals!: Phaser.Physics.Arcade.StaticGroup;
    credits!: Phaser.Physics.Arcade.Group;
    enemies!: Phaser.Physics.Arcade.Group;
    bullets!: Phaser.Physics.Arcade.Group;
    enemyBullets!: Phaser.Physics.Arcade.Group;
    checkpoints!: Phaser.Physics.Arcade.StaticGroup;
    portal!: Phaser.Physics.Arcade.StaticGroup;
    bossGroup!: Phaser.Physics.Arcade.Group;

    // UI & Text overlays
    abilityHUD!: Phaser.GameObjects.Text;
    
    // Game State variables
    level = 1;
    score = 0;
    startScore = 0;
    targetScore = 1500;
    health = 100;
    lives = 3;
    creditsCollected = 0;
    isTransitioning = false;
    isMatchOver = false;
    startTime = 0;
    
    // Checkpoints
    checkpointX = 100;
    checkpointY = 450;

    // Combo multiplier system
    combo = 1.0;
    maxCombo = 1.0;
    timeSinceLastAction = 0;
    hasKilledEnemy = false;
    lastEmittedCombo = 1.0;

    // Ability unlocks (flags)
    canWallJump = false;
    canMelee = false;
    canSlide = false;
    canDash = false;
    canHack = false;
    canDoubleJump = false;
    canAdvancedCombat = false;

    // Player controls cooldown
    lastAttackTime = 0;
    lastDashTime = 0;
    isDashing = false;
    dashTimer = 0;
    dashDir = 1;
    isSliding = false;
    slideTimer = 0;
    
    // Jumps count for double jump
    jumpsCount = 0;
    wallJumpTimer = 0;
    lastHitTime = 0;
    
    // Boss Status
    isBossSpawned = false;
    bossDefeated = false;
    boss: Phaser.Physics.Arcade.Sprite | null = null;
    bossText: Phaser.GameObjects.Text | null = null;
    bossHp = 100;
    bossMaxHp = 100;
    bossPhase = 1;
    bossLastActionTime = 0;
    bossLaserActive = false;
    bossBarrier!: Phaser.Physics.Arcade.Sprite;

    // Graphics Overlay for HUD/Trails
    gameGraphics!: Phaser.GameObjects.Graphics;
    
    // Parallax background layers
    bgLayer1!: Phaser.GameObjects.Graphics;
    bgLayer2!: Phaser.GameObjects.Graphics;

    // FX Trails
    dashTrail: Array<{ x: number, y: number, alpha: number }> = [];
    sparks: Array<{ x: number, y: number, vx: number, vy: number, alpha: number, color: number }> = [];

    // Screen Shake
    shakeIntensity = 0;
    playerFlashFrames = 0;
    bossFlashFrames = 0;

    // LCG RNG
    rng!: SeededRandom;

    // Mobile buttons mapping cache
    mobileKeys = {
        left: false,
        right: false,
        down: false
    };

    boundHandleMobileInput!: (action: string) => void;
    boundHandleMatchCompleted!: (data: any) => void;

    constructor() {
        super('CyberRunnerScene');
    }

    init(data: any) {
        this.level = data.level || 1;
        this.score = data.score || 0;
        this.startScore = this.score;
        this.health = 100;
        this.lives = 3;
        this.creditsCollected = 0;
        
        this.checkpointX = 100;
        this.checkpointY = 450;
        this.jumpsCount = 0;
        this.wallJumpTimer = 0;
        this.lastHitTime = 0;

        this.isBossSpawned = false;
        this.bossDefeated = false;
        this.boss = null;
        this.bossText = null;
        this.bossHp = 100;
        this.bossMaxHp = 100;
        this.bossPhase = 1;
        this.bossLaserActive = false;

        this.dashTrail = [];
        this.sparks = [];
        this.shakeIntensity = 0;
        this.playerFlashFrames = 0;
        this.bossFlashFrames = 0;
        this.isDashing = false;
        this.isSliding = false;

        // Mechanics unlock based on level
        this.canWallJump = this.level >= 2;
        this.canMelee = true; // Combat is unlocked from Level 1 so bosses can be defeated
        this.canSlide = this.level >= 4;
        this.canDash = this.level >= 5;
        this.canHack = this.level >= 6;
        this.canDoubleJump = this.level >= 8;
        this.canAdvancedCombat = this.level >= 9;
    }

    create() {
        this.isTransitioning = false;
        this.isMatchOver = false;
        this.startTime = Date.now();
        this.combo = 1.0;
        this.maxCombo = 1.0;
        this.timeSinceLastAction = 0;
        this.hasKilledEnemy = false;
        this.lastEmittedCombo = 1.0;

        const sessionSeed = this.registry.get('sessionSeed') || Math.random().toString();
        this.rng = new SeededRandom(sessionSeed);

        // Level length setup
        const levelWidth = 3200;
        this.physics.world.setBounds(0, 0, levelWidth, 600);

        // Define target score for the HUD
        this.targetScore = this.score + 500 + this.level * 200;

        if (this.registry.get('arenaMode')) {
            this.lives = 1;
        }

        // Emit initial stats
        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-started');
        EventBus.emit('level-changed', this.level);
        EventBus.emit('score-changed', this.score);
        EventBus.emit('target-changed', this.targetScore);
        EventBus.emit('combo-changed', 1.0);
        EventBus.emit('shields-changed', this.health);
        EventBus.emit('lives-changed', this.lives);

        // Setup gorgeous scrolling parallax background
        this.cameras.main.setBackgroundColor('#03020c');
        this.createParallaxBackground(levelWidth);

        // Graphics pipeline
        this.gameGraphics = this.add.graphics();

        // Create Physics groups
        this.platforms = this.physics.add.staticGroup();
        this.movingPlatforms = this.physics.add.group();
        this.hazards = this.physics.add.staticGroup();
        this.terminals = this.physics.add.staticGroup();
        this.credits = this.physics.add.group();
        this.enemies = this.physics.add.group();
        this.bullets = this.physics.add.group();
        this.enemyBullets = this.physics.add.group();
        this.checkpoints = this.physics.add.staticGroup();
        this.portal = this.physics.add.staticGroup();
        this.bossGroup = this.physics.add.group();

        // Spawn physical player bounds (drawn via Vector Graphics engine)
        this.player = this.physics.add.sprite(this.checkpointX, this.checkpointY, 'player_idle');
        this.player.setCollideWorldBounds(true);
        this.player.setGravityY(1000);
        this.player.setAlpha(0); // Invisible, drawn dynamically via update()
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(24, 48);

        // Spawn Level Geometry
        this.buildLevelGeometry(levelWidth);

        // Setup Collisions
        this.physics.add.collider(this.player, this.platforms, this.onPlayerGroundTouch, undefined, this);
        this.physics.add.collider(this.player, this.movingPlatforms, this.onPlayerGroundTouch, undefined, this);
        this.physics.add.collider(this.enemies, this.platforms);
        this.physics.add.collider(this.credits, this.platforms);

        this.physics.add.overlap(this.player, this.credits, this.collectCredit, undefined, this);
        this.physics.add.overlap(this.player, this.hazards, this.onHazardHit, undefined, this);
        this.physics.add.overlap(this.player, this.checkpoints, this.reachCheckpoint, undefined, this);
        this.physics.add.overlap(this.player, this.portal, this.reachPortal, undefined, this);
        this.physics.add.overlap(this.bullets, this.enemies, this.onBulletEnemyHit, undefined, this);
        this.physics.add.overlap(this.bullets, this.bossGroup, this.onBulletBossHit, undefined, this);
        this.physics.add.overlap(this.player, this.enemyBullets, this.onPlayerBulletHit, undefined, this);
        this.physics.add.overlap(this.player, this.enemies, this.onPlayerEnemyCollide, undefined, this);

        // Camera Tracking
        this.cameras.main.setBounds(0, 0, levelWidth, 600);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

        // Setup Controls
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = this.input.keyboard.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D,
                dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
                melee: Phaser.Input.Keyboard.KeyCodes.SPACE,
                hack: Phaser.Input.Keyboard.KeyCodes.H
            });
        }

        // HUD overlay text showing abilities unlocked
        const abilitiesStr = LEVEL_ABILITIES[this.level] || LEVEL_ABILITIES[1];
        this.abilityHUD = this.add.text(16, 50, `MODS: ${abilitiesStr.join(' | ')}`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#22d3ee'
        }).setScrollFactor(0);

        // Mobile touch controls receiver hook
        this.mobileKeys = { left: false, right: false, down: false };
        this.boundHandleMobileInput = (action: string) => {
            if (this.isTransitioning || this.isMatchOver) return;

            switch(action) {
                case 'left':
                    this.mobileKeys.left = true;
                    break;
                case 'stop-left':
                    this.mobileKeys.left = false;
                    break;
                case 'right':
                    this.mobileKeys.right = true;
                    break;
                case 'stop-right':
                    this.mobileKeys.right = false;
                    break;
                case 'down':
                    this.mobileKeys.down = true;
                    if (this.canSlide) this.triggerSlide();
                    break;
                case 'stop-down':
                    this.mobileKeys.down = false;
                    this.stopSlide();
                    break;
                case 'jump':
                    this.triggerJump();
                    break;
                case 'attack':
                    if (this.canMelee) this.triggerMelee();
                    break;
                case 'dash':
                    if (this.canDash) this.triggerDash();
                    break;
                case 'hack':
                    if (this.canHack) this.triggerHack();
                    break;
            }
        };
        EventBus.on('mobile-input', this.boundHandleMobileInput);

        // Match complete event handles
        this.boundHandleMatchCompleted = (data: any) => {
            console.log('[ARENA_PHASER] Match completed received');
            this.isMatchOver = true;
            this.isTransitioning = true;
            if (this.physics) {
                try { this.physics.pause(); } catch {}
            }
            try { this.scene.pause(); } catch {}
            if (this.player && this.player.body) {
                try { this.player.setVelocity(0, 0); } catch {}
            }
        };
        EventBus.on('match-completed', this.boundHandleMatchCompleted);

        this.events.once('shutdown', () => {
            EventBus.removeListener('mobile-input', this.boundHandleMobileInput);
            EventBus.removeListener('match-completed', this.boundHandleMatchCompleted);
        });
    }

    update(time: number, delta: number) {
        if (this.isMatchOver) return;

        // Clear dynamic game graphics
        this.gameGraphics.clear();

        if (this.isTransitioning) {
            this.drawPlayer();
            this.drawFX();
            this.drawBossHPBar();
            return;
        }

        // ============================================================
        // A. TIMERS & COOLDOWNS DECAY
        // ============================================================
        
        // Dash timers
        if (this.isDashing) {
            if (time > this.dashTimer) {
                this.isDashing = false;
                this.player.setVelocityX(0);
                (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
            } else {
                // Keep dash velocity X
                this.player.setVelocityX(this.dashDir * 600);
                // Draw dash visual footprint trace
                if (time % 3 === 0) {
                    this.dashTrail.push({ x: this.player.x, y: this.player.y, alpha: 0.6 });
                }
            }
        }

        // Slide timers
        if (this.isSliding) {
            if (time > this.slideTimer) {
                this.stopSlide();
            } else {
                this.player.setVelocityX(this.player.flipX ? -280 : 280);
            }
        }

        // Combo points decay (0.2x combo points lost per second)
        if (this.hasKilledEnemy) {
            this.timeSinceLastAction += delta;
            if (this.combo > 1.0) {
                this.combo -= (delta / 1000) * 0.15;
                if (this.combo < 1.0) this.combo = 1.0;
                if (Math.abs(this.combo - this.lastEmittedCombo) >= 0.1 || this.combo === 1.0) {
                    this.lastEmittedCombo = this.combo;
                    EventBus.emit('combo-changed', this.combo);
                }
            }
        }

        // Decay screen shake
        if (this.shakeIntensity > 0.1) {
            this.cameras.main.scrollX += this.rng.between(-this.shakeIntensity, this.shakeIntensity);
            this.cameras.main.scrollY += this.rng.between(-this.shakeIntensity, this.shakeIntensity);
            this.shakeIntensity *= 0.90;
        } else {
            this.shakeIntensity = 0;
        }

        if (this.playerFlashFrames > 0) this.playerFlashFrames--;
        if (this.bossFlashFrames > 0) this.bossFlashFrames--;

        // ============================================================
        // B. MOVEMENT LOGIC
        // ============================================================
        if (!this.isDashing && !this.isTransitioning) {
            let vx = 0;
            const walkSpeed = 220;

            // Lock horizontal walk input briefly during wall jump to allow clean push-off
            let canMoveHorizontal = true;
            if (this.wallJumpTimer && this.time.now < this.wallJumpTimer) {
                canMoveHorizontal = false;
            }

            // Check keyboard keys
            if (canMoveHorizontal && this.cursors && this.wasd) {
                if (this.cursors.left.isDown || this.wasd.left.isDown || this.mobileKeys.left) {
                    vx = -walkSpeed;
                    this.player.setFlipX(true);
                } else if (this.cursors.right.isDown || this.wasd.right.isDown || this.mobileKeys.right) {
                    vx = walkSpeed;
                    this.player.setFlipX(false);
                }
            }

            // Slide trigger keys (keyboard)
            if (this.canSlide && this.cursors && this.wasd && (this.cursors.down.isDown || this.wasd.down.isDown) && !this.isSliding && (this.player.body as Phaser.Physics.Arcade.Body).blocked.down) {
                this.triggerSlide();
            }

            // Dash trigger keys (keyboard)
            if (this.canDash && this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.dash) && !this.isDashing) {
                this.triggerDash();
            }

            // Melee attack trigger (keyboard)
            if (this.canMelee && this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.melee)) {
                this.triggerMelee();
            }

            // Hack terminal trigger (keyboard)
            if (this.canHack && this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.hack)) {
                this.triggerHack();
            }

            // Apply Walk velocity X
            if (!this.isSliding && canMoveHorizontal) {
                this.player.setVelocityX(vx);
            }

            // Jump trigger
            if ((this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.up)) || (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.up))) {
                this.triggerJump();
            }

            // Fall-out hazard check (Spills out bottom pit)
            if (this.player.y > 590) {
                this.onHazardHit();
            }
        }

        // ============================================================
        // C. ENEMY A.I. PATROLS
        // ============================================================
        this.enemies.getChildren().forEach((enemy: any) => {
            if (!enemy.active) return;
            const enemyType = enemy.getData('type');

            if (enemyType === 'drone_scout') {
                // Sinusoidal floating pattern
                const seed = enemy.getData('seed') || 0;
                const baseY = enemy.getData('baseY');
                enemy.y = baseY + Math.sin((time + seed) * 0.003) * 30;
                
                // Patrol Left/Right
                const minX = enemy.getData('minX');
                const maxX = enemy.getData('maxX');
                let dirX = enemy.getData('dirX') || 1;
                
                if (enemy.x <= minX) dirX = 1;
                if (enemy.x >= maxX) dirX = -1;
                enemy.setData('dirX', dirX);
                enemy.body.setVelocityX(dirX * 60);

                // Shoot laser orb downward if player is underneath
                const lastFire = enemy.getData('lastFire') || 0;
                if (time - lastFire > 2200 && Math.abs(enemy.x - this.player.x) < 200 && this.player.y > enemy.y) {
                    enemy.setData('lastFire', time);
                    this.fireEnemyProjectile(enemy.x, enemy.y + 12, 0, 200, 'enemy_bullet');
                }
            }
            else if (enemyType === 'street_gang') {
                // Runs toward player if in range, otherwise patrols
                const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                if (dist < 250) {
                    const walkDir = this.player.x > enemy.x ? 1 : -1;
                    enemy.body.setVelocityX(walkDir * 110);
                    enemy.setFlipX(walkDir < 0);
                    
                    // Attack punch swipes when extremely close
                    const lastFire = enemy.getData('lastFire') || 0;
                    if (dist < 40 && time - lastFire > 1500) {
                        enemy.setData('lastFire', time);
                        this.triggerEnemyMelee(enemy);
                    }
                } else {
                    const minX = enemy.getData('minX');
                    const maxX = enemy.getData('maxX');
                    let dirX = enemy.getData('dirX') || 1;
                    
                    if (enemy.x <= minX) dirX = 1;
                    if (enemy.x >= maxX) dirX = -1;
                    enemy.setData('dirX', dirX);
                    enemy.body.setVelocityX(dirX * 50);
                    enemy.setFlipX(dirX < 0);
                }
            }
            else if (enemyType === 'laser_turret') {
                // Stationary shooter aiming directly at player position
                const lastFire = enemy.getData('lastFire') || 0;
                const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                if (dist < 350 && time - lastFire > 2000) {
                    enemy.setData('lastFire', time);
                    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                    this.fireEnemyProjectile(enemy.x, enemy.y, Math.cos(angle) * 220, Math.sin(angle) * 220, 'enemy_bullet');
                }
            }
            else if (enemyType === 'security_robot') {
                // Heavy ground walker. Fires heavy laser beam if player is aligned horizontally
                const diffY = Math.abs(enemy.y - this.player.y);
                const diffX = this.player.x - enemy.x;
                
                const minX = enemy.getData('minX');
                const maxX = enemy.getData('maxX');
                let dirX = enemy.getData('dirX') || 1;

                if (enemy.x <= minX) dirX = 1;
                if (enemy.x >= maxX) dirX = -1;
                enemy.setData('dirX', dirX);
                enemy.body.setVelocityX(dirX * 45);
                enemy.setFlipX(dirX < 0);

                if (diffY < 30 && Math.abs(diffX) < 300) {
                    // Check if facing the player
                    const isFacingPlayer = (diffX > 0 && dirX > 0) || (diffX < 0 && dirX < 0);
                    const lastFire = enemy.getData('lastFire') || 0;
                    if (isFacingPlayer && time - lastFire > 1800) {
                        enemy.setData('lastFire', time);
                        this.fireEnemyProjectile(enemy.x + (dirX * 16), enemy.y - 4, dirX * 320, 0, 'enemy_bullet');
                    }
                }
            }
            else if (enemyType === 'mutated_cyborg') {
                // Runs fast. Dashes towards player if aligned
                const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                const walkDir = this.player.x > enemy.x ? 1 : -1;
                
                if (dist < 300) {
                    const lastFire = enemy.getData('lastFire') || 0;
                    if (time - lastFire > 3000 && Math.abs(enemy.y - this.player.y) < 30) {
                        // High-speed cyber dash attack
                        enemy.setData('lastFire', time);
                        enemy.body.setVelocityX(walkDir * 350);
                        this.tweens.add({
                            targets: enemy,
                            x: enemy.x + (walkDir * 120),
                            duration: 400,
                            ease: 'Quad.easeOut'
                        });
                        SoundManager.playSFX('/audio/player-hit.mp3');
                    } else {
                        enemy.body.setVelocityX(walkDir * 130);
                    }
                    enemy.setFlipX(walkDir < 0);
                } else {
                    enemy.body.setVelocityX(0);
                }
            }
            else if (enemyType === 'heavy_mech') {
                // High health giant walker. Shoots small homing rockets
                const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                if (dist < 400) {
                    const lastFire = enemy.getData('lastFire') || 0;
                    if (time - lastFire > 3500) {
                        enemy.setData('lastFire', time);
                        this.fireEnemyHomingMissile(enemy.x, enemy.y - 12);
                    }
                }
            }
            else if (enemyType === 'jetpack_soldier') {
                // Hovers and flies. Shoots spread bullets downward
                const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                if (dist < 350) {
                    // Hover follow y coordinate slightly above player
                    const targetY = this.player.y - 120;
                    enemy.body.setVelocityY(targetY > enemy.y ? 60 : -60);
                    
                    const walkDir = this.player.x > enemy.x ? 1 : -1;
                    enemy.body.setVelocityX(walkDir * 80);
                    enemy.setFlipX(walkDir < 0);

                    const lastFire = enemy.getData('lastFire') || 0;
                    if (time - lastFire > 2500) {
                        enemy.setData('lastFire', time);
                        // 3-way drop lasers
                        this.fireEnemyProjectile(enemy.x, enemy.y + 10, -50, 200, 'enemy_bullet');
                        this.fireEnemyProjectile(enemy.x, enemy.y + 10, 0, 220, 'enemy_bullet');
                        this.fireEnemyProjectile(enemy.x, enemy.y + 10, 50, 200, 'enemy_bullet');
                    }
                }
            }
            else if (enemyType === 'ai_assassin') {
                // Teleports near player and slashes
                const lastFire = enemy.getData('lastFire') || 0;
                if (time - lastFire > 4000) {
                    enemy.setData('lastFire', time);
                    this.teleportEnemyNearPlayer(enemy);
                }
            }
        });

        // ============================================================
        // D. BOSS COMBAT LOOP
        // ============================================================
        if (this.isBossSpawned && this.boss && this.boss.active) {
            const bossDist = Math.abs(this.boss.x - this.player.x);
            
            // Check Boss Patterns
            if (time - this.bossLastActionTime > 2500) {
                this.bossLastActionTime = time;
                this.runBossActionPattern(time);
            }

            // Level 10 Final Boss Forms phase shift checks
            if (this.level === 10 && this.bossHp <= 0) {
                this.shiftOmegaBossPhase();
            }
        }

        // ============================================================
        // E. GRAPHICS RENDERING & TRAILS ENGINE
        // ============================================================
        this.updateFX();
        this.drawFX();
        this.drawPlayer();
        this.drawLevelDynamicEntities();
        this.drawBossHPBar();
    }

    // ============================================================
    // F. PARALLAX CITY BACKGROUND
    // ============================================================
    createParallaxBackground(levelWidth: number) {
        // Distant Skyscrapers Layer (0.1x Scroll)
        this.bgLayer1 = this.add.graphics();
        this.bgLayer1.setScrollFactor(0.08);
        this.bgLayer1.fillStyle(0x060312, 1);
        for (let i = 0; i < 15; i++) {
            const rx = i * 260 + this.rng.between(-40, 40);
            const rw = this.rng.between(80, 160);
            const rh = this.rng.between(250, 500);
            this.bgLayer1.fillRect(rx, 600 - rh, rw, rh);
            
            // Neon windows
            this.bgLayer1.fillStyle(0xeab308, 0.45);
            for (let wy = 600 - rh + 30; wy < 580; wy += 40) {
                for (let wx = rx + 20; wx < rx + rw - 20; wx += 30) {
                    if (this.rng.next() > 0.4) {
                        this.bgLayer1.fillRect(wx, wy, 8, 8);
                    }
                }
            }
            this.bgLayer1.fillStyle(0x060312, 1);
        }

        // Mid-ground Skyline Layer (0.28x Scroll)
        this.bgLayer2 = this.add.graphics();
        this.bgLayer2.setScrollFactor(0.28);
        this.bgLayer2.fillStyle(0x0f0b24, 0.9);
        for (let i = 0; i < 18; i++) {
            const rx = i * 220 + this.rng.between(-30, 30);
            const rw = this.rng.between(60, 120);
            const rh = this.rng.between(150, 350);
            this.bgLayer2.fillRect(rx, 600 - rh, rw, rh);
            // Draw neon building borders
            this.bgLayer2.lineStyle(2, 0x00f0ff, 0.3);
            this.bgLayer2.strokeRect(rx, 600 - rh, rw, rh);
        }
    }

    // ============================================================
    // G. LEVEL DESIGNS GENERATOR
    // ============================================================
    buildLevelGeometry(levelWidth: number) {
        // Base ground level platform sections
        this.createPlatform(0, 512, 640, 96);
        
        if (this.level === 1) {
            // Level 1: Simple introductory platforms
            this.createPlatform(750, 420, 256, 32);
            this.createPlatform(1100, 320, 256, 32);
            this.createPlatform(1450, 420, 256, 32);
            
            this.spawnEnemy(900, 380, 'drone_scout');
            this.spawnEnemy(1200, 280, 'drone_scout');
            
            this.spawnCheckpoint(1000, 420);
            this.spawnCheckpoint(1600, 420);

            // Boss arena platform (extended to levelWidth)
            this.createPlatform(1850, 480, 1350, 120);
            this.spawnBossTrigger(2200, 480, 'boss_drone_commander', 60);
        }
        else if (this.level === 2) {
            // Level 2: Gaps requiring Wall Jumps
            // Wall platforms (vertical pillars)
            this.createPlatform(750, 350, 64, 162);
            this.createPlatform(950, 220, 64, 180);
            this.createPlatform(1150, 320, 64, 192);

            this.createPlatform(1350, 450, 256, 32);
            this.spawnEnemy(1400, 320, 'laser_turret');

            this.spawnCheckpoint(1450, 450);

            this.createPlatform(1700, 400, 256, 32);
            this.spawnEnemy(1800, 280, 'drone_scout');

            // Boss arena (extended to levelWidth)
            this.createPlatform(2100, 480, 1100, 120);
            this.spawnBossTrigger(2450, 480, 'boss_turret_bot', 80);
        }
        else if (this.level === 3) {
            // Level 3: Street gang patrols
            this.createPlatform(750, 420, 192, 32);
            this.spawnEnemy(800, 380, 'street_gang');

            this.createPlatform(1050, 320, 256, 32);
            this.spawnEnemy(1150, 280, 'street_gang');

            this.spawnCheckpoint(1150, 320);

            this.createPlatform(1400, 420, 256, 32);
            this.spawnEnemy(1500, 380, 'street_gang');

            // Boss arena (extended to levelWidth)
            this.createPlatform(1800, 480, 1400, 120);
            this.spawnBossTrigger(2200, 480, 'boss_gang_leader', 350);
        }
        else if (this.level === 4) {
            // Level 4: Metro slides
            // High ceilings forcing slide
            this.createPlatform(700, 420, 256, 32);
            this.createPlatform(700, 320, 256, 32); // Ceiling overlay

            this.createPlatform(1050, 450, 192, 32);
            this.spawnEnemy(1100, 410, 'security_robot');

            this.spawnCheckpoint(1150, 450);

            this.createPlatform(1350, 400, 256, 32);
            // Sliding tunnel
            this.createPlatform(1650, 480, 320, 32);
            this.createPlatform(1650, 380, 320, 32); // Ceiling

            // Boss arena (extended to levelWidth)
            this.createPlatform(2100, 480, levelWidth - 2100, 120);
            this.spawnBossTrigger(2400, 480, 'boss_metro_ai', 400);
        }
        else if (this.level === 5) {
            // Level 5: Cyber labs dash
            this.createPlatform(750, 400, 128, 32);
            // Spikes in between
            this.createHazard(900, 490, 'hazard_spikes');
            this.createHazard(932, 490, 'hazard_spikes');
            this.createPlatform(980, 350, 128, 32);

            this.spawnCheckpoint(1000, 350);
            this.spawnEnemy(1050, 300, 'mutated_cyborg');

            this.createPlatform(1200, 420, 192, 32);
            this.createHazard(1420, 490, 'hazard_spikes');

            this.createPlatform(1500, 450, 192, 32);
            
            // Boss arena (extended to levelWidth)
            this.createPlatform(1850, 480, 1350, 120);
            this.spawnBossTrigger(2150, 480, 'boss_experimental_android', 450);
        }
        else if (this.level === 6) {
            // Level 6: Data center lasers & terminals
            this.createPlatform(750, 450, 192, 32);
            // Laser grid blocking way
            const lg1 = this.createHazard(942, 386, 'laser_grid');
            lg1.setData('id', 'lg1');
            
            // Terminal to hack
            this.spawnTerminal(800, 402, 'lg1');

            this.createPlatform(1050, 380, 256, 32);
            this.spawnCheckpoint(1150, 380);

            this.createPlatform(1400, 450, 192, 32);
            const lg2 = this.createHazard(1592, 386, 'laser_grid');
            lg2.setData('id', 'lg2');
            this.spawnTerminal(1450, 402, 'lg2');

            // Boss arena (extended to levelWidth)
            this.createPlatform(1800, 480, 1400, 120);
            this.spawnBossTrigger(2200, 480, 'boss_defense_core', 500);
        }
        else if (this.level === 7) {
            // Level 7: Moving platforms
            this.createPlatform(750, 420, 128, 32);
            
            // Moving platform
            this.spawnMovingPlatform(950, 350, 128, 20, 150, 0);

            this.createPlatform(1150, 400, 128, 32);
            this.spawnCheckpoint(1200, 400);

            this.spawnMovingPlatform(1350, 400, 128, 20, 0, 100);

            this.createPlatform(1550, 450, 128, 32);
            this.spawnEnemy(1600, 400, 'heavy_mech');

            // Boss arena (extended to levelWidth)
            this.createPlatform(1850, 480, 1350, 120);
            this.spawnBossTrigger(2250, 480, 'boss_titan_mech', 600);
        }
        else if (this.level === 8) {
            // Level 8: Double jump floating gaps
            this.createPlatform(750, 420, 96, 32);
            this.createPlatform(950, 280, 96, 32);
            this.createPlatform(1150, 400, 96, 32);
            
            this.spawnCheckpoint(1180, 400);

            this.createPlatform(1350, 280, 96, 32);
            this.spawnEnemy(1380, 220, 'jetpack_soldier');

            this.createPlatform(1550, 420, 96, 32);

            // Boss arena (extended to levelWidth)
            this.createPlatform(1800, 480, 1400, 120);
            this.spawnBossTrigger(2200, 480, 'boss_sky_hunter', 650);
        }
        else if (this.level === 9) {
            // Level 9: Advanced combat guards
            this.createPlatform(750, 450, 256, 32);
            this.spawnEnemy(800, 400, 'ai_assassin');
            this.spawnEnemy(900, 400, 'street_gang');

            this.createPlatform(1100, 350, 256, 32);
            this.spawnCheckpoint(1200, 350);

            this.createPlatform(1450, 420, 256, 32);
            this.spawnEnemy(1500, 370, 'ai_assassin');

            // Boss arena (extended to levelWidth)
            this.createPlatform(1800, 480, 1400, 120);
            this.spawnBossTrigger(2250, 480, 'boss_cyber_general', 750);
        }
        else {
            // Level 10: Final digital nexus
            this.createPlatform(700, 450, 128, 32);
            this.createHazard(850, 490, 'hazard_spikes');
            this.createPlatform(920, 350, 128, 32);

            this.spawnMovingPlatform(1100, 350, 128, 20, 120, 0);

            this.createPlatform(1300, 420, 128, 32);
            this.spawnCheckpoint(1320, 420);

            // Hacking barrier
            const lg3 = this.createHazard(1500, 324, 'laser_grid');
            lg3.setData('id', 'lg3');
            this.spawnTerminal(1350, 374, 'lg3');

            this.createPlatform(1600, 380, 192, 32);
            this.spawnEnemy(1650, 320, 'ai_assassin');

            // Final Boss arena (extended to levelWidth)
            this.createPlatform(1900, 480, 1300, 120);
            this.spawnBossTrigger(2400, 480, 'omega_robot', 1000);
        }

        // Populate credit coins throughout the map dynamically
        this.spawnLevelCredits(levelWidth);

        // Place exit portal at the end of map
        this.spawnExitPortal(levelWidth - 160, 448);
    }

    // ============================================================
    // H. GEOMETRY SPANNING HELPERS
    // ============================================================
    createPlatform(x: number, y: number, w: number, h: number) {
        for (let px = x; px < x + w; px += 32) {
            for (let py = y; py < y + h; py += 32) {
                const plat = this.platforms.create(px + 16, py + 16, 'ground_tile');
                plat.setAlpha(0); // Drawn vector-style dynamically
                plat.setData('w', 32);
                plat.setData('h', 32);
            }
        }
    }

    createHazard(x: number, y: number, key: string): Phaser.Physics.Arcade.Sprite {
        const hazard = this.hazards.create(x, y, key);
        hazard.setAlpha(0);
        hazard.setOrigin(0.5);
        return hazard;
    }

    spawnMovingPlatform(x: number, y: number, w: number, h: number, vx: number, vy: number) {
        const plat = this.movingPlatforms.create(x + w/2, y + h/2, 'ground_tile');
        plat.setAlpha(0);
        plat.setDisplaySize(w, h);
        plat.body.setAllowGravity(false);
        plat.body.setImmovable(true);
        plat.body.setVelocity(vx, vy);
        plat.setData('w', w);
        plat.setData('h', h);

        // Boundary checks to slide back/forth
        this.tweens.add({
            targets: plat.body.velocity,
            x: -vx,
            y: -vy,
            duration: 2500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    spawnCheckpoint(x: number, y: number) {
        const flag = this.checkpoints.create(x, y, 'checkpoint_inactive');
        flag.setAlpha(0);
        flag.setData('active', false);
    }

    spawnTerminal(x: number, y: number, laserGridId: string) {
        const term = this.terminals.create(x, y, 'terminal_online');
        term.setAlpha(0);
        term.setData('hacked', false);
        term.setData('target', laserGridId);
    }

    spawnExitPortal(x: number, y: number) {
        const exit = this.portal.create(x, y, 'exit_portal');
        exit.setAlpha(0);
        
        // Spawn lock barrier blocking portal until boss is down
        this.bossBarrier = this.physics.add.sprite(x - 40, y, 'laser_grid');
        this.physics.add.collider(this.player, this.bossBarrier);
        this.bossBarrier.setAlpha(0);
        const barrierBody = this.bossBarrier.body as Phaser.Physics.Arcade.Body;
        barrierBody.setAllowGravity(false);
        barrierBody.setImmovable(true);
    }

    spawnLevelCredits(levelWidth: number) {
        // Place credit gold coins on platforms periodically
        for (let cx = 300; cx < levelWidth - 300; cx += this.rng.between(180, 320)) {
            const cy = this.rng.between(350, 470); // Adjusted range so coins are within jump height
            const coin = this.credits.create(cx, cy, 'credits_coin');
            coin.body.setAllowGravity(false);
            coin.body.setImmovable(true);
            coin.setAlpha(0);
        }
    }

    spawnEnemy(x: number, y: number, type: string) {
        const enemy = this.enemies.create(x, y, type);
        enemy.setAlpha(0);
        enemy.setData('type', type);
        enemy.setData('seed', this.rng.between(0, 5000));
        enemy.setData('dirX', this.rng.next() > 0.5 ? 1 : -1);
        enemy.setData('minX', x - 120);
        enemy.setData('maxX', x + 120);
        enemy.setData('baseY', y);
        enemy.setData('lastFire', 0);
        enemy.body.setGravityY(type === 'drone_scout' || type === 'jetpack_soldier' ? 0 : 1000);
        
        let hp = 1;
        if (type === 'security_robot') hp = 2;
        if (type === 'mutated_cyborg') hp = 2;
        if (type === 'heavy_mech') hp = 5;
        if (type === 'ai_assassin') hp = 3;
        
        enemy.setData('health', hp);
    }

    spawnBossTrigger(x: number, y: number, type: string, maxHp: number) {
        const triggerEvent = this.time.addEvent({
            delay: 100,
            callback: () => {
                // Stop loop if boss was already defeated this run
                if (this.bossDefeated) {
                    triggerEvent.destroy();
                    return;
                }
                // Monitor player X threshold to trigger boss spawn
                if (this.player.x > x - 250 && !this.isBossSpawned) {
                    this.triggerBossSpawn(x + 150, y - 64, type, maxHp);
                    triggerEvent.destroy(); // Never re-trigger once spawned
                }
            },
            loop: true
        });
    }

    // ============================================================
    // I. CORE ABILITIES CONTROLLERS
    // ============================================================
    triggerJump() {
        if (this.isTransitioning) return;
        const isGrounded = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down || (this.player.body as Phaser.Physics.Arcade.Body).touching.down;

        if (isGrounded) {
            this.player.setVelocityY(-450);
            this.jumpsCount = 1;
            SoundManager.playSFX('/audio/laser.mp3');
        } 
        else if (this.canWallJump && ((this.player.body as Phaser.Physics.Arcade.Body).blocked.left || (this.player.body as Phaser.Physics.Arcade.Body).blocked.right)) {
            const kickDir = (this.player.body as Phaser.Physics.Arcade.Body).blocked.left ? 1 : -1;
            this.player.setVelocityX(kickDir * 320);
            this.player.setVelocityY(-410);
            this.jumpsCount = 1;
            this.wallJumpTimer = this.time.now + 250;
            this.player.setFlipX(kickDir < 0);
            this.createVisualSparks(this.player.x, this.player.y, kickDir < 0 ? 0x00f0ff : 0xff00ff, 6);
            SoundManager.playSFX('/audio/laser.mp3');
        }
        else if (this.canDoubleJump && this.jumpsCount < 2) {
            this.player.setVelocityY(-420);
            this.jumpsCount = 2;
            this.createVisualSparks(this.player.x, this.player.y + 16, 0x00f0ff, 8);
            SoundManager.playSFX('/audio/laser.mp3');
        }
    }

    onPlayerGroundTouch() {
        this.jumpsCount = 0;
    }

    triggerSlide() {
        if (this.isTransitioning || this.isSliding || !(this.player.body as Phaser.Physics.Arcade.Body).blocked.down) return;
        this.isSliding = true;
        this.slideTimer = this.time.now + 450;
        
        // Shrink bounds
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(24, 20);
        this.player.y += 14;
        SoundManager.playSFX('/audio/player-hit.mp3');
    }

    stopSlide() {
        if (!this.isSliding) return;
        this.isSliding = false;
        
        // Restore player bounds
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(24, 48);
        this.player.y -= 14;
    }

    triggerDash() {
        if (this.isTransitioning || this.isDashing || this.time.now - this.lastDashTime < 1200) return;
        this.isDashing = true;
        this.lastDashTime = this.time.now;
        this.dashTimer = this.time.now + 250;
        this.dashDir = this.player.flipX ? -1 : 1;
        (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.player.setVelocityY(0);
        
        // Dash particle burst
        this.createVisualSparks(this.player.x, this.player.y, 0x00f0ff, 12);
        SoundManager.playSFX('/audio/laser.mp3');
    }

    triggerMelee() {
        if (this.isTransitioning || this.time.now - this.lastAttackTime < 300) return;
        this.lastAttackTime = this.time.now;

        // Perform Swipe Graphic
        const swipeX = this.player.x + (this.player.flipX ? -35 : 35);
        const swipeY = this.player.y;

        const swipe = this.add.sprite(swipeX, swipeY, 'punch_swipe');
        swipe.setFlipX(this.player.flipX);
        
        // Auto decay swipe sprite
        this.tweens.add({
            targets: swipe,
            alpha: 0,
            scale: 1.4,
            duration: 180,
            onComplete: () => swipe.destroy()
        });

        SoundManager.playSFX('/audio/laser.mp3');

        // Check if melee attack hits enemy
        this.enemies.getChildren().forEach((enemy: any) => {
            if (!enemy.active) return;
            const dist = Phaser.Math.Distance.Between(swipeX, swipeY, enemy.x, enemy.y);
            if (dist < 70) {
                this.damageEnemy(enemy, this.canAdvancedCombat && this.isDashing ? 3 : 1);
            }
        });

        // Check if melee attack hits Boss
        if (this.isBossSpawned && this.boss && this.boss.active) {
            const dist = Phaser.Math.Distance.Between(swipeX, swipeY, this.boss.x, this.boss.y);
            if (dist < 90) {
                this.damageBoss(this.canAdvancedCombat && this.isDashing ? 25 : 10);
            }
        }
    }

    triggerHack() {
        if (this.isTransitioning) return;
        
        this.terminals.getChildren().forEach((term: any) => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, term.x, term.y);
            if (dist < 50 && !term.getData('hacked')) {
                // Hack computer terminal success!
                term.setData('hacked', true);
                term.setTexture('terminal_hacked');
                
                const targetLaserId = term.getData('target');
                this.createVisualSparks(term.x, term.y, 0x00ff88, 16);
                SoundManager.playSFX('/audio/player-hit.mp3');

                // Deactivate matching laser grid barrier
                this.hazards.getChildren().forEach((haz: any) => {
                    if (haz.getData('id') === targetLaserId) {
                        this.createVisualSparks(haz.x, haz.y, 0xef4444, 12);
                        haz.destroy();
                    }
                });
            }
        });
    }

    // ============================================================
    // J. BOSS ACTIONS PATTERNS
    // ============================================================
    triggerBossSpawn(x: number, y: number, type: string, maxHp: number) {
        this.isBossSpawned = true;
        this.bossHp = maxHp;
        this.bossMaxHp = maxHp;
        this.bossPhase = 1;

        // Spawn physical boss body
        const bossSprite = this.bossGroup.create(x, y, type) as Phaser.Physics.Arcade.Sprite;
        this.boss = bossSprite;
        bossSprite.setAlpha(0);
        const bossBody = bossSprite.body as Phaser.Physics.Arcade.Body;
        bossBody.setAllowGravity(false);
        bossBody.setImmovable(true);
        bossBody.setSize(60, 60);

        // Slide boss onto screen
        this.tweens.add({
            targets: this.boss,
            y: y - 30,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Flash screen red and rumble
        this.cameras.main.flash(400, 255, 0, 0);
        this.shakeIntensity = 12;
        SoundManager.playSFX('/audio/boss-laser.mp3');

        const label = this.level === 10 ? `OMEGA AI CORE — PH 1` : 'GRID OVERLORD SECURITY CORE';
        this.bossText = this.add.text(400, 14, label, {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0);
    }

    runBossActionPattern(time: number) {
        const boss = this.boss;
        if (!boss || !boss.active) return;

        const dist = Phaser.Math.Distance.Between(boss.x, boss.y, this.player.x, this.player.y);

        if (this.level === 1) {
            // Drone Commander: fires a 3-spread orb
            this.fireEnemyProjectile(boss.x - 30, boss.y, -180, 0, 'enemy_bullet');
            this.fireEnemyProjectile(boss.x - 30, boss.y, -160, -80, 'enemy_bullet');
            this.fireEnemyProjectile(boss.x - 30, boss.y, -160, 80, 'enemy_bullet');
        }
        else if (this.level === 2) {
            // Turret Bot: fires a laser blast pattern
            this.fireEnemyProjectile(boss.x - 20, boss.y - 10, -220, 0, 'enemy_bullet');
            this.fireEnemyProjectile(boss.x - 20, boss.y + 10, -220, 0, 'enemy_bullet');
        }
        else if (this.level === 3) {
            // Gang Leader: Charge runs towards player
            const walkDir = this.player.x > boss.x ? 1 : -1;
            this.tweens.add({
                targets: boss,
                x: boss.x + (walkDir * 200),
                duration: 600,
                ease: 'Quad.easeInOut'
            });
            if (dist < 80) {
                this.takeDamage(12);
            }
        }
        else if (this.level === 4) {
            // Metro AI: Sparks falling electric particles
            for(let i=0; i<4; i++) {
                this.fireEnemyProjectile(boss.x - 50 + (i*20), boss.y, 0, 180, 'enemy_bullet');
            }
        }
        else if (this.level === 5) {
            // Experimental Android: Teleports directly above player and drops
            const oldX = boss.x;
            const oldY = boss.y;
            this.createVisualSparks(oldX, oldY, 0xff00ff, 12);
            
            boss.x = this.player.x;
            boss.y = this.player.y - 180;
            this.tweens.add({
                targets: boss,
                y: this.player.y - 20,
                duration: 400,
                ease: 'Expo.easeIn',
                onComplete: () => {
                    this.shakeIntensity = 8;
                    if (Math.abs(this.player.x - boss.x) < 40) {
                        this.takeDamage(15);
                    }
                }
            });
        }
        else if (this.level === 6) {
            // Defense Core: Fires lasers rotating 360 deg
            const angle = time * 0.0025;
            this.fireEnemyProjectile(boss.x, boss.y, Math.cos(angle)*180, Math.sin(angle)*180, 'enemy_bullet');
            this.fireEnemyProjectile(boss.x, boss.y, -Math.cos(angle)*180, -Math.sin(angle)*180, 'enemy_bullet');
        }
        else if (this.level === 7) {
            // Titan Mech: Heavy Ground Slam screen rumbles + Missiles
            this.shakeIntensity = 18;
            this.fireEnemyHomingMissile(boss.x - 40, boss.y - 20);
            if ((this.player.body as Phaser.Physics.Arcade.Body).blocked.down) {
                this.takeDamage(5); // Ground tremor hits player if standing on floor
            }
        }
        else if (this.level === 8) {
            // Sky Hunter: Flies back and forth launching missile drops
            const flightDir = this.rng.next() > 0.5 ? 1 : -1;
            this.tweens.add({
                targets: boss,
                x: this.player.x + (flightDir * 180),
                y: this.player.y - 150,
                duration: 900,
                ease: 'Cubic.easeInOut',
                onComplete: () => {
                    this.fireEnemyProjectile(boss.x, boss.y, 0, 250, 'enemy_missile');
                }
            });
        }
        else if (this.level === 9) {
            // Cyber General: Sword strike dash
            const walkDir = this.player.x > boss.x ? 1 : -1;
            boss.setFlipX(walkDir < 0);
            this.tweens.add({
                targets: boss,
                x: this.player.x,
                duration: 500,
                ease: 'Expo.easeOut',
                onComplete: () => {
                    if (Math.abs(this.player.x - boss.x) < 50) {
                        this.takeDamage(20);
                    }
                }
            });
        }
        else {
            // Level 10 Omega Final AI Core (Dynamic phase attacks)
            if (this.bossPhase === 1) {
                // Form 1: Heavy Robot blasts
                this.fireEnemyProjectile(boss.x - 30, boss.y, -220, 50, 'enemy_bullet');
                this.fireEnemyProjectile(boss.x - 30, boss.y, -220, -50, 'enemy_bullet');
            } else if (this.bossPhase === 2) {
                // Form 2: Digital face grid lasers
                const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
                this.fireEnemyProjectile(boss.x, boss.y, Math.cos(angle)*280, Math.sin(angle)*280, 'enemy_bullet');
            } else {
                // Form 3: Main Core hyper missile storm
                this.fireEnemyHomingMissile(boss.x, boss.y - 30);
                this.fireEnemyProjectile(boss.x, boss.y + 10, -180, 0, 'enemy_bullet');
                this.fireEnemyProjectile(boss.x, boss.y + 10, -160, -90, 'enemy_bullet');
            }
        }
    }

    shiftOmegaBossPhase() {
        const boss = this.boss;
        if (!boss) return;
        if (this.bossPhase === 1) {
            this.bossPhase = 2;
            this.bossHp = 150;
            this.bossMaxHp = 150;
            boss.setTexture('omega_digital');
            this.createVisualSparks(boss.x, boss.y, 0xff00ff, 25);
            SoundManager.playSFX('/audio/explosion.mp3');
        } else if (this.bossPhase === 2) {
            this.bossPhase = 3;
            this.bossHp = 200;
            this.bossMaxHp = 200;
            boss.setTexture('omega_core');
            this.createVisualSparks(boss.x, boss.y, 0x00f0ff, 35);
            SoundManager.playSFX('/audio/explosion.mp3');
        } else {
            // Form 3 Core Down! Complete defeat
            boss.destroy();
            this.triggerBossDefeated();
        }
    }

    // ============================================================
    // K. BULLET & PROJECTILES FIRES
    // ============================================================
    fireEnemyProjectile(x: number, y: number, vx: number, vy: number, key: string) {
        const bullet = this.enemyBullets.create(x, y, key);
        bullet.body.setAllowGravity(false);
        bullet.body.setVelocity(vx, vy);
        bullet.setAlpha(0); // Drawn via vector graphics
    }

    fireEnemyHomingMissile(x: number, y: number) {
        const missile = this.enemyBullets.create(x, y, 'enemy_missile');
        missile.body.setAllowGravity(false);
        missile.body.setVelocity(-200, 0);
        missile.setAlpha(0);

        this.tweens.add({
            targets: missile.body.velocity,
            y: (this.player.y > y ? 110 : -110),
            duration: 1200,
            ease: 'Quad.easeInOut'
        });
    }

    // ============================================================
    // L. PHYSICS COLLISIONS HANDLERS
    // ============================================================
    collectCredit(playerObj: any, coinObj: any) {
        coinObj.destroy();
        this.creditsCollected++;
        this.score += 100;
        EventBus.emit('score-changed', this.score);
        SoundManager.playSFX('/audio/player-hit.mp3');
        this.createVisualSparks(this.player.x, this.player.y, 0xeab308, 4);
    }

    reachCheckpoint(playerObj: any, flagObj: any) {
        if (flagObj.getData('active')) return;
        flagObj.setData('active', true);
        flagObj.setTexture('checkpoint_active');
        this.checkpointX = flagObj.x;
        this.checkpointY = flagObj.y;
        this.createVisualSparks(flagObj.x, flagObj.y, 0x00ff88, 8);
        SoundManager.playSFX('/audio/player-hit.mp3');
    }

    reachPortal() {
        if (this.isTransitioning) return;
        
        // Block portal access if boss is alive
        if (this.isBossSpawned && this.boss && this.boss.active) {
            return;
        }

        this.isTransitioning = true;
        this.player.setVelocity(0, 0);

        // Victory spin zoom transition
        this.tweens.add({
            targets: this.player,
            scale: 0.1,
            angle: 360,
            duration: 800,
            onComplete: () => {
                this.triggerVictory();
            }
        });
    }

    onHazardHit() {
        this.takeDamage(100); // Hazards are lethal spikes/lasers (respawn player)
    }

    onPlayerBulletHit(playerObj: any, bulletObj: any) {
        bulletObj.destroy();
        this.takeDamage(12);
    }

    onPlayerEnemyCollide(playerObj: any, enemyObj: any) {
        if (this.isDashing) return;
        this.takeDamage(10);
    }

    onBulletEnemyHit(bulletObj: any, enemyObj: any) {
        bulletObj.destroy();
        this.damageEnemy(enemyObj, 1);
    }

    onBulletBossHit(bulletObj: any, bossObj: any) {
        bulletObj.destroy();
        this.damageBoss(1);
    }

    triggerEnemyMelee(enemy: any) {
        this.createVisualSparks(enemy.x - 12, enemy.y, 0xef4444, 4);
        if (Math.abs(this.player.x - enemy.x) < 40) {
            this.takeDamage(10);
        }
    }

    // ============================================================
    // M. DAMAGE & COMBAT CALCULATIONS
    // ============================================================
    takeDamage(amount: number) {
        if (this.isTransitioning || this.isMatchOver) return;

        // Bypass invincibility for instant-death hazards (amount >= 100)
        if (amount < 100 && this.time.now - this.lastHitTime < 1000) return;

        if (amount < 100) {
            this.lastHitTime = this.time.now;
        }

        this.health -= amount;
        this.playerFlashFrames = 30; // Flash for approx 500ms
        this.shakeIntensity = 8;
        SoundManager.playSFX('/audio/player-hit.mp3');

        if (this.health <= 0) {
            this.health = 0;
            EventBus.emit('shields-changed', 0);
            this.handlePlayerDeath();
        } else {
            EventBus.emit('shields-changed', this.health);
        }
    }

    handlePlayerDeath() {
        if (this.registry.get('arenaMode')) {
            this.lives = 0;
            EventBus.emit('lives-changed', 0);
            this.gameOver();
            return;
        }

        this.lives--;
        EventBus.emit('lives-changed', this.lives);
        this.createVisualSparks(this.player.x, this.player.y, 0xef4444, 25);
        SoundManager.playSFX('/audio/explosion.mp3');

        if (this.lives <= 0) {
            this.gameOver();
        } else {
            // Respawn player at last checkpoint
            this.health = 100;
            EventBus.emit('shields-changed', 100);
            this.player.x = this.checkpointX;
            this.player.y = this.checkpointY - 10;
            this.player.setVelocity(0, 0);
            this.cameras.main.flash(300, 255, 0, 0);
        }
    }

    damageEnemy(enemy: any, amount: number) {
        let hp = enemy.getData('health') - amount;
        enemy.setData('health', hp);
        this.createVisualSparks(enemy.x, enemy.y, 0xff00ff, 6);
        SoundManager.playSFX('/audio/player-hit.mp3');

        if (hp <= 0) {
            enemy.destroy();
            SoundManager.playSFX('/audio/explosion.mp3');
            this.createVisualSparks(enemy.x, enemy.y, 0x00f0ff, 14);

            // Combo multiplier increment
            if (!this.hasKilledEnemy) {
                this.hasKilledEnemy = true;
                this.combo = 1.0;
            } else {
                this.combo += 0.3;
                if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            }
            this.timeSinceLastAction = 0;
            this.lastEmittedCombo = this.combo;
            EventBus.emit('combo-changed', this.combo);

            this.score += Math.floor(200 * this.combo);
            EventBus.emit('score-changed', this.score);
        }
    }

    damageBoss(amount: number) {
        if (!this.boss || !this.boss.active) return;
        this.bossHp -= amount;
        this.bossFlashFrames = 3;
        this.createVisualSparks(this.boss.x - 20, this.boss.y, 0xff00ff, 8);
        SoundManager.playSFX('/audio/player-hit.mp3');

        if (this.bossHp <= 0 && this.level !== 10) {
            this.boss.destroy();
            this.triggerBossDefeated();
        }
    }

    triggerBossDefeated() {
        this.isBossSpawned = false;
        this.bossDefeated = true; // Prevent trigger loop from re-spawning boss
        this.boss = null;
        if (this.bossText) {
            this.bossText.destroy();
            this.bossText = null;
        }
        
        // Remove exits blockade
        if (this.bossBarrier) {
            this.createVisualSparks(this.bossBarrier.x, this.bossBarrier.y, 0x00f0ff, 12);
            this.bossBarrier.disableBody(true, true);
        }

        this.score += 5000;
        EventBus.emit('score-changed', this.score);
        this.cameras.main.flash(500, 0, 255, 133);
        this.shakeIntensity = 20;
        SoundManager.playSFX('/audio/explosion.mp3');
        this.createVisualSparks(this.player.x + 300, 300, 0x00ff88, 40);
    }

    // ============================================================
    // N. VISUALS GRAFX ENGINE (PUMP HANDLERS)
    // ============================================================
    updateFX() {
        // Dash trail decay
        this.dashTrail.forEach(t => t.alpha -= 0.08);
        this.dashTrail = this.dashTrail.filter(t => t.alpha > 0);

        // Sparks fly logic
        this.sparks.forEach(s => {
            s.x += s.vx;
            s.y += s.vy;
            s.alpha -= 0.035;
        });
        this.sparks = this.sparks.filter(s => s.alpha > 0);
    }

    drawFX() {
        // Draw Dash shadow clone overlays
        this.dashTrail.forEach(t => {
            this.gameGraphics.fillStyle(0x00f0ff, t.alpha);
            this.gameGraphics.fillRect(t.x - 12, t.y - 24, 24, 48);
        });

        // Draw spark explosions
        this.sparks.forEach(s => {
            this.gameGraphics.fillStyle(s.color, s.alpha);
            this.gameGraphics.fillRect(s.x, s.y, 4, 4);
        });
    }

    drawPlayer() {
        if (!this.player || !this.player.active) return;
        
        // Render flashing player overlays
        if (this.playerFlashFrames > 0 && this.playerFlashFrames % 2 === 0) {
            this.gameGraphics.fillStyle(0xffffff, 0.95);
            this.gameGraphics.fillRect(this.player.x - 12, this.player.y - 24, 24, 48);
            return;
        }

        const flip = this.player.flipX;
        const px = this.player.x;
        const py = this.player.y;

        // Draw animated body frame block
        if (this.isSliding) {
            // Draw Sliding Hacker
            this.gameGraphics.fillStyle(0x1d4ed8, 1); // Blue coat
            this.gameGraphics.fillRect(flip ? px - 24 : px - 24, py - 10, 38, 16);
            this.gameGraphics.fillStyle(0xffdbb5, 1); // Skin face
            this.gameGraphics.fillRect(flip ? px - 24 : px + 14, py - 10, 10, 10);
            this.gameGraphics.fillStyle(0x00f0ff, 1); // Visor
            this.gameGraphics.fillRect(flip ? px - 24 : px + 21, py - 8, 3, 3);
        } else {
            // Draw Standing/Running Hacker
            const isMoving = Math.abs((this.player.body as Phaser.Physics.Arcade.Body).velocity.x) > 10;
            const yOffset = isMoving ? Math.sin(this.time.now * 0.015) * 2 : 0;
            
            this.gameGraphics.fillStyle(0x0a1128, 1); // Pants
            this.gameGraphics.fillRect(px - 8, py + 4 + yOffset, 16, 16);
            this.gameGraphics.fillStyle(0x00f0ff, 1); // Shoes
            this.gameGraphics.fillRect(px - 10, py + 20 + yOffset, 6, 4);
            this.gameGraphics.fillRect(px + 4, py + 20 + yOffset, 6, 4);
            this.gameGraphics.fillStyle(0x1d4ed8, 1); // Jacket
            this.gameGraphics.fillRect(px - 12, py - 12 + yOffset, 24, 18);
            this.gameGraphics.fillStyle(0xf59e0b, 1); // Gold Chain
            this.gameGraphics.fillRect(px - 5, py - 9 + yOffset, 10, 2);
            this.gameGraphics.fillStyle(0xffdbb5, 1); // Head
            this.gameGraphics.fillRect(px - 8, py - 24 + yOffset, 16, 12);
            this.gameGraphics.fillStyle(0x00f0ff, 1); // Visor
            this.gameGraphics.fillRect(flip ? px - 8 : px + 2, py - 21 + yOffset, 6, 3);
        }
    }

    drawLevelDynamicEntities() {
        // Draw platforms (Dark cyan glowing borders)
        this.platforms.getChildren().forEach((plat: any) => {
            this.gameGraphics.fillStyle(0x0a0c16, 1);
            this.gameGraphics.fillRect(plat.x - 16, plat.y - 16, 32, 32);
            this.gameGraphics.fillStyle(0x22d3ee, 0.95);
            this.gameGraphics.fillRect(plat.x - 16, plat.y - 16, 32, 3);
            this.gameGraphics.lineStyle(1, 0x1e293b, 1);
            this.gameGraphics.strokeRect(plat.x - 16, plat.y - 16, 32, 32);
        });

        // Draw moving platforms
        this.movingPlatforms.getChildren().forEach((plat: any) => {
            const w = plat.getData('w');
            const h = plat.getData('h');
            this.gameGraphics.fillStyle(0x0f172a, 1);
            this.gameGraphics.fillRect(plat.x - w/2, plat.y - h/2, w, h);
            this.gameGraphics.fillStyle(0xeab308, 0.9); // Yellow moving platforms
            this.gameGraphics.fillRect(plat.x - w/2, plat.y - h/2, w, 3);
            this.gameGraphics.lineStyle(1.5, 0xeab308, 0.4);
            this.gameGraphics.strokeRect(plat.x - w/2, plat.y - h/2, w, h);
        });

        // Draw credits (spinning yellow star square)
        this.credits.getChildren().forEach((coin: any) => {
            const rot = this.time.now * 0.005;
            this.gameGraphics.fillStyle(0xeab308, 0.95);
            this.gameGraphics.fillRect(coin.x - 6, coin.y - 6, 12, 12);
            this.gameGraphics.lineStyle(1.5, 0xffffff, 1);
            this.gameGraphics.strokeRect(coin.x - 6, coin.y - 6, 12, 12);
        });

        // Draw checkpoints
        this.checkpoints.getChildren().forEach((flag: any) => {
            const act = flag.getData('active');
            this.gameGraphics.fillStyle(0x475569, 1); // Pole
            this.gameGraphics.fillRect(flag.x - 2, flag.y - 24, 4, 48);
            this.gameGraphics.fillStyle(act ? 0x22c55e : 0xef4444, 0.9); // Flag
            this.gameGraphics.fillRect(flag.x + 2, flag.y - 20, 16, 12);
        });

        // Draw terminals
        this.terminals.getChildren().forEach((term: any) => {
            const hacked = term.getData('hacked');
            this.gameGraphics.fillStyle(0x1e293b, 1); // Pillar
            this.gameGraphics.fillRect(term.x - 8, term.y - 8, 16, 32);
            this.gameGraphics.fillStyle(0x020617, 1); // Monitor casing
            this.gameGraphics.fillRect(term.x - 12, term.y - 24, 24, 16);
            this.gameGraphics.fillStyle(hacked ? 0x00f0ff : 0x22c55e, 1); // Console
            this.gameGraphics.fillRect(term.x - 9, term.y - 21, 18, 10);
            
            // Interaction prompt if close
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, term.x, term.y);
            if (dist < 50 && !hacked) {
                const textX = term.x;
                const textY = term.y - 38;
                this.gameGraphics.fillStyle(0x000000, 0.7);
                this.gameGraphics.fillRect(textX - 25, textY - 8, 50, 16);
                
                // Prompt text outline
                this.add.text(textX, textY, 'HACK [H]', {
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    color: '#22c55e'
                }).setOrigin(0.5).setAlpha(0.85).destroy(); // Temporary mock
            }
        });

        // Draw Exit gateway portal
        this.portal.getChildren().forEach((p: any) => {
            this.gameGraphics.fillStyle(0x05020c, 1);
            this.gameGraphics.fillRect(p.x - 24, p.y - 32, 48, 64);
            this.gameGraphics.lineStyle(3, 0xff00ff, 0.8);
            this.gameGraphics.strokeRect(p.x - 24, p.y - 32, 48, 64);
            this.gameGraphics.lineStyle(1.5, 0x00f0ff, 0.55);
            this.gameGraphics.strokeRect(p.x - 16, p.y - 24, 32, 48);
        });

        // Draw hazard spikes
        this.hazards.getChildren().forEach((spk: any) => {
            const type = spk.texture.key;
            if (type === 'hazard_spikes') {
                this.gameGraphics.fillStyle(0xef4444, 0.9);
                this.gameGraphics.fillTriangle(spk.x - 16, spk.y + 16, spk.x, spk.y - 16, spk.x + 16, spk.y + 16);
                this.gameGraphics.fillStyle(0xeab308, 1);
                this.gameGraphics.fillRect(spk.x - 16, spk.y + 14, 32, 2);
            } else if (type === 'laser_grid') {
                this.gameGraphics.fillStyle(0xef4444, 0.35); // laser beam
                this.gameGraphics.fillRect(spk.x - 4, spk.y - 32, 8, 64);
                this.gameGraphics.fillStyle(0xffffff, 0.9); // laser core
                this.gameGraphics.fillRect(spk.x - 1.5, spk.y - 32, 3, 64);
                this.gameGraphics.fillStyle(0x991b1b, 1); // endcaps
                this.gameGraphics.fillRect(spk.x - 8, spk.y - 32, 16, 6);
                this.gameGraphics.fillRect(spk.x - 8, spk.y + 26, 16, 6);
            }
        });

        // Draw player projectiles
        this.bullets.getChildren().forEach((b: any) => {
            this.gameGraphics.fillStyle(0x00f0ff, 0.95);
            this.gameGraphics.fillRect(b.x - 8, b.y - 3, 16, 6);
        });

        // Draw enemy projectiles
        this.enemyBullets.getChildren().forEach((eb: any) => {
            const key = eb.texture.key;
            if (key === 'enemy_bullet') {
                this.gameGraphics.fillStyle(0xf97316, 0.95);
                this.gameGraphics.fillCircle(eb.x, eb.y, 6);
            } else {
                // Rocket homing missile
                this.gameGraphics.fillStyle(0xef4444, 1);
                this.gameGraphics.fillRect(eb.x - 8, eb.y - 4, 16, 8);
                this.gameGraphics.fillStyle(0xeab308, 0.8);
                this.gameGraphics.fillRect(eb.x - 12, eb.y - 2, 4, 4);
            }
        });

        // Draw enemies vector blocks
        this.enemies.getChildren().forEach((enemy: any) => {
            const flip = enemy.flipX;
            const ex = enemy.x;
            const ey = enemy.y;
            const type = enemy.getData('type');

            if (type === 'drone_scout') {
                this.gameGraphics.fillStyle(0xf97316, 1);
                this.gameGraphics.fillCircle(ex, ey, 10);
                this.gameGraphics.fillStyle(0x1e293b, 1);
                this.gameGraphics.fillRect(ex - (flip ? -8 : 10), ey - 5, 2, 10);
                this.gameGraphics.fillStyle(0x00f0ff, 1);
                this.gameGraphics.fillCircle(ex - (flip ? 4 : 4), ey - 2, 3);
            }
            else if (type === 'street_gang') {
                this.gameGraphics.fillStyle(0xa855f7, 1); // Mohawk
                this.gameGraphics.fillRect(ex - 2, ey - 20, 4, 8);
                this.gameGraphics.fillStyle(0xffdbb5, 1); // Face
                this.gameGraphics.fillRect(ex - 6, ey - 12, 12, 12);
                this.gameGraphics.fillStyle(0xeab308, 1); // Coat
                this.gameGraphics.fillRect(ex - 10, ey, 20, 16);
                this.gameGraphics.fillStyle(0x0a1128, 1); // Legs
                this.gameGraphics.fillRect(ex - 8, ey + 16, 16, 4);
            }
            else if (type === 'laser_turret') {
                this.gameGraphics.fillStyle(0x475569, 1);
                this.gameGraphics.fillRect(ex - 8, ey - 8, 16, 16);
                this.gameGraphics.fillStyle(0x1e293b, 1);
                this.gameGraphics.fillRect(ex - 12, ey + 8, 24, 6);
                this.gameGraphics.fillStyle(0xef4444, 1);
                this.gameGraphics.fillRect(ex - 3, ey - 14, 6, 6);
            }
            else if (type === 'security_robot') {
                this.gameGraphics.fillStyle(0x1e40af, 1); // Blue
                this.gameGraphics.fillRect(ex - 12, ey - 8, 24, 20);
                this.gameGraphics.fillStyle(0x64748b, 1); // Treads
                this.gameGraphics.fillRect(ex - 14, ey + 12, 28, 6);
                this.gameGraphics.fillStyle(0x38bdf8, 1); // Visor
                this.gameGraphics.fillRect(flip ? ex - 10 : ex + 2, ey - 4, 8, 6);
            }
            else if (type === 'mutated_cyborg') {
                this.gameGraphics.fillStyle(0x22c55e, 1); // Green slime
                this.gameGraphics.fillRect(ex - 8, ey - 12, 16, 24);
                this.gameGraphics.fillStyle(0xa855f7, 1); // Cyber limb
                this.gameGraphics.fillRect(flip ? ex + 8 : ex - 12, ey - 4, 4, 12);
            }
            else if (type === 'heavy_mech') {
                this.gameGraphics.fillStyle(0x334155, 1);
                this.gameGraphics.fillRect(ex - 20, ey - 20, 40, 24);
                this.gameGraphics.fillStyle(0x1e293b, 1); // Legs
                this.gameGraphics.fillRect(ex - 14, ey + 4, 8, 16);
                this.gameGraphics.fillRect(ex + 6, ey + 4, 8, 16);
                this.gameGraphics.fillStyle(0xef4444, 1); // Red eye
                this.gameGraphics.fillRect(flip ? ex - 16 : ex + 10, ey - 12, 6, 4);
            }
            else if (type === 'jetpack_soldier') {
                this.gameGraphics.fillStyle(0x5b21b6, 1);
                this.gameGraphics.fillRect(ex - 8, ey - 10, 16, 20);
                this.gameGraphics.fillStyle(0xf97316, 1); // Jetpack
                this.gameGraphics.fillRect(flip ? ex + 8 : ex - 14, ey - 4, 6, 12);
                this.gameGraphics.fillStyle(0xef4444, 1); // Thrust flame
                this.gameGraphics.fillRect(flip ? ex + 9 : ex - 13, ey + 8, 4, 6);
            }
            else if (type === 'ai_assassin') {
                this.gameGraphics.fillStyle(0x090d16, 1); // Dark shroud
                this.gameGraphics.fillRect(ex - 8, ey - 12, 16, 24);
                this.gameGraphics.fillStyle(0xff0055, 1); // Crimson slits
                this.gameGraphics.fillRect(flip ? ex - 6 : ex + 2, ey - 8, 4, 2);
            }

            // Draw Enemy Health Bar
            const hp = enemy.getData('health');
            let maxHp = 1;
            if (type === 'security_robot') maxHp = 2;
            if (type === 'mutated_cyborg') maxHp = 2;
            if (type === 'heavy_mech') maxHp = 5;
            if (type === 'ai_assassin') maxHp = 3;
            
            if (hp < maxHp || maxHp > 1) {
                const barWidth = 24;
                const barHeight = 4;
                const barX = ex - barWidth / 2;
                const barY = ey - (enemy.body ? enemy.body.height / 2 : 20) - 8;
                
                this.gameGraphics.fillStyle(0x1e293b, 0.8);
                this.gameGraphics.fillRect(barX, barY, barWidth, barHeight);
                
                const pct = Math.max(0, hp / maxHp);
                this.gameGraphics.fillStyle(0x22c55e, 0.95);
                this.gameGraphics.fillRect(barX, barY, barWidth * pct, barHeight);
                
                this.gameGraphics.lineStyle(0.5, 0x000000, 1);
                this.gameGraphics.strokeRect(barX, barY, barWidth, barHeight);
            }
        });

        // Draw Boss
        if (this.isBossSpawned && this.boss && this.boss.active) {
            const bx = this.boss.x;
            const by = this.boss.y;
            const level = this.level;
            
            // Damage Flash Overlay
            if (this.bossFlashFrames > 0 && this.bossFlashFrames % 2 === 0) {
                this.gameGraphics.fillStyle(0xffffff, 0.95);
                this.gameGraphics.fillRect(bx - 32, by - 32, 64, 64);
                return;
            }

            if (level === 1) {
                // Drone Commander (Orange heavy hover-ship)
                this.gameGraphics.fillStyle(0xf97316, 1);
                this.gameGraphics.fillRect(bx - 24, by - 16, 48, 32);
                this.gameGraphics.fillStyle(0x1e293b, 1);
                this.gameGraphics.fillRect(bx - 16, by - 24, 32, 48);
                this.gameGraphics.fillStyle(0x00f0ff, 1); // Visor bar
                this.gameGraphics.fillRect(bx - 12, by, 24, 6);
            }
            else if (level === 2) {
                // Heavy Turret Bot
                this.gameGraphics.fillStyle(0x64748b, 1);
                this.gameGraphics.fillRect(bx - 24, by + 12, 48, 16);
                this.gameGraphics.fillStyle(0x334155, 1); // Core turret rotation unit
                this.gameGraphics.fillRect(bx - 16, by - 16, 32, 28);
                this.gameGraphics.fillStyle(0xef4444, 1); // Visor sensor eye
                this.gameGraphics.fillRect(bx - 6, by - 12, 12, 6);
            }
            else if (level === 3) {
                // Gang Leader mohawk
                this.gameGraphics.fillStyle(0xec4899, 1);
                this.gameGraphics.fillRect(bx - 6, by - 32, 12, 16);
                this.gameGraphics.fillStyle(0xffdbb5, 1); // Face
                this.gameGraphics.fillRect(bx - 10, by - 16, 20, 16);
                this.gameGraphics.fillStyle(0xa855f7, 1); // Coat
                this.gameGraphics.fillRect(bx - 16, by, 32, 32);
            }
            else if (level === 4) {
                // Metro AI monitor console
                this.gameGraphics.fillStyle(0x1e293b, 1);
                this.gameGraphics.fillRect(bx - 32, by - 32, 64, 64);
                this.gameGraphics.fillStyle(0x020617, 1);
                this.gameGraphics.fillRect(bx - 24, by - 24, 48, 48);
                this.gameGraphics.fillStyle(0xef4444, 0.3); // Red eye
                this.gameGraphics.fillCircle(bx, by, 16);
                this.gameGraphics.fillStyle(0xffffff, 0.95);
                this.gameGraphics.fillCircle(bx, by, 6);
            }
            else if (level === 5) {
                // Experimental Android
                this.gameGraphics.fillStyle(0x94a3b8, 1); // Silver
                this.gameGraphics.fillRect(bx - 10, by - 12, 20, 24);
                this.gameGraphics.fillStyle(0x020617, 1); // Face
                this.gameGraphics.fillRect(bx - 6, by - 22, 12, 10);
                this.gameGraphics.fillStyle(0xef4444, 1); // Red eyes
                this.gameGraphics.fillRect(bx - 4, by - 18, 8, 2);
            }
            else if (level === 6) {
                // Defense Core
                this.gameGraphics.fillStyle(0x3b82f6, 0.4); // Shield
                this.gameGraphics.fillCircle(bx, by, 28);
                this.gameGraphics.fillStyle(0x1e293b, 1); // Frame
                this.gameGraphics.fillRect(bx - 16, by - 16, 32, 32);
                this.gameGraphics.fillStyle(0x00f0ff, 1); // Hacking core
                this.gameGraphics.fillCircle(bx, by, 8);
            }
            else if (level === 7) {
                // Titan Mech
                this.gameGraphics.fillStyle(0x0f172a, 1); // Main frame
                this.gameGraphics.fillRect(bx - 32, by - 32, 64, 48);
                this.gameGraphics.fillStyle(0x475569, 1); // Legs
                this.gameGraphics.fillRect(bx - 24, by + 16, 12, 16);
                this.gameGraphics.fillRect(bx + 12, by + 16, 12, 16);
                this.gameGraphics.fillStyle(0xef4444, 1); // Red scope
                this.gameGraphics.fillRect(bx - 16, by - 20, 32, 6);
            }
            else if (level === 8) {
                // Sky Hunter aircraft
                this.gameGraphics.fillStyle(0x0284c7, 1); // Body
                this.gameGraphics.fillRect(bx - 24, by - 12, 48, 24);
                this.gameGraphics.fillStyle(0x0f172a, 1); // Wings
                this.gameGraphics.fillRect(bx - 40, by - 4, 16, 6);
                this.gameGraphics.fillRect(bx + 24, by - 4, 16, 6);
            }
            else if (level === 9) {
                // General cape
                this.gameGraphics.fillStyle(0xef4444, 1);
                this.gameGraphics.fillRect(bx - 14, by - 8, 28, 40);
                this.gameGraphics.fillStyle(0x1e293b, 1); // Body
                this.gameGraphics.fillRect(bx - 10, by - 10, 20, 34);
                this.gameGraphics.fillStyle(0xffdbb5, 1); // Face
                this.gameGraphics.fillRect(bx - 6, by - 22, 12, 12);
            }
            else {
                // Level 10 Omega AI Forms
                if (this.bossPhase === 1) {
                    this.gameGraphics.fillStyle(0x1e293b, 1);
                    this.gameGraphics.fillRect(bx - 24, by - 32, 48, 64);
                    this.gameGraphics.fillStyle(0xa855f7, 0.4);
                    this.gameGraphics.fillRect(bx - 16, by - 16, 32, 32);
                    this.gameGraphics.fillStyle(0xffffff, 1);
                    this.gameGraphics.fillCircle(bx, by, 6);
                } else if (this.bossPhase === 2) {
                    this.gameGraphics.fillStyle(0x020210, 0.85);
                    this.gameGraphics.fillRect(bx - 32, by - 32, 64, 64);
                    this.gameGraphics.fillStyle(0x00f0ff, 1); // Cyborg face monitor
                    this.gameGraphics.fillRect(bx - 20, by - 12, 10, 5);
                    this.gameGraphics.fillRect(bx + 10, by - 12, 10, 5);
                    this.gameGraphics.fillRect(bx - 12, by + 10, 24, 3);
                } else {
                    this.gameGraphics.fillStyle(0x1e293b, 1);
                    this.gameGraphics.strokeCircle(bx, by, 40);
                    this.gameGraphics.fillStyle(0xa855f7, 0.25);
                    this.gameGraphics.fillCircle(bx, by, 32);
                    this.gameGraphics.fillStyle(0xff00ff, 0.95);
                    this.gameGraphics.fillCircle(bx, by, 16);
                }
            }
        }
    }

    drawBossHPBar() {
        if (!this.isBossSpawned || !this.boss || !this.boss.active) return;
        
        const camX = this.cameras.main.scrollX;
        const camY = this.cameras.main.scrollY;
        
        // Render Boss HP bar on top screen relative to camera
        const bx = camX + 250;
        const by = camY + 25;
        const bw = 300;
        const bh = 14;

        this.gameGraphics.fillStyle(0x1e293b, 0.7);
        this.gameGraphics.fillRect(bx, by, bw, bh);

        const hpPct = Math.max(0, this.bossHp / this.bossMaxHp);
        this.gameGraphics.fillStyle(0xef4444, 0.95);
        this.gameGraphics.fillRect(bx, by, bw * hpPct, bh);

        this.gameGraphics.lineStyle(1.5, 0xffffff, 1);
        this.gameGraphics.strokeRect(bx, by, bw, bh);
        
        if (this.bossText && this.level === 10) {
            this.bossText.setText(`OMEGA AI CORE — PH ${this.bossPhase}`);
        }
    }

    // ============================================================
    // O. SPARKS PARTICLES SYSTEM
    // ============================================================
    createVisualSparks(x: number, y: number, color: number, count = 8) {
        for (let i = 0; i < count; i++) {
            const rad = Math.random() * Math.PI * 2;
            const spd = 1.5 + Math.random() * 4;
            this.sparks.push({
                x,
                y,
                vx: Math.cos(rad) * spd,
                vy: Math.sin(rad) * spd,
                alpha: 1.0,
                color
            });
        }
    }

    // ============================================================
    // P. HACKING ACTION OVERLAP
    // ============================================================
    teleportEnemyNearPlayer(enemy: any) {
        // Shadow teleport visual flare
        this.createVisualSparks(enemy.x, enemy.y, 0xff00ff, 12);
        
        const telX = this.player.x + (this.rng.between(0, 1) === 1 ? 120 : -120);
        enemy.x = telX;
        enemy.y = this.player.y - 10;
        this.createVisualSparks(telX, enemy.y, 0xff00ff, 12);
    }

    // ============================================================
    // Q. LEVEL TRANSITIONS & TELEMETRY SUBMITTERS
    // ============================================================
    triggerVictory() {
        const duration = Date.now() - this.startTime;
        
        if (this.registry.get('arenaMode')) {
            const nextLvl = Math.min(10, this.level + 1);
            EventBus.emit('level-changed', nextLvl);
            this.scene.start('CyberRunnerScene', {
                level: nextLvl,
                score: this.score
            });
            return;
        }

        EventBus.emit('save-run', {
            level: this.level,
            score: this.score,
            scoreEarned: this.score - this.startScore,
            combo: this.maxCombo,
            duration,
            completed: true
        });

        this.scene.start('CyberRunnerLevelCompleteScene', {
            level: this.level,
            score: this.score,
            combo: this.maxCombo
        });
    }

    gameOver() {
        if (this.isTransitioning || this.isMatchOver) return;
        this.isTransitioning = true;
        this.isMatchOver = true; // Stop all update-loop logic immediately
        if (this.bossText) {
            this.bossText.destroy();
            this.bossText = null;
        }

        const duration = Date.now() - this.startTime;

        // Emit save-run asynchronously but DO NOT wait for it before transitioning
        EventBus.emit('save-run', {
            level: this.level,
            score: this.score,
            scoreEarned: this.score - this.startScore,
            combo: this.maxCombo,
            duration,
            completed: false
        });

        // Transition to Game Over scene after short delay for death FX
        this.time.delayedCall(600, () => {
            this.scene.start('CyberRunnerGameOverScene', {
                level: this.level,
                score: this.score
            });
        });
    }
}
