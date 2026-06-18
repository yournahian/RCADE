import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { LevelCompleteScene } from './scenes/LevelCompleteScene';

import { SpaceImpactBootScene } from './space-impact/scenes/SpaceImpactBootScene';
import { SpaceImpactScene } from './space-impact/scenes/SpaceImpactScene';
import { SpaceImpactGameOverScene } from './space-impact/scenes/SpaceImpactGameOverScene';
import { SpaceImpactLevelCompleteScene } from './space-impact/scenes/SpaceImpactLevelCompleteScene';

import { SudokuBootScene } from './sudoku/scenes/SudokuBootScene';
import { SudokuScene } from './sudoku/scenes/SudokuScene';
import { SudokuGameOverScene } from './sudoku/scenes/SudokuGameOverScene';
import { SudokuLevelCompleteScene } from './sudoku/scenes/SudokuLevelCompleteScene';

import { CyberBootScene } from './cyber-runner/scenes/CyberBootScene';
import { CyberRunnerScene } from './cyber-runner/scenes/CyberRunnerScene';
import { CyberRunnerGameOverScene } from './cyber-runner/scenes/CyberRunnerGameOverScene';
import { CyberRunnerLevelCompleteScene } from './cyber-runner/scenes/CyberRunnerLevelCompleteScene';

import { AUTO, Game, Scale } from 'phaser';

const GAME_SCENES_REGISTRY: Record<string, Function[]> = {
    'neon-snake': [
        BootScene,
        MenuScene,
        GameScene,
        LevelCompleteScene,
        GameOverScene
    ],
    'space-impact': [
        SpaceImpactBootScene,
        SpaceImpactScene,
        SpaceImpactGameOverScene,
        SpaceImpactLevelCompleteScene
    ],
    'sudoku': [
        SudokuBootScene,
        SudokuScene,
        SudokuGameOverScene,
        SudokuLevelCompleteScene
    ],
    'cyber-runner': [
        CyberBootScene,
        CyberRunnerScene,
        CyberRunnerGameOverScene,
        CyberRunnerLevelCompleteScene
    ]
};

const baseConfig: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#050510',
    audio: {
        noAudio: true
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    }
};

export default function StartGame(parent: string, startLevel: number = 1, gameSlug: string = 'neon-snake', arenaMode: boolean = false) {
    const scenes = GAME_SCENES_REGISTRY[gameSlug] || GAME_SCENES_REGISTRY['neon-snake'];
    const game = new Game({ 
        ...baseConfig, 
        parent,
        scene: scenes
    });
    game.registry.set('startLevel', startLevel);
    game.registry.set('gameSlug', gameSlug);
    game.registry.set('arenaMode', arenaMode);
    return game;
}

