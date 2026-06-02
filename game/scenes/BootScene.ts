import { Scene } from 'phaser';

export class BootScene extends Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        const graphics = this.add.graphics();
        
        // Snake Body Texture
        graphics.fillStyle(0x00f0ff, 1);
        graphics.fillCircle(8, 8, 8);
        graphics.generateTexture('snake_body', 16, 16);
        graphics.clear();
        
        // Snake Head Texture
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(8, 8, 8);
        graphics.lineStyle(2, 0x00f0ff);
        graphics.strokeCircle(8, 8, 8);
        graphics.generateTexture('snake_head', 16, 16);
        graphics.clear();

        // Food Texture
        graphics.fillStyle(0xff003c, 1);
        graphics.fillCircle(6, 6, 6);
        graphics.generateTexture('food', 12, 12);
        graphics.clear();

        // Obstacle Texture
        graphics.fillStyle(0xb026ff, 1);
        graphics.fillRect(0, 0, 32, 32);
        graphics.lineStyle(2, 0xffffff);
        graphics.strokeRect(0, 0, 32, 32);
        graphics.generateTexture('obstacle', 32, 32);
        graphics.clear();
    }

    create() {
        const startLevel = this.registry.get('startLevel') || 1;
        this.scene.start('GameScene', { level: startLevel });
    }
}
