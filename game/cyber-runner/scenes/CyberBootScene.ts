import { Scene } from 'phaser';

export class CyberBootScene extends Scene {
    constructor() {
        super('CyberBootScene');
    }

    preload() {
        const graphics = this.add.graphics();
        
        // ----------------------------------------------------
        // 1. PLAYER RENDER TEXTURES
        // ----------------------------------------------------
        
        // Player Idle (Hacker: Blue jacket, dark pants, gold chain, cyan visor)
        graphics.fillStyle(0x020210, 1); // Dark backing
        graphics.fillStyle(0x0a1128, 1); // Dark blue pants
        graphics.fillRect(8, 28, 16, 20);
        graphics.fillStyle(0x00f0ff, 1); // Cyan shoes
        graphics.fillRect(6, 44, 7, 4);
        graphics.fillRect(19, 44, 7, 4);
        graphics.fillStyle(0x1d4ed8, 1); // Royal blue jacket
        graphics.fillRect(4, 12, 24, 18);
        graphics.fillStyle(0xf59e0b, 1); // Gold chain line
        graphics.fillRect(10, 15, 12, 2);
        graphics.fillStyle(0xffdbb5, 1); // Skin head
        graphics.fillRect(8, 2, 16, 10);
        graphics.fillStyle(0x00f0ff, 1); // Cyan visor
        graphics.fillRect(12, 4, 12, 3);
        graphics.generateTexture('player_idle', 32, 48);
        graphics.clear();

        // Player Run (slightly leaned forward)
        graphics.fillStyle(0x0a1128, 1); 
        graphics.fillRect(6, 26, 16, 22);
        graphics.fillStyle(0x00f0ff, 1); // Shoes
        graphics.fillRect(4, 42, 6, 6);
        graphics.fillRect(18, 42, 6, 6);
        graphics.fillStyle(0x1d4ed8, 1); // Jacket
        graphics.fillRect(6, 12, 22, 16);
        graphics.fillStyle(0xffdbb5, 1); // Head
        graphics.fillRect(10, 2, 16, 10);
        graphics.fillStyle(0x00f0ff, 1); // Visor
        graphics.fillRect(14, 4, 10, 3);
        graphics.generateTexture('player_run', 32, 48);
        graphics.clear();

        // Player Jump (knees tucked)
        graphics.fillStyle(0x0a1128, 1);
        graphics.fillRect(8, 24, 16, 16);
        graphics.fillStyle(0x00f0ff, 1); // Shoes tucked
        graphics.fillRect(5, 36, 7, 5);
        graphics.fillRect(20, 36, 7, 5);
        graphics.fillStyle(0x1d4ed8, 1); // Jacket
        graphics.fillRect(4, 8, 24, 18);
        graphics.fillStyle(0xffdbb5, 1); // Head
        graphics.fillRect(8, 0, 16, 10);
        graphics.fillStyle(0x00f0ff, 1); // Visor
        graphics.fillRect(12, 2, 12, 3);
        graphics.generateTexture('player_jump', 32, 48);
        graphics.clear();

        // Player Slide (Horizontal)
        graphics.fillStyle(0x1d4ed8, 1); // Jacket
        graphics.fillRect(12, 6, 24, 14);
        graphics.fillStyle(0x0a1128, 1); // Pants
        graphics.fillRect(36, 8, 10, 12);
        graphics.fillStyle(0x00f0ff, 1); // Shoes
        graphics.fillRect(44, 10, 4, 8);
        graphics.fillStyle(0xffdbb5, 1); // Head
        graphics.fillRect(0, 8, 12, 12);
        graphics.fillStyle(0x00f0ff, 1); // Visor
        graphics.fillRect(0, 10, 3, 4);
        graphics.generateTexture('player_slide', 48, 24);
        graphics.clear();

        // Melee punch swipe arc
        graphics.lineStyle(4, 0xff00ff, 0.8);
        graphics.beginPath();
        graphics.arc(16, 16, 14, -Math.PI/3, Math.PI/3, false);
        graphics.strokePath();
        graphics.generateTexture('punch_swipe', 32, 32);
        graphics.clear();

        // Dash projectile / shadow clone (semitransparent cyan)
        graphics.fillStyle(0x00f0ff, 0.4);
        graphics.fillRect(0, 0, 32, 48);
        graphics.generateTexture('player_dash_shadow', 32, 48);
        graphics.clear();

        // ----------------------------------------------------
        // 2. ENEMY TEXTURES
        // ----------------------------------------------------

        // Drone Scout (Floating orange/black with blue sensor)
        graphics.fillStyle(0xf97316, 1); // Orange body
        graphics.fillCircle(12, 12, 10);
        graphics.fillStyle(0x1e293b, 1); // Black plates
        graphics.fillRect(2, 6, 6, 12);
        graphics.fillRect(16, 6, 6, 12);
        graphics.fillStyle(0x00f0ff, 1); // Blue eye sensor
        graphics.fillCircle(12, 10, 4);
        graphics.generateTexture('drone_scout', 24, 24);
        graphics.clear();

        // Stationary Laser Turret (Gray robotic arm with red focal lens)
        graphics.fillStyle(0x475569, 1); // Slate body
        graphics.fillRect(8, 16, 16, 16);
        graphics.fillStyle(0x1e293b, 1); // Ring base
        graphics.fillRect(2, 26, 28, 6);
        graphics.fillStyle(0xef4444, 1); // Red glowing eye
        graphics.fillRect(13, 10, 6, 6);
        graphics.lineStyle(2, 0xef4444, 1);
        graphics.strokeRect(11, 8, 10, 10);
        graphics.generateTexture('laser_turret', 32, 32);
        graphics.clear();

        // Street Gang (Mohawk punk in yellow/purple jacket)
        graphics.fillStyle(0xa855f7, 1); // Mohawk
        graphics.fillRect(10, 0, 4, 8);
        graphics.fillStyle(0xffdbb5, 1); // Skin face
        graphics.fillRect(8, 8, 8, 8);
        graphics.fillStyle(0xeab308, 1); // Yellow jacket
        graphics.fillRect(4, 16, 16, 12);
        graphics.fillStyle(0x020210, 1); // Dark legs
        graphics.fillRect(6, 28, 12, 12);
        graphics.generateTexture('street_gang', 24, 40);
        graphics.clear();

        // Security Robot (Chunky armored blue patrol bot with red blinkers)
        graphics.fillStyle(0x1e40af, 1); // Armored blue
        graphics.fillRect(4, 12, 24, 20);
        graphics.fillStyle(0x64748b, 1); // Metal treads
        graphics.fillRect(2, 32, 28, 8);
        graphics.fillStyle(0x38bdf8, 1); // Monitor visor
        graphics.fillRect(8, 4, 16, 8);
        graphics.fillStyle(0xef4444, 1); // Siren red
        graphics.fillRect(14, 0, 4, 4);
        graphics.generateTexture('security_robot', 32, 40);
        graphics.clear();

        // Mutated Cyborg (Leaking toxic green slime, purple cybernetics)
        graphics.fillStyle(0x22c55e, 1); // Green bio-flesh
        graphics.fillRect(6, 8, 12, 24);
        graphics.fillStyle(0xa855f7, 1); // Purple cyber limb
        graphics.fillRect(2, 12, 4, 14);
        graphics.fillRect(18, 12, 4, 14);
        graphics.fillStyle(0xeab308, 1); // Radioactive hazard canisters
        graphics.fillRect(8, 0, 8, 8);
        graphics.generateTexture('mutated_cyborg', 24, 32);
        graphics.clear();

        // Heavy Mech (Double-barrel mechanical walker, slate gray, yellow caution stripes)
        graphics.fillStyle(0x334155, 1); // Slate chassis
        graphics.fillRect(4, 4, 40, 24);
        graphics.fillStyle(0xeab308, 1); // Yellow caution decals
        graphics.fillRect(8, 8, 4, 4);
        graphics.fillRect(36, 8, 4, 4);
        graphics.fillStyle(0x1e293b, 1); // Left and Right Mech legs
        graphics.fillRect(8, 28, 10, 20);
        graphics.fillRect(30, 28, 10, 20);
        graphics.fillStyle(0x64748b, 1); // Guns
        graphics.fillRect(0, 16, 6, 8);
        graphics.fillRect(42, 16, 6, 8);
        graphics.generateTexture('heavy_mech', 48, 48);
        graphics.clear();

        // Jetpack Soldier (Purple armor with yellow wings and fire thruster)
        graphics.fillStyle(0x5b21b6, 1); // Purple body armor
        graphics.fillRect(6, 6, 12, 20);
        graphics.fillStyle(0x1e293b, 1); // Visor
        graphics.fillRect(8, 0, 8, 6);
        graphics.fillStyle(0xf97316, 1); // Jetpack body
        graphics.fillRect(0, 10, 6, 12);
        graphics.fillRect(18, 10, 6, 12);
        graphics.fillStyle(0xef4444, 1); // Fire flare
        graphics.fillRect(1, 22, 4, 6);
        graphics.fillRect(19, 22, 4, 6);
        graphics.generateTexture('jetpack_soldier', 24, 28);
        graphics.clear();

        // AI Assassin (Cloaked black silhouette, glowing crimson slits)
        graphics.fillStyle(0x090d16, 1); // Shadow robe
        graphics.fillRect(4, 8, 16, 24);
        graphics.fillStyle(0xff0055, 1); // Crimson eyes
        graphics.fillRect(7, 4, 10, 2);
        graphics.fillStyle(0xff00ff, 1); // Energy blade
        graphics.fillRect(0, 18, 4, 14);
        graphics.fillRect(20, 18, 4, 14);
        graphics.generateTexture('ai_assassin', 24, 32);
        graphics.clear();

        // ----------------------------------------------------
        // 3. ENVIRONMENTAL TILES & HAZARDS
        // ----------------------------------------------------

        // Concrete Platform Tile (Dark brick, bright neon cyan top border)
        graphics.fillStyle(0x1e293b, 1); // Gray brick
        graphics.fillRect(0, 0, 32, 32);
        graphics.fillStyle(0x00f0ff, 1); // Neon cyan line
        graphics.fillRect(0, 0, 32, 4);
        graphics.lineStyle(1.5, 0x334155, 1);
        graphics.strokeRect(0, 0, 32, 32);
        graphics.generateTexture('ground_tile', 32, 32);
        graphics.clear();

        // Hazard Spikes (Red triangles, yellow base)
        graphics.fillStyle(0xef4444, 1); // Red
        graphics.fillTriangle(0, 32, 16, 0, 32, 32);
        graphics.fillStyle(0xeab308, 1); // Yellow glow line
        graphics.fillRect(0, 30, 32, 2);
        graphics.generateTexture('hazard_spikes', 32, 32);
        graphics.clear();

        // Laser Grid Bar (Vertical neon red laser line with hazard poles)
        graphics.fillStyle(0x991b1b, 1); // Red caps
        graphics.fillRect(2, 0, 12, 6);
        graphics.fillRect(2, 58, 12, 6);
        graphics.fillStyle(0xef4444, 0.4); // Outer glow
        graphics.fillRect(4, 6, 8, 52);
        graphics.fillStyle(0xffffff, 0.95); // Core laser
        graphics.fillRect(6, 6, 4, 52);
        graphics.generateTexture('laser_grid', 16, 64);
        graphics.clear();

        // Hacking Terminal - Online (Interactive computer node - Green monitor)
        graphics.fillStyle(0x1e293b, 1); // Robot column
        graphics.fillRect(8, 16, 16, 32);
        graphics.fillStyle(0x020617, 1); // Screen frame
        graphics.fillRect(4, 2, 24, 16);
        graphics.fillStyle(0x22c55e, 1); // Green console screen
        graphics.fillRect(7, 4, 18, 12);
        graphics.generateTexture('terminal_online', 32, 48);
        graphics.clear();

        // Hacking Terminal - Hacked (Interactive computer node - Cyan screen)
        graphics.fillStyle(0x1e293b, 1);
        graphics.fillRect(8, 16, 16, 32);
        graphics.fillStyle(0x020617, 1);
        graphics.fillRect(4, 2, 24, 16);
        graphics.fillStyle(0x00f0ff, 1); // Cyan console screen
        graphics.fillRect(7, 4, 18, 12);
        graphics.generateTexture('terminal_hacked', 32, 48);
        graphics.clear();

        // Credit coins / Collectibles (Glowing gold spinning cube)
        graphics.fillStyle(0xeab308, 1); // Gold core
        graphics.fillRect(3, 3, 10, 10);
        graphics.lineStyle(2, 0xffffff, 1); // Shiny highlight
        graphics.strokeRect(3, 3, 10, 10);
        graphics.generateTexture('credits_coin', 16, 16);
        graphics.clear();

        // Checkpoint Flag - Inactive (Red flag)
        graphics.fillStyle(0x64748b, 1); // Flagpole
        graphics.fillRect(4, 0, 3, 48);
        graphics.fillStyle(0xef4444, 1); // Red flag banner
        graphics.fillRect(7, 4, 16, 12);
        graphics.generateTexture('checkpoint_inactive', 24, 48);
        graphics.clear();

        // Checkpoint Flag - Active (Green flag)
        graphics.fillStyle(0x64748b, 1); // Flagpole
        graphics.fillRect(4, 0, 3, 48);
        graphics.fillStyle(0x22c55e, 1); // Green flag banner
        graphics.fillRect(7, 4, 16, 12);
        graphics.generateTexture('checkpoint_active', 24, 48);
        graphics.clear();

        // Exit Gateway / Portal (Swirling cyber gate - Magenta-cyan)
        graphics.fillStyle(0x090d16, 1);
        graphics.fillRect(0, 0, 48, 64);
        graphics.lineStyle(4, 0xff00ff, 1); // Magenta arch
        graphics.strokeRect(2, 2, 44, 62);
        graphics.lineStyle(2, 0x00f0ff, 1); // Inner cyan ring
        graphics.strokeRect(8, 8, 32, 48);
        graphics.generateTexture('exit_portal', 48, 64);
        graphics.clear();

        // ----------------------------------------------------
        // 4. PROJECTILES & WEAPONS
        // ----------------------------------------------------

        // Cyber energy blast (laser shot from player)
        graphics.fillStyle(0x00f0ff, 1); // Cyan blast
        graphics.fillRect(0, 2, 16, 4);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(4, 3, 8, 2);
        graphics.generateTexture('player_laser', 16, 8);
        graphics.clear();

        // Orange Orb projectile (enemy laser)
        graphics.fillStyle(0xf97316, 1);
        graphics.fillCircle(6, 6, 6);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(6, 6, 2);
        graphics.generateTexture('enemy_bullet', 12, 12);
        graphics.clear();
        
        // Homing Missile projectile (Orange with flame trail)
        graphics.fillStyle(0xef4444, 1); // Red missile
        graphics.fillRect(4, 2, 12, 4);
        graphics.fillStyle(0xeab308, 1); // Flame flare
        graphics.fillRect(0, 3, 4, 2);
        graphics.generateTexture('enemy_missile', 16, 8);
        graphics.clear();

        // ----------------------------------------------------
        // 5. BOSSES (TEXTURES FOR SPECIAL FORMS)
        // ----------------------------------------------------
        
        // Mini Drone Commander (Level 1 Boss)
        graphics.fillStyle(0xf97316, 1); // Orange heavy shields
        graphics.fillRect(8, 16, 48, 32);
        graphics.fillStyle(0x1e293b, 1); // Core chassis
        graphics.fillRect(16, 8, 32, 48);
        graphics.fillStyle(0x00f0ff, 1); // Heavy cyan scanner
        graphics.fillRect(22, 28, 20, 6);
        graphics.generateTexture('boss_drone_commander', 64, 64);
        graphics.clear();

        // Heavy Turret Bot (Level 2 Boss)
        graphics.fillStyle(0x64748b, 1); // Heavy slate base
        graphics.fillRect(8, 48, 48, 16);
        graphics.fillStyle(0x334155, 1); // Rotor pivot
        graphics.fillRect(20, 28, 24, 20);
        graphics.fillStyle(0x1e293b, 1); // Dual heavy barrels
        graphics.fillRect(4, 12, 12, 12);
        graphics.fillRect(48, 12, 12, 12);
        graphics.fillStyle(0x00f0ff, 1); // Shield emitter node
        graphics.fillRect(28, 8, 8, 8);
        graphics.generateTexture('boss_turret_bot', 64, 64);
        graphics.clear();

        // Gang Leader (Level 3 Boss)
        graphics.fillStyle(0xec4899, 1); // Tall Pink Mohawk
        graphics.fillRect(20, 0, 8, 16);
        graphics.fillStyle(0xffdbb5, 1); // Face
        graphics.fillRect(16, 16, 16, 16);
        graphics.fillStyle(0xa855f7, 1); // Purple leather coat
        graphics.fillRect(8, 32, 32, 32);
        graphics.fillStyle(0xeab308, 1); // Golden chain
        graphics.fillRect(18, 36, 12, 3);
        graphics.generateTexture('boss_gang_leader', 48, 64);
        graphics.clear();

        // Metro Security AI (Level 4 Boss)
        graphics.fillStyle(0x1e293b, 1); // Metal chassis frame
        graphics.fillRect(0, 0, 64, 64);
        graphics.fillStyle(0x090d16, 1); // Inner screen
        graphics.fillRect(8, 8, 48, 48);
        graphics.fillStyle(0xef4444, 0.4); // Red eye outer glow
        graphics.fillCircle(32, 32, 18);
        graphics.fillStyle(0xffffff, 0.95); // White core eye
        graphics.fillCircle(32, 32, 8);
        graphics.generateTexture('boss_metro_ai', 64, 64);
        graphics.clear();

        // Experimental Android (Level 5 Boss)
        graphics.fillStyle(0x94a3b8, 1); // Chrome silver armor
        graphics.fillRect(6, 12, 20, 24);
        graphics.fillStyle(0x334155, 1); // Tech limbs
        graphics.fillRect(2, 16, 4, 18);
        graphics.fillRect(26, 16, 4, 18);
        graphics.fillStyle(0x020617, 1); // Face screen
        graphics.fillRect(10, 2, 12, 10);
        graphics.fillStyle(0xef4444, 1); // Red visors
        graphics.fillRect(13, 5, 6, 2);
        graphics.generateTexture('boss_experimental_android', 32, 48);
        graphics.clear();

        // Defense Core (Level 6 Boss)
        graphics.fillStyle(0x3b82f6, 1); // Shield segments
        graphics.fillCircle(32, 32, 28);
        graphics.fillStyle(0x1e293b, 1); // Central core structure
        graphics.fillRect(16, 16, 32, 32);
        graphics.fillStyle(0x00f0ff, 1); // Hacking core light
        graphics.fillCircle(32, 32, 10);
        graphics.generateTexture('boss_defense_core', 64, 64);
        graphics.clear();

        // Titan Mech (Level 7 Boss)
        graphics.fillStyle(0x0f172a, 1); // Heavy black metal armor
        graphics.fillRect(8, 8, 64, 48);
        graphics.fillStyle(0x3b82f6, 1); // Laser cannons
        graphics.fillRect(0, 24, 12, 16);
        graphics.fillRect(68, 24, 12, 16);
        graphics.fillStyle(0x475569, 1); // Massive piston legs
        graphics.fillRect(18, 56, 16, 24);
        graphics.fillRect(46, 56, 16, 24);
        graphics.fillStyle(0xef4444, 1); // Red spotlight visor
        graphics.fillRect(28, 18, 24, 6);
        graphics.generateTexture('boss_titan_mech', 80, 80);
        graphics.clear();

        // Sky Hunter (Level 8 Boss)
        graphics.fillStyle(0x0284c7, 1); // Sleek cyan aerowing fuselage
        graphics.fillRect(20, 16, 40, 28);
        graphics.fillStyle(0x0f172a, 1); // Variable swept wings
        graphics.fillRect(0, 24, 20, 8);
        graphics.fillRect(60, 24, 20, 8);
        graphics.fillStyle(0xef4444, 1); // Rockets
        graphics.fillRect(8, 32, 10, 6);
        graphics.fillRect(62, 32, 10, 6);
        graphics.fillStyle(0xf59e0b, 1); // Turbines
        graphics.fillCircle(40, 44, 10);
        graphics.generateTexture('boss_sky_hunter', 80, 60);
        graphics.clear();

        // Cyber General (Level 9 Boss)
        graphics.fillStyle(0xef4444, 1); // Glowing crimson cape
        graphics.fillRect(6, 16, 36, 48);
        graphics.fillStyle(0x1e293b, 1); // Jet-black general uniform
        graphics.fillRect(10, 14, 28, 38);
        graphics.fillStyle(0xeab308, 1); // Gold shoulder pads
        graphics.fillRect(6, 12, 8, 6);
        graphics.fillRect(34, 12, 8, 6);
        graphics.fillStyle(0xffdbb5, 1); // Face
        graphics.fillRect(18, 2, 12, 10);
        graphics.fillStyle(0x00f0ff, 1); // Visor eye
        graphics.fillRect(21, 5, 6, 2);
        graphics.generateTexture('boss_cyber_general', 48, 64);
        graphics.clear();

        // Omega AI (Level 10 Final Boss Forms)
        
        // Form 1: Giant Robot Form
        graphics.fillStyle(0x1e293b, 1); // Outer armor shell
        graphics.fillRect(8, 12, 48, 56);
        graphics.fillStyle(0xa855f7, 0.4); // Swirling purple energy matrix
        graphics.fillRect(16, 20, 32, 32);
        graphics.fillStyle(0xffffff, 1); // Core node
        graphics.fillCircle(32, 36, 6);
        graphics.fillStyle(0x334155, 1); // Twin legs
        graphics.fillRect(14, 68, 12, 12);
        graphics.fillRect(38, 68, 12, 12);
        graphics.fillStyle(0xa855f7, 1); // Glowing visor
        graphics.fillRect(20, 6, 24, 4);
        graphics.generateTexture('omega_robot', 64, 80);
        graphics.clear();

        // Form 2: Floating Digital Face Grid
        graphics.fillStyle(0x020210, 0.85); // Grid backing
        graphics.fillRect(0, 0, 64, 64);
        graphics.lineStyle(2, 0xa855f7, 0.5); // Grid lines
        for(let i=0; i<64; i+=8) {
            graphics.lineBetween(i, 0, i, 64);
            graphics.lineBetween(0, i, 64, i);
        }
        graphics.fillStyle(0x00f0ff, 1); // Glowing cyberspace eyes
        graphics.fillRect(12, 20, 10, 6);
        graphics.fillRect(42, 20, 10, 6);
        graphics.fillStyle(0x00f0ff, 0.8); // Cyberspace mouth bar
        graphics.fillRect(20, 42, 24, 4);
        graphics.generateTexture('omega_digital', 64, 64);
        graphics.clear();

        // Form 3: Giant AI Nexus Core
        graphics.fillStyle(0x1e293b, 15); // Nexus mainframe support rings
        graphics.strokeCircle(48, 48, 44);
        graphics.fillStyle(0xa855f7, 0.2); // Central plasma force field
        graphics.fillCircle(48, 48, 36);
        graphics.fillStyle(0xff00ff, 0.8); // Inner hyper-core
        graphics.fillCircle(48, 48, 20);
        graphics.fillStyle(0xffffff, 1); // Superheated central node
        graphics.fillCircle(48, 48, 8);
        graphics.generateTexture('omega_core', 96, 96);
        graphics.clear();
    }

    create() {
        const startLevel = this.registry.get('startLevel') || 1;
        this.scene.start('CyberRunnerScene', { level: startLevel });
    }
}
