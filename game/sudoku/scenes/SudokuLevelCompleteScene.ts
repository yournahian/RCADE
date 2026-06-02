import Phaser, { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

export class SudokuLevelCompleteScene extends Scene {
    private score: number = 0;
    private level: number = 1;
    private combo: number = 1.0;
    private isRunSaving: boolean = false;

    constructor() {
        super('SudokuLevelCompleteScene');
    }

    init(data: { score: number; level: number; combo: number }) {
        this.score = data.score || 0;
        this.level = data.level || 1;
        this.combo = data.combo || 1.0;
        this.isRunSaving = true;
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Dark background
        this.add.rectangle(0, 0, width, height, 0x020208).setOrigin(0);

        // Flashing Matrix Solved text
        this.add.text(width / 2, height / 2 - 120, 'MATRIX RESOLVED', {
            fontFamily: 'monospace',
            fontSize: '44px',
            color: '#fbbf24',
            fontWeight: '900',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5).setShadow(0, 0, 'rgba(251,191,36,0.8)', 15, true, true);

        // Subtitles
        this.add.text(width / 2, height / 2 - 50, 'SECTOR CLEAR - progression saved to blockchain', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#888'
        }).setOrigin(0.5);

        // Stats summary
        this.add.text(width / 2, height / 2 + 10, `SCORE EARNED: ${this.score}`, {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#fff',
            fontWeight: 'bold'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 35, `PEAK COMBO MULTIPLIER: x${this.combo.toFixed(1)}`, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#a9ddd3'
        }).setOrigin(0.5);

        const statusText = this.add.text(width / 2, height / 2 + 80, 'TRANSMITTING RUN TO INDEXERS...', {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#a9ddd3',
            align: 'center'
        }).setOrigin(0.5);

        // Pulsating sync text
        this.tweens.add({
            targets: statusText,
            alpha: 0.3,
            duration: 800,
            yoyo: true,
            repeat: -1
        });

        const onRunSaved = () => {
            this.isRunSaving = false;
            statusText.setText('TRANSMISSION SUCCESSFUL - READY');
            statusText.setStyle({ color: '#22c55e' });
            
            const nextBtn = this.add.text(width / 2, height / 2 + 130, 'PROCEED TO NEXT SECTOR', {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#000',
                backgroundColor: '#fbbf24',
                padding: { x: 20, y: 10 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            nextBtn.on('pointerover', () => nextBtn.setStyle({ backgroundColor: '#fcd34d' }));
            nextBtn.on('pointerout', () => nextBtn.setStyle({ backgroundColor: '#fbbf24' }));
            nextBtn.on('pointerdown', () => {
                EventBus.emit('request-next-level');
            });
        };

        EventBus.on('run-saved', onRunSaved);

        this.events.once('shutdown', () => {
            EventBus.removeListener('run-saved', onRunSaved);
        });

        EventBus.emit('current-scene-ready', this);
    }
}
