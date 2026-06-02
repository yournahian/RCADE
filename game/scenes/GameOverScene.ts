import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

export class GameOverScene extends Scene {
    constructor() {
        super('GameOverScene');
    }

    create(data: { score: number, level: number }) {
        const width = this.scale.width;
        const height = this.scale.height;

        this.add.text(width / 2, height / 2 - 80, 'GAME OVER', {
            fontFamily: 'Arial Black',
            fontSize: 48,
            color: '#ff003c',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 10, `FINAL SCORE: ${data.score || 0}`, {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#00f0ff'
        }).setOrigin(0.5);

        const restartBtn = this.add.text(width / 2, height / 2 + 60, 'PLAY AGAIN', {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#050510',
            backgroundColor: '#00f0ff',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        restartBtn.on('pointerdown', () => {
            this.scene.start('GameScene');
        });

        restartBtn.on('pointerover', () => {
            restartBtn.setStyle({ backgroundColor: '#ffffff' });
        });

        restartBtn.on('pointerout', () => {
            restartBtn.setStyle({ backgroundColor: '#00f0ff' });
        });

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-over');
    }
}
