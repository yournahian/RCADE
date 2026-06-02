import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

/**
 * LevelCompleteScene — displayed inside the Phaser canvas after a level is beaten.
 *
 * STRICT WEB3 PROGRESSION: This scene does NOT advance to the next level.
 * All progression logic is handled by the React play page overlay.
 *
 * Flow:
 *   1. GameScene.levelComplete() → emits 'save-run' → starts this scene
 *   2. React play page handles 'save-run', calls /api/session/complete, shows Web3 overlay
 *   3. 'run-saved' is emitted once the backend has synced
 *   4. This scene shows a "Check overlay to mint" prompt
 *   5. The React overlay's MINT / PLAY NEXT LEVEL buttons drive all further navigation
 */
export class LevelCompleteScene extends Scene {
    constructor() {
        super('LevelCompleteScene');
    }

    create(data: { level: number, score: number, combo: number }) {
        const width = this.scale.width;
        const height = this.scale.height;

        this.cameras.main.flash(500, 0, 255, 136);

        this.add.text(width / 2, height / 2 - 100, `LEVEL ${data.level} COMPLETE!`, {
            fontFamily: 'Arial Black',
            fontSize: 48,
            color: '#00ff88',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 - 20, `SCORE: ${data.score}`, {
            fontFamily: 'Arial',
            fontSize: 28,
            color: '#00f0ff'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 20, `MAX COMBO: x${data.combo.toFixed(1)}`, {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#ff00ff'
        }).setOrigin(0.5);

        // Saving indicator — shown while React is calling /api/session/complete
        const savingText = this.add.text(width / 2, height / 2 + 90, 'SECURING ASSETS...', {
            fontFamily: 'Arial',
            fontSize: 18,
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // Once React has synced, show the "see overlay" prompt
        // The React overlay is the authoritative UI — do NOT show a Phaser NEXT LEVEL button
        const readyText = this.add.text(width / 2, height / 2 + 90, 'Mint your NFT to unlock the next level', {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#00f0ff',
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
