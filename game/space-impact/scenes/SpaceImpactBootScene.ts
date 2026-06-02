import { Scene } from 'phaser';

export class SpaceImpactBootScene extends Scene {
    constructor() {
        super('SpaceImpactBootScene');
    }

    preload() {
        const graphics = this.add.graphics();
        
        // 1. Cyberpunk Player Ship (Neon magenta glowing block, size 24x24)
        graphics.fillStyle(0xff0085, 1);
        graphics.fillRect(0, 0, 24, 24);
        graphics.lineStyle(2, 0xffffff, 1);
        graphics.strokeRect(0, 0, 24, 24);
        graphics.generateTexture('player_ship', 24, 24);
        graphics.clear();

        // 2. Cyan Laser Projectile (Size 16x8)
        graphics.fillStyle(0x00f0ff, 1);
        graphics.fillRect(0, 0, 16, 8);
        graphics.generateTexture('cyan_laser', 16, 8);
        graphics.clear();

        // 3. Alien Grunt Drone (Neon red circle, size 20x20)
        graphics.fillStyle(0xff2a2a, 1);
        graphics.fillCircle(10, 10, 10);
        graphics.lineStyle(1.5, 0xffffff, 1);
        graphics.strokeCircle(10, 10, 10);
        graphics.generateTexture('alien_grunt', 20, 20);
        graphics.clear();

        // 4. Alien Elite (Cyber neon yellow target circle, size 28x28)
        graphics.fillStyle(0xffdf00, 1);
        graphics.fillCircle(14, 14, 14);
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(14, 14, 5);
        graphics.generateTexture('alien_elite', 28, 28);
        graphics.clear();

        // 5. Shield Power-up (Neon green circle, size 24x24)
        graphics.fillStyle(0x00ff88, 0.3);
        graphics.fillCircle(12, 12, 12);
        graphics.lineStyle(2, 0x00ff88, 1);
        graphics.strokeCircle(12, 12, 11);
        graphics.generateTexture('shield_powerup', 24, 24);
        graphics.clear();

        // 6. Boss Destroyer (Mega neon purple warship square, size 80x80)
        graphics.fillStyle(0x9d00ff, 1);
        graphics.fillRect(0, 0, 80, 80);
        graphics.lineStyle(3, 0xff00ff, 1);
        graphics.strokeRect(0, 0, 80, 80);
        graphics.generateTexture('alien_boss', 80, 80);
        graphics.clear();
    }

    create() {
        const startLevel = this.registry.get('startLevel') || 1;
        this.scene.start('SpaceImpactScene', { level: startLevel });
    }
}
