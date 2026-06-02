import Phaser, { Scene } from 'phaser';

export class SudokuBootScene extends Scene {
    constructor() {
        super('SudokuBootScene');
    }

    preload() {
        // Renders visual backing loading screens
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const loadingText = this.add.text(width / 2, height / 2 - 50, 'INITIALIZING MATRIX...', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#fbbf24'
        }).setOrigin(0.5);

        const percentText = this.add.text(width / 2, height / 2 + 10, '0%', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#888'
        }).setOrigin(0.5);

        this.load.on('progress', (value: number) => {
            percentText.setText(`${Math.round(value * 100)}%`);
        });

        this.load.on('complete', () => {
            loadingText.destroy();
            percentText.destroy();
            this.scene.start('SudokuScene');
        });

        // Dynamic sound buffers preloading (no-op fallbacks)
        this.load.audio('digit_success', 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAIA');
        this.load.audio('strike_alarm', 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAIA');
        this.load.audio('board_solved', 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAIA');
    }
}
