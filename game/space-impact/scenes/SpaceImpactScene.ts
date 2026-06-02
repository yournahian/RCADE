import Phaser, { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

// ============================================================
// 1. SOUND ENGINE INTEGRATION HOOKS
// ============================================================
class SoundManager {
    static playSFX(path: string) {
        try {
            const audio = new Audio(path);
            audio.volume = 0.35;
            audio.play().catch(e => {
                // Safe catch for modern browser autoplay policies
                console.warn('[SoundManager] SFX playback prevented by autoplay limits:', e.message);
            });
        } catch (err) {
            console.warn('[SoundManager] HTML5 Audio failed:', err);
        }
    }
}

// ============================================================
// 2. DETERMINISTIC PROCEDURAL SEED GENERATOR
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
// 3. LEVEL CONFIGURATION SCHEMA
// ============================================================
interface LevelConfig {
    name: string;
    targetKills: number;
    spawnDelay: number;
    enemyHealthMultiplier: number;
    gradientColors: [number, number]; // WebGL-compatible gradient colors
}

const LEVEL_CONFIGS: LevelConfig[] = [
    {
        name: "Neon Outskirts",
        targetKills: 20,
        spawnDelay: 1800,
        enemyHealthMultiplier: 1.0,
        gradientColors: [0x020208, 0x0a0520]
    },
    {
        name: "Cyber Sector",
        targetKills: 25,
        spawnDelay: 1300,
        enemyHealthMultiplier: 1.4,
        gradientColors: [0x05020c, 0x150025]
    },
    {
        name: "The Core Matrix",
        targetKills: 30,
        spawnDelay: 950,
        enemyHealthMultiplier: 1.8,
        gradientColors: [0x0a000a, 0x250005]
    }
];

// ============================================================
// 4. MAIN GAMEPLAY SCENE
// ============================================================
export class SpaceImpactScene extends Scene {
    // Game Entities
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: any;
    wasd!: any;
    
    // Groups
    playerLasers!: Phaser.Physics.Arcade.Group;
    alienEnemies!: Phaser.Physics.Arcade.Group;
    enemyProjectiles!: Phaser.Physics.Arcade.Group;
    powerups!: Phaser.Physics.Arcade.Group;
    
    // Stats & HUD
    score = 0;
    startScore = 0;
    level = 1;
    targetScore = 1500;
    shields = 100;
    lives = 3;
    killsCount = 0;
    isTransitioning = false;
    isMatchOver = false;
    startTime = 0;
    
    // Combo Multiplier
    combo = 1.0;
    maxCombo = 1.0;
    timeSinceLastKill = 0;
    hasKilledFirstEnemy = false;
    lastEmittedCombo = 1.0;

    // Player fire controls
    lastFireTime = 0;
    fireRateInterval = 150; // Strict 150ms cooldown as per spec (anti-cheat safe)

    // Graphics Overlay (Direct Render Pipeline)
    gameGraphics!: Phaser.GameObjects.Graphics;

    // Advanced Visuals Arrays
    trailParticles: Array<{ x: number, y: number, vx: number, vy: number, alpha: number, size: number, color: number }> = [];
    explosionParticles: Array<{ x: number, y: number, vx: number, vy: number, alpha: number, size: number, color: number }> = [];

    // Screen Shake Matrix
    shakeIntensity = 0;

    // Damage Flash Counters (Solid White composite flash)
    playerFlashFrames = 0;
    bossFlashFrames = 0;

    // Boss Fight Architecture
    isBossSpawned = false;
    boss: Phaser.Physics.Arcade.Sprite | null = null;
    bossHp = 1000;
    bossMaxHp = 1000;
    bossPhase = 1;
    bossDirection = 1;
    bossWarningLineY = -1;
    bossBeamActive = false;
    bossBeamTimer = 0;
    bossLastFireTime = 0;
    bossLastBeamTime = 0;
    
    // Procedural Seeded Generation
    rng!: SeededRandom;
    spawnTimer!: Phaser.Time.TimerEvent;
    
    // Tactile Controller Velocity Cache
    mobileVelocityX = 0;
    mobileVelocityY = 0;
    
    // Low frequency anti-cheat coordinates
    lastDirChangeTime = 0;
    prevLoggedX = 0;
    prevLoggedY = 0;
    
    boundHandleMobileInput!: (action: string) => void;
    boundHandleMatchCompleted!: (data: any) => void;

    constructor() {
        super('SpaceImpactScene');
    }

    init(data: any) {
        this.level = data.level || 1;
        this.score = data.score || 0;
        this.startScore = this.score;
        this.shields = 100;
        this.lives = 3;
        this.killsCount = 0;
        this.isBossSpawned = false;
        this.boss = null;
        this.bossHp = 1000;
        this.bossMaxHp = 1000;
        this.bossPhase = 1;
        this.bossWarningLineY = -1;
        this.bossBeamActive = false;
        this.trailParticles = [];
        this.explosionParticles = [];
        this.shakeIntensity = 0;
        this.playerFlashFrames = 0;
        this.bossFlashFrames = 0;
    }

    create() {
        this.isTransitioning = false;
        this.isMatchOver = false;
        this.startTime = Date.now();
        this.combo = 1.0;
        this.maxCombo = 1.0;
        this.timeSinceLastKill = 0;
        this.hasKilledFirstEnemy = false;
        this.lastEmittedCombo = 1.0;
        
        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-started');

        // Retrieve level specifications
        const levelIdx = Math.min(LEVEL_CONFIGS.length - 1, Math.max(0, this.level - 1));
        const activeConfig = LEVEL_CONFIGS[levelIdx];
        this.targetScore = this.score + activeConfig.targetKills * 100 + this.level * 200;
        
        EventBus.emit('level-changed', this.level);
        EventBus.emit('score-changed', this.score);
        EventBus.emit('target-changed', this.targetScore);
        EventBus.emit('combo-changed', 1.0);
        EventBus.emit('shields-changed', this.shields);
        EventBus.emit('lives-changed', this.lives);

        // Setup background dim color gradients
        this.cameras.main.setBackgroundColor('#020208');
        this.gameGraphics = this.add.graphics();
        
        // Spawn groups
        this.playerLasers = this.physics.add.group();
        this.alienEnemies = this.physics.add.group();
        this.enemyProjectiles = this.physics.add.group();
        this.powerups = this.physics.add.group();
        
        // Setup Player Ship Physics Bounds (Rendered invisibly, drawn via Graphics)
        this.player = this.physics.add.sprite(100, 300, 'player_ship');
        this.player.setCollideWorldBounds(true);
        this.player.setDrag(1200);
        this.player.setAlpha(0); // Kept invisible, drawn dynamically via vector engine
        
        this.prevLoggedX = this.player.x;
        this.prevLoggedY = this.player.y;

        // Dynamic Cryptographic session seed
        const sessionSeed = this.registry.get('sessionSeed') || Math.random().toString();
        this.rng = new SeededRandom(sessionSeed);

        // Spawner Waves timer
        this.spawnTimer = this.time.addEvent({
            delay: activeConfig.spawnDelay,
            callback: this.spawnEnemyWave,
            callbackScope: this,
            loop: true
        });

        // Collision logic
        this.physics.add.overlap(this.playerLasers, this.alienEnemies, this.handleLaserHit, null, this);
        this.physics.add.overlap(this.player, this.alienEnemies, this.handlePlayerCollision, null, this);
        this.physics.add.overlap(this.player, this.powerups, this.handlePowerupCollect, null, this);
        this.physics.add.overlap(this.player, this.enemyProjectiles, this.handleProjectileCollision, null, this);

        // Keyboard bindings
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = this.input.keyboard.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D
            });
        }

        // Mobile listeners
        this.boundHandleMobileInput = (action: string) => {
            if (this.isTransitioning) return;
            const speed = 360;
            switch(action) {
                case 'up':
                    this.mobileVelocityY = -speed;
                    break;
                case 'down':
                    this.mobileVelocityY = speed;
                    break;
                case 'left':
                    this.mobileVelocityX = -speed;
                    break;
                case 'right':
                    this.mobileVelocityX = speed;
                    break;
                case 'stop-up':
                case 'stop-down':
                    this.mobileVelocityY = 0;
                    break;
                case 'stop-left':
                case 'stop-right':
                    this.mobileVelocityX = 0;
                    break;
                case 'stop-all':
                    this.mobileVelocityX = 0;
                    this.mobileVelocityY = 0;
                    break;
                case 'fire':
                    this.fireLaser();
                    break;
            }
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
            if (this.player && this.player.body) {
                try {
                    this.player.setVelocity(0, 0);
                } catch {}
            }
            if (this.spawnTimer) {
                try {
                    this.spawnTimer.destroy();
                } catch {}
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
            if (this.spawnTimer) this.spawnTimer.destroy();
        });
    }

    update(time: number, delta: number) {
        if (this.isMatchOver) {
            return;
        }
        if (this.isTransitioning) return;

        // Direct Render Overlay Setup
        this.gameGraphics.clear();
        const levelIdx = Math.min(LEVEL_CONFIGS.length - 1, Math.max(0, this.level - 1));
        const activeConfig = LEVEL_CONFIGS[levelIdx];
        
        // Draw gorgeous neon gradient backing
        this.gameGraphics.fillGradientStyle(
            activeConfig.gradientColors[0], activeConfig.gradientColors[1],
            activeConfig.gradientColors[0], activeConfig.gradientColors[1], 
            this.isBossSpawned ? 0.35 : 0.8
        );
        this.gameGraphics.fillRect(0, 0, 800, 600);

        // Core Gameplay loop pause handles
        if (this.isTransitioning) {
            this.drawParticles();
            this.drawPlayerShip();
            if (this.boss) this.drawBoss();
            return;
        }

        // ============================================================
        // A. PHYSICS & MOVEMENT CONTROLS
        // ============================================================
        let vx = 0;
        let vy = 0;
        const speed = 360;

        if (this.cursors) {
            if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -speed;
            else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = speed;
            
            if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -speed;
            else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = speed;
        }

        if (this.mobileVelocityX !== 0) vx = this.mobileVelocityX;
        if (this.mobileVelocityY !== 0) vy = this.mobileVelocityY;

        this.player.setVelocity(vx, vy);

        // Limit coordinates telemetry output size (below 250 records)
        const distMoved = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.prevLoggedX, this.prevLoggedY);
        if (time - this.lastDirChangeTime > 250 && distMoved > 10) {
            const dx = vx !== 0 ? vx / speed : 0;
            const dy = vy !== 0 ? vy / speed : 0;
            
            EventBus.emit('direction-changed', {
                x: Math.round(this.player.x),
                y: Math.round(this.player.y),
                dx,
                dy
            });
            this.prevLoggedX = this.player.x;
            this.prevLoggedY = this.player.y;
            this.lastDirChangeTime = time;
        }

        if (this.cursors && this.cursors.space.isDown) {
            this.fireLaser();
        }

        // ============================================================
        // B. ADVANCED ENEMY AI PROCESSING LOOP
        // ============================================================
        this.alienEnemies.getChildren().forEach((alien: any) => {
            if (!alien.active) return;
            const type = alien.getData('type');

            if (type === 'drone') {
                // Drone Sine-wave movement patterns
                const baseY = alien.getData('baseY');
                const amplitude = 60;
                alien.y = baseY + Math.sin((time + alien.getData('seed')) * 0.003) * amplitude;
                alien.body.setVelocityX(-130);

                // Shoot energy orb targeted every 1.5s
                const lastFire = alien.getData('lastFire') || 0;
                if (time - lastFire > 1500) {
                    alien.setData('lastFire', time);
                    this.fireEnemyProjectile(alien.x - 20, alien.y, 'orb');
                }
            } 
            else if (type === 'interceptor') {
                // Track player y axis slightly
                const diffY = this.player.y - alien.y;
                const trackingSpeed = Math.abs(diffY) > 8 ? (diffY > 0 ? 80 : -80) : 0;
                alien.body.setVelocity(alien.getData('speedX'), trackingSpeed);

                // Dual spread spread fire every 1.8s
                const lastFire = alien.getData('lastFire') || 0;
                if (time - lastFire > 1800) {
                    alien.setData('lastFire', time);
                    this.fireEnemyProjectile(alien.x - 20, alien.y - 8, 'laser', -10);
                    this.fireEnemyProjectile(alien.x - 20, alien.y + 8, 'laser', 10);
                }
            } 
            else if (type === 'kamikaze') {
                // Accelerate rapidly towards player when crossing middle
                if (alien.x < 500 && !alien.getData('charged')) {
                    alien.setData('charged', true);
                    alien.setTint(0xff0000);
                    // Rapid acceleration dash
                    const angle = Phaser.Math.Angle.Between(alien.x, alien.y, this.player.x, this.player.y);
                    alien.body.setVelocity(Math.cos(angle) * 480, Math.sin(angle) * 480);
                } else if (!alien.getData('charged')) {
                    alien.body.setVelocityX(-180);
                }
            }
        });

        // ============================================================
        // C. CAPITAL BOSS FIGHT ARCHITECTURE
        // ============================================================
        if (this.isBossSpawned && this.boss && this.boss.active) {
            // Boss Movement patterns
            if (this.bossPhase === 1) {
                // Smooth up/down patrol slide
                this.boss.body.setVelocityY(this.bossDirection * 100);
                if (this.boss.y < 120) this.bossDirection = 1;
                if (this.boss.y > 480) this.bossDirection = -1;

                // Fire continuous 3-projectile spreads every 2 seconds
                if (time - this.bossLastFireTime > 2000) {
                    this.bossLastFireTime = time;
                    SoundManager.playSFX('/audio/boss-laser.mp3');
                    this.fireEnemyProjectile(this.boss.x - 45, this.boss.y, 'laser', 0);
                    this.fireEnemyProjectile(this.boss.x - 45, this.boss.y, 'laser', -15);
                    this.fireEnemyProjectile(this.boss.x - 45, this.boss.y, 'laser', 15);
                }
            } else {
                // Phase 2: Hyper aggression. Faster movement & Crimson tint
                this.boss.body.setVelocityY(this.bossDirection * 180);
                if (this.boss.y < 120) this.bossDirection = 1;
                if (this.boss.y > 480) this.bossDirection = -1;

                // Fire targeted homing missiles or massive plasma beam charge
                if (time - this.bossLastFireTime > 2500) {
                    this.bossLastFireTime = time;
                    this.fireEnemyProjectile(this.boss.x - 30, this.boss.y - 20, 'homing');
                    this.fireEnemyProjectile(this.boss.x - 30, this.boss.y + 20, 'homing');
                }

                // Charge-up massive plasma beam every 6.5 seconds
                if (!this.bossBeamActive && time - this.bossLastBeamTime > 6500) {
                    this.bossLastBeamTime = time;
                    this.bossWarningLineY = this.boss.y;
                    this.bossBeamTimer = time;
                    SoundManager.playSFX('/audio/boss-laser.mp3');
                }

                // Warn for exactly 1 second, then activate plasma beam for 1.2 seconds
                if (this.bossWarningLineY !== -1) {
                    if (time - this.bossBeamTimer > 1000) {
                        this.bossBeamActive = true;
                        this.bossWarningLineY = -1;
                        this.bossBeamTimer = time;
                        this.shakeIntensity = 12; // Rumble screen shake
                    }
                }

                if (this.bossBeamActive) {
                    if (time - this.bossBeamTimer > 1200) {
                        this.bossBeamActive = false;
                    } else {
                        // Continuous plasma collision damage checks on player Y bounds
                        if (Math.abs(this.player.y - this.boss.y) < 45 && this.player.x < this.boss.x) {
                            this.takeDamage(2.5); // Fast tick damage
                        }
                    }
                }
            }
        }

        // ============================================================
        // D. JUICE & EFFECTS COMPILING
        // ============================================================
        // Thruster trailing sparks
        this.trailParticles.push({
            x: this.player.x - 16,
            y: this.player.y + this.rng.between(-5, 5),
            vx: -3.5 - this.rng.next() * 3,
            vy: this.rng.between(-1, 1),
            alpha: 1.0,
            size: this.rng.between(3, 7),
            color: this.rng.next() > 0.5 ? 0x00f0ff : 0xff00ff // Neon Cyan & Neon Magenta
        });

        // Update trail particles
        this.trailParticles = this.trailParticles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.035;
            return p.alpha > 0;
        });

        // Update combustion explosion bursts
        this.explosionParticles = this.explosionParticles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.025;
            p.size = Math.max(0.2, p.size - 0.05);
            return p.alpha > 0;
        });

        // Screen Shake calculation with dampening
        if (this.shakeIntensity > 0.1) {
            const sx = this.rng.between(-this.shakeIntensity, this.shakeIntensity);
            const sy = this.rng.between(-this.shakeIntensity, this.shakeIntensity);
            this.cameras.main.scrollX = sx;
            this.cameras.main.scrollY = sy;
            this.shakeIntensity *= 0.90; // Damp 10% per frame
        } else {
            this.cameras.main.scrollX = 0;
            this.cameras.main.scrollY = 0;
            this.shakeIntensity = 0;
        }

        // Damage flash tracking
        if (this.playerFlashFrames > 0) this.playerFlashFrames--;
        if (this.bossFlashFrames > 0) this.bossFlashFrames--;

        // Combo decay checks
        if (this.hasKilledFirstEnemy) {
            this.timeSinceLastKill += delta;
            if (this.combo > 1.0) {
                this.combo -= (delta / 1000) * 0.15; // Lose 0.15 multi per second
                if (this.combo < 1.0) this.combo = 1.0;
                if (Math.abs(this.combo - this.lastEmittedCombo) >= 0.1 || this.combo === 1.0) {
                    this.lastEmittedCombo = this.combo;
                    EventBus.emit('combo-changed', this.combo);
                }
            }
        }

        // Out of bounds sweep handles
        this.playerLasers.getChildren().forEach((laser: any) => {
            if (laser && laser.active && laser.x > 820) laser.destroy();
        });
        this.enemyProjectiles.getChildren().forEach((proj: any) => {
            if (proj && proj.active && (proj.x < -30 || proj.x > 850)) proj.destroy();
        });
        this.alienEnemies.getChildren().forEach((alien: any) => {
            if (alien && alien.active && alien.x < -40) alien.destroy();
        });

        // Render dynamic entities
        this.drawParticles();
        this.drawPlayerShip();
        this.drawEnemies();
        this.drawProjectiles();
        this.drawBoss();
        this.drawHUD(); // Added premium HUD layer
    }

    // ============================================================
    // E. COMBAT WEAPONRY SYSTEM
    // ============================================================
    fireLaser() {
        const timeNow = this.time.now;
        if (timeNow - this.lastFireTime < this.fireRateInterval) return;
        this.lastFireTime = timeNow;

        // Spawn physical bounds cyan bullet
        const laser = this.playerLasers.create(this.player.x + 22, this.player.y, 'cyan_laser');
        if (laser) {
            laser.body.setVelocityX(700);
            laser.setAlpha(0); // Invisible, drawn via Graphics loop
            SoundManager.playSFX('/audio/laser.mp3');

            EventBus.emit('telemetry-event', {
                e: 'fire',
                x: Math.round(this.player.x),
                y: Math.round(this.player.y)
            });
        }
    }

    fireEnemyProjectile(x: number, y: number, type: string, angleDegree = 0) {
        const proj = this.enemyProjectiles.create(x, y, 'cyan_laser');
        if (proj) {
            proj.setAlpha(0);
            proj.setData('type', type);

            if (type === 'orb') {
                // Target player position
                const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
                proj.body.setVelocity(Math.cos(angle) * 220, Math.sin(angle) * 220);
            } 
            else if (type === 'laser') {
                const rad = Phaser.Math.DegToRad(180 + angleDegree);
                proj.body.setVelocity(Math.cos(rad) * 320, Math.sin(rad) * 320);
            }
            else if (type === 'homing') {
                proj.body.setVelocityX(-200);
                this.tweens.add({
                    targets: proj.body.velocity,
                    y: (this.player.y > y ? 180 : -180),
                    duration: 1000,
                    ease: 'Quad.easeInOut'
                });
            }
        }
    }

    // ============================================================
    // F. ENEMY PROCEDURAL WAVE GENERATION
    // ============================================================
    spawnEnemyWave() {
        if (this.isTransitioning || this.isBossSpawned) return;
        
        const levelIdx = Math.min(LEVEL_CONFIGS.length - 1, Math.max(0, this.level - 1));
        const activeConfig = LEVEL_CONFIGS[levelIdx];
        
        // Dynamic procedural count based on LCG SeededRandom
        const count = this.rng.between(1, 2 + Math.floor(this.level / 2));
        
        for (let i = 0; i < count; i++) {
            const rx = 840 + this.rng.between(0, 140);
            const ry = this.rng.between(60, 540);
            
            // AI Archetypes: 50% Drone, 35% Interceptor, 15% Kamikaze
            const roll = this.rng.next();
            let type = 'drone';
            let health = 1;
            
            if (roll > 0.85) {
                type = 'kamikaze';
                health = 1;
            } else if (roll > 0.50) {
                type = 'interceptor';
                health = 2;
            }
            
            // Apply scale-aware health multipliers
            health = Math.round(health * activeConfig.enemyHealthMultiplier);
            
            const enemy = this.alienEnemies.create(rx, ry, 'alien_grunt');
            if (enemy) {
                enemy.setAlpha(0);
                enemy.setData('type', type);
                enemy.setData('health', health);
                enemy.setData('maxHealth', health);
                enemy.setData('baseY', ry);
                enemy.setData('seed', this.rng.between(0, 5000));
                enemy.setData('speedX', -120 - this.rng.between(0, 60));
                enemy.setData('lastFire', 0);
            }
        }
    }

    // ============================================================
    // G. PHYSICS COLLISION AUDITING
    // ============================================================
    handleLaserHit(obj1: any, obj2: any) {
        let laser: Phaser.Physics.Arcade.Sprite;
        let enemy: Phaser.Physics.Arcade.Sprite;

        // Dynamically resolve argument ordering due to Phaser Group vs Sprite overlap callback rules
        if (obj1.texture && obj1.texture.key === 'cyan_laser') {
            laser = obj1;
            enemy = obj2;
        } else {
            laser = obj2;
            enemy = obj1;
        }
        
        laser.destroy();
        
        // Trigger visual combat sparks
        this.createVisualExplosion(laser.x, laser.y, 0x00f0ff, 4, 3);
        SoundManager.playSFX('/audio/player-hit.mp3');

        // Capital boss Shield mechanics check (Absorbs lasers from the front)
        const isBoss = enemy.getData('isBoss') === true;
        if (this.isBossSpawned && isBoss) {
            if (this.bossPhase === 1) {
                // front shield coordinates detection
                if (laser.x < enemy.x - 30) {
                    this.createVisualExplosion(laser.x, laser.y, 0x00ffff, 8, 4);
                    this.shakeIntensity = 3;
                    return; // Completely absorbed! Zero damage
                }
            }
            
            // Hit boss weak spot
            this.bossHp -= 35;
            this.bossFlashFrames = 2; // 2 frame compositing damage flash
            this.shakeIntensity = 6;
            
            // Phase 2 transition checks (HP below 40%)
            if (this.bossPhase === 1 && this.bossHp <= 400) {
                this.bossPhase = 2;
                this.shakeIntensity = 18;
                this.createVisualExplosion(this.boss.x, this.boss.y, 0xff00ff, 32, 6);
                SoundManager.playSFX('/audio/explosion.mp3');
            }
            
            if (this.bossHp <= 0) {
                enemy.destroy();
                this.triggerBossDefeated();
            }
            return;
        }

        let hp = enemy.getData('health') - 1;
        enemy.setData('health', hp);
        
        // Rapid white damage feedback flash indicators
        enemy.setData('flashFrames', 2);
        
        if (hp <= 0) {
            const isElite = enemy.getData('type') === 'interceptor';
            const basePoints = isElite ? 120 : 50;
            
            this.createVisualExplosion(enemy.x, enemy.y, isElite ? 0xffea00 : 0xff007c, 14, 5);
            enemy.destroy();
            SoundManager.playSFX('/audio/explosion.mp3');

            // Build combo points
            if (!this.hasKilledFirstEnemy) {
                this.hasKilledFirstEnemy = true;
                this.combo = 1.0;
            } else {
                const bonus = Math.max(0.1, 1.2 - (this.timeSinceLastKill / 2800));
                this.combo += bonus;
                if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            }
            
            this.timeSinceLastKill = 0;
            this.lastEmittedCombo = this.combo;
            EventBus.emit('combo-changed', this.combo);
            
            this.score += Math.floor(basePoints * this.combo);
            EventBus.emit('score-changed', this.score);
            
            this.killsCount++;
            this.shakeIntensity = Math.min(10, this.shakeIntensity + 4.5);
            
            EventBus.emit('telemetry-event', {
                e: 'kill',
                x: Math.round(enemy.x),
                y: Math.round(enemy.y)
            });

            // Check Boss Spawn criteria
            const levelIdx = Math.min(LEVEL_CONFIGS.length - 1, Math.max(0, this.level - 1));
            const activeConfig = LEVEL_CONFIGS[levelIdx];
            if (this.killsCount >= activeConfig.targetKills && !this.isBossSpawned) {
                this.triggerBossSpawning();
            }
        }
    }

    handlePlayerCollision(playerObj: any, alienObj: any) {
        const enemy = alienObj as Phaser.Physics.Arcade.Sprite;
        
        this.createVisualExplosion(enemy.x, enemy.y, 0xff0055, 12, 5);
        enemy.destroy();
        
        this.takeDamage(20);
    }

    handleProjectileCollision(playerObj: any, projObj: any) {
        const proj = projObj as Phaser.Physics.Arcade.Sprite;
        
        this.createVisualExplosion(proj.x, proj.y, 0xff00ff, 6, 3);
        proj.destroy();
        
        this.takeDamage(12);
    }

    handlePowerupCollect(playerObj: any, pwObj: any) {
        const pw = pwObj as Phaser.Physics.Arcade.Sprite;
        pw.destroy();
        
        this.shields = Math.min(100, this.shields + 25);
        EventBus.emit('shields-changed', this.shields);
        
        this.createVisualExplosion(this.player.x, this.player.y, 0x00ff88, 16, 5);
        SoundManager.playSFX('/audio/player-hit.mp3');
        
        this.score += Math.floor(100 * this.combo);
        EventBus.emit('score-changed', this.score);
        
        EventBus.emit('telemetry-event', {
            e: 'collect',
            x: Math.round(this.player.x),
            y: Math.round(this.player.y)
        });
    }

    takeDamage(amt: number) {
        if (this.isTransitioning) return;
        this.shields -= amt;
        
        this.playerFlashFrames = 2; // 2 frames visual white flash
        this.shakeIntensity = Math.min(15, this.shakeIntensity + 8);
        this.cameras.main.flash(180, 255, 0, 55, false);
        SoundManager.playSFX('/audio/player-hit.mp3');

        EventBus.emit('telemetry-event', {
            e: 'damage',
            x: Math.round(this.player.x),
            y: Math.round(this.player.y)
        });

        if (this.shields <= 0) {
            this.lives--;
            this.shields = 100;
            EventBus.emit('lives-changed', this.lives);
            this.createVisualExplosion(this.player.x, this.player.y, 0xff00aa, 30, 6);
            SoundManager.playSFX('/audio/explosion.mp3');

            if (this.lives <= 0) {
                this.gameOver();
            }
        } else {
            EventBus.emit('shields-changed', this.shields);
        }
    }

    // ============================================================
    // H. GEOMETRICAL GLOW RENDER WRAPPERS (Direct Canvas emulation)
    // ============================================================
    drawPlayerShip() {
        const px = this.player.x;
        const py = this.player.y;
        
        // Define sleek custom polygon coordinates
        const points = [
            { x: px + 22, y: py },     // Nose
            { x: px - 12, y: py - 14 }, // Top outer wing
            { x: px - 6,  y: py - 5 },  // Inner notch top
            { x: px - 6,  y: py + 5 },  // Inner notch bottom
            { x: px - 12, y: py + 14 }  // Bottom outer wing
        ];

        const flash = this.playerFlashFrames > 0;
        
        // 2 frames Solid white compositing flash triggers
        const coreColor = flash ? 0xffffff : 0x050515;
        const lineColor = flash ? 0xffffff : 0x00f0ff;

        // Glowing cyan layered neon strokes
        if (!flash) {
            this.gameGraphics.lineStyle(6, 0x00f0ff, 0.25);
            this.drawPolygonPoints(points);
            this.gameGraphics.lineStyle(4, 0x00f0ff, 0.6);
            this.drawPolygonPoints(points);
        }

        this.gameGraphics.fillStyle(coreColor, 0.85);
        this.gameGraphics.lineStyle(2, lineColor, 1);
        this.drawPolygonPoints(points, true);
    }

    drawEnemies() {
        this.alienEnemies.getChildren().forEach((alien: any) => {
            if (!alien.active) return;
            const x = alien.x;
            const y = alien.y;
            const type = alien.getData('type');
            const flash = alien.getData('flashFrames') > 0;
            
            if (flash) {
                alien.setData('flashFrames', alien.getData('flashFrames') - 1);
            }

            if (type === 'drone') {
                // Hexagonal sleek polygon
                const points = [];
                const radius = 12;
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI) / 3;
                    points.push({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius });
                }
                const lineColor = flash ? 0xffffff : 0x00ff88;
                const fillCol = flash ? 0xffffff : 0x0a1c0d;
                
                if (!flash) {
                    this.gameGraphics.lineStyle(5, 0x00ff88, 0.25);
                    this.drawPolygonPoints(points);
                }
                this.gameGraphics.fillStyle(fillCol, 0.8);
                this.gameGraphics.lineStyle(1.8, lineColor, 1);
                this.drawPolygonPoints(points, true);
            } 
            else if (type === 'interceptor') {
                // Arrow head polygon pointing left
                const points = [
                    { x: x - 15, y: y },     // Nose
                    { x: x + 10, y: y - 12 }, // Top wing
                    { x: x + 4,  y: y },     // Inner notch
                    { x: x + 10, y: y + 12 }  // Bottom wing
                ];
                const lineColor = flash ? 0xffffff : 0xffea00;
                const fillCol = flash ? 0xffffff : 0x1f1c05;

                if (!flash) {
                    this.gameGraphics.lineStyle(5, 0xffea00, 0.25);
                    this.drawPolygonPoints(points);
                }
                this.gameGraphics.fillStyle(fillCol, 0.8);
                this.gameGraphics.lineStyle(1.8, lineColor, 1);
                this.drawPolygonPoints(points, true);
            }
            else if (type === 'kamikaze') {
                // Glitchy red target diamond
                const points = [
                    { x: x,      y: y - 13 },
                    { x: x - 13, y: y },
                    { x: x,      y: y + 13 },
                    { x: x + 13, y: y }
                ];
                const lineColor = flash ? 0xffffff : 0xff003c;
                const fillCol = flash ? 0xffffff : 0x24020a;

                if (!flash) {
                    this.gameGraphics.lineStyle(5, 0xff003c, 0.25);
                    this.drawPolygonPoints(points);
                }
                this.gameGraphics.fillStyle(fillCol, 0.9);
                this.gameGraphics.lineStyle(2, lineColor, 1);
                this.drawPolygonPoints(points, true);
            }
        });
    }

    drawProjectiles() {
        // Draw Player high velocity neon cyan lasers
        this.playerLasers.getChildren().forEach((laser: any) => {
            if (!laser.active) return;
            this.gameGraphics.fillStyle(0x00f0ff, 0.3);
            this.gameGraphics.fillRoundedRect(laser.x - 10, laser.y - 3, 20, 6, 2);
            this.gameGraphics.fillStyle(0xffffff, 1.0);
            this.gameGraphics.fillRoundedRect(laser.x - 7, laser.y - 1.5, 14, 3, 1);
        });

        // Draw Enemy customized weapons
        this.enemyProjectiles.getChildren().forEach((proj: any) => {
            if (!proj.active) return;
            const type = proj.getData('type');

            if (type === 'orb') {
                // Neon energy orb
                this.gameGraphics.fillStyle(0xff00ff, 0.25);
                this.gameGraphics.fillCircle(proj.x, proj.y, 10);
                this.gameGraphics.lineStyle(1.5, 0xffffff, 0.9);
                this.gameGraphics.strokeCircle(proj.x, proj.y, 7);
                this.gameGraphics.fillStyle(0xffffff, 1.0);
                this.gameGraphics.fillCircle(proj.x, proj.y, 4);
            } 
            else if (type === 'laser') {
                // Yellow laser bullets
                this.gameGraphics.fillStyle(0xffaa00, 0.3);
                this.gameGraphics.fillCircle(proj.x, proj.y, 7);
                this.gameGraphics.fillStyle(0xffffff, 1.0);
                this.gameGraphics.fillCircle(proj.x, proj.y, 3);
            }
            else if (type === 'homing') {
                // Purple glowing tracker missile
                this.gameGraphics.fillStyle(0x9d00ff, 0.3);
                this.gameGraphics.fillRect(proj.x - 8, proj.y - 4, 16, 8);
                this.gameGraphics.lineStyle(1.5, 0xff00ff, 1);
                this.gameGraphics.strokeRect(proj.x - 8, proj.y - 4, 16, 8);
                this.gameGraphics.fillStyle(0xffffff, 1.0);
                this.gameGraphics.fillRect(proj.x - 5, proj.y - 2, 10, 4);
            }
        });
    }

    drawBoss() {
        if (!this.isBossSpawned || !this.boss || !this.boss.active) return;
        
        const bx = this.boss.x;
        const by = this.boss.y;
        const flash = this.bossFlashFrames > 0;
        
        // Massive Capital Warship Polygon (80x80 hitbox equivalent)
        const points = [
            { x: bx - 40, y: by - 15 }, // Front nose top
            { x: bx - 40, y: by + 15 }, // Front nose bottom
            { x: bx - 10, y: by + 40 }, // Outer hull forward bottom
            { x: bx + 35, y: by + 40 }, // Rear hull bottom
            { x: bx + 25, y: by + 10 }, // Inner hangar engine cut bottom
            { x: bx + 25, y: by - 10 }, // Inner hangar engine cut top
            { x: bx + 35, y: by - 40 }, // Rear hull top
            { x: bx - 10, y: by - 40 }  // Outer hull forward top
        ];

        const bossColor = this.bossPhase === 1 ? 0x9d00ff : 0xff003c; // Turns crimson in phase 2
        const fillCol = flash ? 0xffffff : 0x080210;
        const strokeCol = flash ? 0xffffff : bossColor;

        if (!flash) {
            this.gameGraphics.lineStyle(8, bossColor, 0.25);
            this.drawPolygonPoints(points);
            this.gameGraphics.lineStyle(5, bossColor, 0.55);
            this.drawPolygonPoints(points);
        }

        this.gameGraphics.fillStyle(fillCol, 0.9);
        this.gameGraphics.lineStyle(3, strokeCol, 1.0);
        this.drawPolygonPoints(points, true);

        // Core visual weak point generator (rear engine core)
        const coreFlashColor = flash ? 0xffffff : (this.bossPhase === 1 ? 0x00ffea : 0xff00ff);
        this.gameGraphics.fillStyle(coreFlashColor, 0.8);
        this.gameGraphics.fillRect(bx + 15, by - 8, 12, 16);
        this.gameGraphics.lineStyle(1.5, 0xffffff, 1);
        this.gameGraphics.strokeRect(bx + 15, by - 8, 12, 16);

        // Phase 1: Draw frontal glowing energy shield arc
        if (this.bossPhase === 1 && !flash) {
            const arcColor = 0x00f0ff;
            
            this.gameGraphics.lineStyle(5, arcColor, 0.2);
            this.gameGraphics.beginPath();
            this.gameGraphics.arc(bx - 50, by, 65, -Math.PI/2.5, Math.PI/2.5, false);
            this.gameGraphics.strokePath();
            
            this.gameGraphics.lineStyle(3, arcColor, 0.65);
            this.gameGraphics.beginPath();
            this.gameGraphics.arc(bx - 50, by, 65, -Math.PI/3, Math.PI/3, false);
            this.gameGraphics.strokePath();
            
            this.gameGraphics.lineStyle(1.5, 0xffffff, 1.0);
            this.gameGraphics.beginPath();
            this.gameGraphics.arc(bx - 50, by, 65, -Math.PI/4, Math.PI/4, false);
            this.gameGraphics.strokePath();
        }

        // Phase 2: Drawing targeted warning lasers & plasma beams
        if (this.bossWarningLineY !== -1) {
            this.gameGraphics.lineStyle(1.5, 0xff003c, 0.95);
            this.gameGraphics.strokeLineShape(new Phaser.Geom.Line(-10, this.bossWarningLineY, bx - 30, this.bossWarningLineY));
        }

        if (this.bossBeamActive) {
            // Giant Neon laser-sight beam rendering
            this.gameGraphics.fillStyle(0xff0055, 0.3);
            this.gameGraphics.fillRect(0, by - 24, bx - 30, 48);
            this.gameGraphics.fillStyle(0xff00ff, 0.65);
            this.gameGraphics.fillRect(0, by - 12, bx - 30, 24);
            this.gameGraphics.fillStyle(0xffffff, 1.0);
            this.gameGraphics.fillRect(0, by - 5, bx - 30, 10);
        }
    }

    drawParticles() {
        // Draw spacecraft thruster trail
        this.trailParticles.forEach(p => {
            this.gameGraphics.fillStyle(p.color, p.alpha);
            this.gameGraphics.fillCircle(p.x, p.y, p.size);
        });

        // Draw dynamic combustion explosions
        this.explosionParticles.forEach(p => {
            this.gameGraphics.fillStyle(p.color, p.alpha);
            this.gameGraphics.fillCircle(p.x, p.y, p.size);
        });
    }

    drawHUD() {
        // 1. Draw Player Shields Neon Bar (Top Left)
        this.gameGraphics.fillStyle(0x050515, 0.6);
        this.gameGraphics.lineStyle(1.5, 0x00f0ff, 0.8);
        this.gameGraphics.fillRect(20, 20, 200, 16);
        this.gameGraphics.strokeRect(20, 20, 200, 16);

        const shieldPercent = Math.max(0, Math.min(100, this.shields)) / 100;
        const shieldWidth = shieldPercent * 200;
        const shieldColor = this.shields > 35 ? 0x00ff88 : 0xff003c; // Green to Crimson danger
        this.gameGraphics.fillStyle(shieldColor, 0.95);
        this.gameGraphics.fillRect(20, 20, shieldWidth, 16);

        // Draw Lives indicator circles
        for (let i = 0; i < this.lives; i++) {
            this.gameGraphics.fillStyle(0xff00ff, 0.85);
            this.gameGraphics.fillCircle(240 + i * 16, 28, 5);
            this.gameGraphics.lineStyle(1, 0xffffff, 1.0);
            this.gameGraphics.strokeCircle(240 + i * 16, 28, 5);
        }

        // 2. Draw Capital Boss Health Bar (Bottom Center)
        if (this.isBossSpawned && this.boss && this.boss.active) {
            const bx = 150;
            const by = 555;
            const bw = 500;
            const bh = 18;

            this.gameGraphics.fillStyle(0x050515, 0.65);
            this.gameGraphics.lineStyle(2, 0xff0055, 0.85);
            this.gameGraphics.fillRect(bx, by, bw, bh);
            this.gameGraphics.strokeRect(bx, by, bw, bh);

            const hpPercent = Math.max(0, Math.min(this.bossMaxHp, this.bossHp)) / this.bossMaxHp;
            const fillWidth = hpPercent * bw;
            const bossFillColor = this.bossPhase === 1 ? 0x9d00ff : 0xff003c; // Purple core turns Crimson rage
            this.gameGraphics.fillStyle(bossFillColor, 0.95);
            this.gameGraphics.fillRect(bx, by, fillWidth, bh);
        }
    }

    drawPolygonPoints(points: Array<{ x: number, y: number }>, fill = false) {
        if (points.length < 3) return;
        this.gameGraphics.beginPath();
        this.gameGraphics.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.gameGraphics.lineTo(points[i].x, points[i].y);
        }
        this.gameGraphics.closePath();
        this.gameGraphics.strokePath();
        if (fill) this.gameGraphics.fillPath();
    }

    createVisualExplosion(x: number, y: number, color: number, count = 15, size = 4) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 180;
            this.explosionParticles.push({
                x,
                y,
                vx: Math.cos(angle) * speed * 0.016,
                vy: Math.sin(angle) * speed * 0.016,
                alpha: 1.0,
                size: Phaser.Math.Between(size - 1, size + 2),
                color
            });
        }
    }

    // ============================================================
    // I. CAPITAL BOSS SPAWNER TRIGGERS
    // ============================================================
    triggerBossSpawning() {
        this.isBossSpawned = true;
        
        // Pause regular wave timings
        if (this.spawnTimer) this.spawnTimer.destroy();

        // Warning Overlay announcement SRE HUD text
        const bannerText = this.add.text(400, 220, "WARNING: BOSS INTRUSION DETECTED", {
            fontFamily: 'Orbitron, Arial, sans-serif',
            fontSize: '32px',
            color: '#ff003c',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        const subText = this.add.text(400, 275, "INITIATING ANOMALY PURGE SEQUENCE", {
            fontFamily: 'Orbitron, Arial, sans-serif',
            fontSize: '18px',
            color: '#aaaaaa',
            align: 'center'
        }).setOrigin(0.5);

        // Flash screen red and play warning alarm sounds
        this.cameras.main.flash(500, 255, 0, 0, false);
        this.shakeIntensity = 20;
        SoundManager.playSFX('/audio/boss-laser.mp3');

        // Text flashing tween sequence
        this.tweens.add({
            targets: [bannerText, subText],
            alpha: 0.2,
            duration: 350,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
                bannerText.destroy();
                subText.destroy();
                
                // Spawn physical bounds boss sprite
                this.boss = this.physics.add.sprite(900, 300, 'alien_boss');
                this.boss.setCollideWorldBounds(true);
                this.boss.setAlpha(0); // Kept invisible, drawn via graphics loop
                this.boss.setData('isBoss', true); // Bulletproof identifier!
                
                // Re-initialize boss properties to prevent cross-level state pollution
                this.bossHp = 1000;
                this.bossMaxHp = 1000;
                this.bossPhase = 1;
                this.bossBeamActive = false;
                this.bossWarningLineY = -1;
                this.bossLastFireTime = this.time.now;
                this.bossLastBeamTime = this.time.now;
                
                // Set custom large physics bounds
                this.boss.body.setSize(80, 80);
                
                // Active frontal overlay trigger bindings
                this.physics.add.overlap(this.playerLasers, this.boss, this.handleLaserHit, null, this);
                this.physics.add.overlap(this.player, this.boss, () => this.takeDamage(0.6), null, this); // Fast grinding contact damage

                // Slide in boss from the right bounds
                this.tweens.add({
                    targets: this.boss,
                    x: 650,
                    duration: 1600,
                    ease: 'Expo.easeOut'
                });
            }
        });
    }

    // ============================================================
    // J. LEVEL COMPLETE & STAGE CLEAR ROUTING
    // ============================================================
    triggerBossDefeated() {
        this.isTransitioning = true;
        this.isBossSpawned = false;
        
        // Stop spaceship velocity
        this.player.setVelocity(0, 0);

        // Giant victory particle explosion burst (80 colorful vector particles)
        this.createVisualExplosion(this.boss ? this.boss.x : 600, this.boss ? this.boss.y : 300, 0x00f0ff, 35, 7);
        this.createVisualExplosion(this.boss ? this.boss.x : 600, this.boss ? this.boss.y : 300, 0xff00ff, 35, 7);
        this.createVisualExplosion(this.boss ? this.boss.x : 600, this.boss ? this.boss.y : 300, 0x00ff88, 30, 6);
        
        this.shakeIntensity = 25;
        SoundManager.playSFX('/audio/explosion.mp3');

        // Compile telemetry run details
        const duration = Date.now() - this.startTime;
        const scoreEarned = this.score - this.startScore;

        if (this.registry.get('arenaMode')) {
            // Under Arena Mode, the game is playable infinitely until first blood (death).
            // Reset the boss state so grunts start spawning again, and reward the player.
            this.isBossSpawned = false;
            this.boss = null;
            this.killsCount = 0;
            this.bossHp = 1000;
            this.bossWarningLineY = -1;
            this.bossBeamActive = false;

            // Grant boss victory points
            this.score += 5000;
            EventBus.emit('score-changed', this.score);
            
            // Resume wave spawning
            const levelIdx = Math.min(LEVEL_CONFIGS.length - 1, Math.max(0, this.level - 1));
            const activeConfig = LEVEL_CONFIGS[levelIdx];
            if (this.spawnTimer) this.spawnTimer.destroy();
            this.spawnTimer = this.time.addEvent({
                delay: activeConfig.spawnDelay,
                callback: this.spawnEnemyWave,
                callbackScope: this,
                loop: true
            });

            this.isTransitioning = false; // Ensure player remains fully active and movable
            return;
        }

        // Stage complete HUD notifications
        const stageClearText = this.add.text(400, 240, "STAGE CLEAR", {
            fontFamily: 'Orbitron, Arial Black, sans-serif',
            fontSize: '52px',
            color: '#00ff88',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5);

        const nextStageText = this.add.text(400, 310, `GET READY FOR SECTOR ${this.level + 1}`, {
            fontFamily: 'Orbitron, Arial, sans-serif',
            fontSize: '22px',
            color: '#00f0ff'
        }).setOrigin(0.5);

        const countdownText = this.add.text(400, 380, "INCOMING PROGRESSION SYNC: 3s", {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // Countdown timer flow (3 seconds)
        let seconds = 3;
        const countdownTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                seconds--;
                if (seconds > 0) {
                    countdownText.setText(`INCOMING PROGRESSION SYNC: ${seconds}s`);
                } else {
                    countdownTimer.destroy();
                    stageClearText.destroy();
                    nextStageText.destroy();
                    countdownText.destroy();
                    
                    // Trigger dynamic Web3 page completeness card & NFT Mint screen
                    EventBus.emit('save-run', {
                        level: this.level,
                        score: this.score,
                        scoreEarned,
                        combo: this.maxCombo,
                        duration,
                        completed: true
                    });

                    // Start the Stage transitions scene
                    this.scene.start('SpaceImpactLevelCompleteScene', {
                        level: this.level,
                        score: this.score,
                        combo: this.maxCombo
                    });
                }
            }
        });
    }

    gameOver() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        
        this.player.setVelocity(0, 0);
        this.createVisualExplosion(this.player.x, this.player.y, 0xff00aa, 32, 6);
        SoundManager.playSFX('/audio/explosion.mp3');

        const duration = Date.now() - this.startTime;
        const scoreEarned = this.score - this.startScore;
        
        EventBus.emit('save-run', {
            level: this.level,
            score: this.score,
            scoreEarned,
            combo: this.maxCombo,
            duration,
            completed: false
        });
        
        this.cameras.main.shake(300, 0.02);

        if (this.registry.get('arenaMode')) {
            // Under Arena Mode, we freeze and DO NOT start SpaceImpactGameOverScene!
            return;
        }

        this.time.delayedCall(300, () => {
            this.scene.start('SpaceImpactGameOverScene', {
                score: this.score,
                level: this.level
            });
        });
    }
}
