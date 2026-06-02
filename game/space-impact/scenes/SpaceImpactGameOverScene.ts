import { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

export class SpaceImpactGameOverScene extends Scene {
    constructor() {
        super('SpaceImpactGameOverScene');
    }

    create(data: { score: number, level: number }) {
        const width = this.scale.width;
        const height = this.scale.height;

        // Overlay cyberpunk gradient backing
        this.add.rectangle(width / 2, height / 2, width, height, 0x020208, 0.95);

        this.add.text(width / 2, height / 2 - 80, 'SPACE IMPACT DEFEAT', {
            fontFamily: 'Arial Black',
            fontSize: 42,
            color: '#ff0085',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 10, `SECURED ASSETS: ${data.score || 0} PTS`, {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#00f0ff'
        }).setOrigin(0.5);

        const restartBtn = this.add.text(width / 2, height / 2 + 60, 'REBOOT CADET CHANNELS', {
            fontFamily: 'Arial',
            fontSize: 20,
            color: '#050510',
            backgroundColor: '#ff0085',
            padding: { x: 25, y: 12 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        restartBtn.on('pointerdown', () => {
            this.scene.start('SpaceImpactScene', { level: data.level, score: 0 });
        });

        restartBtn.on('pointerover', () => {
            restartBtn.setStyle({ backgroundColor: '#ffffff', color: '#ff0085' });
        });

        restartBtn.on('pointerout', () => {
            restartBtn.setStyle({ backgroundColor: '#ff0085', color: '#050510' });
        });

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-over');
    }
}
