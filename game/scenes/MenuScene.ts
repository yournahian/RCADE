import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

export class MenuScene extends Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;

        this.add.text(width / 2, height / 2 - 50, 'NEON SNAKE', {
            fontFamily: 'Arial Black',
            fontSize: 48,
            color: '#00f0ff',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        const startButton = this.add.text(width / 2, height / 2 + 50, 'START GAME', {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#050510',
            backgroundColor: '#00f0ff',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        startButton.on('pointerdown', () => {
            this.scene.start('GameScene');
        });

        startButton.on('pointerover', () => {
            startButton.setStyle({ backgroundColor: '#ffffff' });
        });

        startButton.on('pointerout', () => {
            startButton.setStyle({ backgroundColor: '#00f0ff' });
        });

        EventBus.emit('current-scene-ready', this);
    }
}
