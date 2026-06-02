import Phaser, { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

export class SudokuGameOverScene extends Scene {
    private score: number = 0;
    private level: number = 1;

    constructor() {
        super('SudokuGameOverScene');
    }

    init(data: { score: number; level: number }) {
        this.score = data.score || 0;
        this.level = data.level || 1;
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Background dark red flashing glow
        const bg = this.add.rectangle(0, 0, width, height, 0x0a0303).setOrigin(0);
        this.tweens.add({
            targets: bg,
            alpha: 0.7,
            duration: 1200,
            yoyo: true,
            repeat: -1
        });

        // Main GameOver banner
        this.add.text(width / 2, height / 2 - 100, 'MATRIX DEFECT DETECTED', {
            fontFamily: 'monospace',
            fontSize: '38px',
            color: '#ef4444',
            fontWeight: '900',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5).setShadow(0, 0, 'rgba(239,68,68,0.8)', 15, true, true);

        this.add.text(width / 2, height / 2 - 30, 'GRID DESYNCHRONIZED (STRIKES EXCEEDED)', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#888',
            align: 'center'
        }).setOrigin(0.5);

        // Score info panel
        this.add.text(width / 2, height / 2 + 20, `FINAL SCORE: ${this.score}`, {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#fbbf24',
            fontWeight: 'bold'
        }).setOrigin(0.5);

        // Buttons
        const retryBtn = this.add.text(width / 2, height / 2 + 100, 'RESTART MAINBOARD', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#000',
            backgroundColor: '#fbbf24',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        retryBtn.on('pointerover', () => retryBtn.setStyle({ backgroundColor: '#fcd34d' }));
        retryBtn.on('pointerout', () => retryBtn.setStyle({ backgroundColor: '#fbbf24' }));
        retryBtn.on('pointerdown', () => {
            this.scene.start('SudokuScene', { level: this.level });
        });

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-over');
    }
}
