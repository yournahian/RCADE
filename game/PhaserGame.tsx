'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EventBus } from './EventBus';
import StartGame from './main';
import { Game } from 'phaser';

export interface IRefPhaserGame {
    game: Game | null;
    scene: Phaser.Scene | null;
}

export const PhaserGame = forwardRef<IRefPhaserGame, { startLevel?: number; gameSlug?: string; arenaMode?: boolean }>(function PhaserGame({ startLevel, gameSlug = 'neon-snake', arenaMode = false }, ref) {
    const game = useRef<Game | null>(null);
    const [crashError, setCrashError] = useState<string | null>(null);

    useLayoutEffect(() => {
        const handleGlobalError = (event: ErrorEvent) => {
            console.error('[PhaserGame][Crash] Captured runtime failure:', event.error);
            setCrashError(event.error?.stack || event.message);
        };
        
        window.addEventListener('error', handleGlobalError);

        if (game.current === null) {
            try {
                game.current = StartGame('game-container', startLevel || 1, gameSlug, arenaMode);

                if (typeof ref === 'function') {
                    ref({ game: game.current, scene: null });
                } else if (ref) {
                    ref.current = { game: game.current, scene: null };
                }
            } catch (err: any) {
                console.error('[PhaserGame][SyncBoot] Crash during sync StartGame call:', err);
                setCrashError(err.stack || err.message);
            }
        }

        return () => {
            window.removeEventListener('error', handleGlobalError);
            if (game.current) {
                game.current.destroy(true);
                game.current = null;
            }
        };
    }, [ref, startLevel, gameSlug, arenaMode]);

    useEffect(() => {
        const handleSceneReady = (scene: Phaser.Scene) => {
            if (typeof ref === 'function') {
                ref({ game: game.current, scene });
            } else if (ref) {
                ref.current = { game: game.current, scene };
            }
        };

        EventBus.on('current-scene-ready', handleSceneReady);

        return () => {
            EventBus.removeListener('current-scene-ready', handleSceneReady);
        };
    }, [ref]);

    return (
        <div id="game-container" className="w-full h-full max-w-[800px] max-h-[600px] aspect-[4/3] mx-auto rounded-lg overflow-hidden border-2 border-neon-cyan shadow-[0_0_20px_rgba(0,240,255,0.4)] relative z-10">
            {crashError && (
                <div className="absolute inset-0 bg-[#0d0202] border border-red-500 text-red-400 p-6 flex flex-col items-center justify-center font-mono text-xs z-50 overflow-auto">
                    <h3 className="font-heading font-black text-lg text-white mb-2 uppercase tracking-wide">
                        LOBBY ENGINE CRASH DETECTED
                    </h3>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">
                        Visual Diagnostic telemetry Console
                    </p>
                    <pre className="whitespace-pre-wrap max-w-full text-left leading-relaxed text-[10px] bg-[#050101] p-4 border border-red-500/20 rounded shadow-inner">
                        {crashError}
                    </pre>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase rounded cursor-pointer transition-colors"
                    >
                        Reboot Console
                    </button>
                </div>
            )}
        </div>
    );
});
