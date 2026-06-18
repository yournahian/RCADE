import { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

export class CyberRunnerLevelCompleteScene extends Scene {
    constructor() {
        super('CyberRunnerLevelCompleteScene');
    }

    create(data: { level: number, score: number, combo: number }) {
        const width = this.scale.width;
        const height = this.scale.height;

        this.cameras.main.flash(500, 0, 240, 255);

        // Cyberpunk gradient overlay backing
        this.add.rectangle(width / 2, height / 2, width, height, 0x020208, 0.95);

        this.add.text(width / 2, height / 2 - 100, `LEVEL ${data.level} SECURED!`, {
            fontFamily: 'Arial Black',
            fontSize: 44,
            color: '#00ff88',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 20, `SCORE COMPILED: ${data.score} PTS`, {
            fontFamily: 'Arial',
            fontSize: 26,
            color: '#00f0ff'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 20, `PEAK RUNNER COMBO: x${data.combo.toFixed(1)}`, {
            fontFamily: 'Arial',
            fontSize: 22,
            color: '#ff00ff'
        }).setOrigin(0.5);

        // Web3 secure progression sync loading message
        const savingText = this.add.text(width / 2, height / 2 + 90, 'COMPILING TELEMETRY SECURE PROTOCOLS...', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#aaaaaa',
            align: 'center'
        }).setOrigin(0.5);

        const readyText = this.add.text(width / 2, height / 2 + 90, 'Claim EIP-1155 Token in Vault to unlock next Level', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#00ff88',
            align: 'center',
            wordWrap: { width: width * 0.8 }
        }).setOrigin(0.5).setVisible(false);

        const onRunSaved = () => {
            savingText.destroy();
            readyText.setVisible(true);
        };

        EventBus.on('run-saved', onRunSaved);

        this.events.once('shutdown', () => {
            EventBus.removeListener('run-saved', onRunSaved);
        });

        EventBus.emit('current-scene-ready', this);
    }
}
