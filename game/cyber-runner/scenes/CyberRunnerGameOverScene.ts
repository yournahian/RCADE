import { Scene } from 'phaser';
import { EventBus } from '../../EventBus';

export class CyberRunnerGameOverScene extends Scene {
    constructor() {
        super('CyberRunnerGameOverScene');
    }

    create(data: { score: number, level: number }) {
        const width = this.scale.width;
        const height = this.scale.height;
        const level = data?.level || 1;
        const score = data?.score || 0;

        // Full dark overlay
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.92);

        // Red glitch scanline effect (decorative bars)
        for (let i = 0; i < height; i += 8) {
            const alpha = Math.random() * 0.04 + 0.01;
            this.add.rectangle(width / 2, i, width, 2, 0xff0000, alpha);
        }

        // RUNNER DEFEAT title
        this.add.text(width / 2, height / 2 - 110, 'RUNNER DEFEAT', {
            fontFamily: 'Arial Black, Arial',
            fontSize: '42px',
            color: '#ef4444',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center'
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(width / 2, height / 2 - 65, 'SYSTEM TERMINATED — ALL LIVES LOST', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#666666',
            align: 'center'
        }).setOrigin(0.5);

        // Score display
        this.add.text(width / 2, height / 2 - 20, `FINAL SCORE: ${score} PTS`, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#00f0ff'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 15, `LEVEL REACHED: ${level}`, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#888888'
        }).setOrigin(0.5);

        // Restart button
        const restartBtn = this.add.text(width / 2, height / 2 + 70, '[ REBOOT PROTOCOL ]', {
            fontFamily: 'Arial Black, Arial',
            fontSize: '20px',
            color: '#050510',
            backgroundColor: '#ef4444',
            padding: { x: 30, y: 14 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        // Keyboard hint
        this.add.text(width / 2, height / 2 + 115, 'Press ENTER or SPACE to restart', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#444444'
        }).setOrigin(0.5);

        const doRestart = () => {
            this.scene.start('CyberRunnerScene', { level: level, score: 0 });
        };

        restartBtn.on('pointerdown', doRestart);

        restartBtn.on('pointerover', () => {
            restartBtn.setStyle({ backgroundColor: '#ffffff', color: '#ef4444' });
        });

        restartBtn.on('pointerout', () => {
            restartBtn.setStyle({ backgroundColor: '#ef4444', color: '#050510' });
        });

        // Keyboard restart support
        const enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        const spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        enterKey?.once('down', doRestart);
        spaceKey?.once('down', doRestart);

        // Pulsing animation on button
        this.tweens.add({
            targets: restartBtn,
            scaleX: 1.04,
            scaleY: 1.04,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('game-over');
    }
}
