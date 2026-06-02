'use client';

import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useArenaMatch } from '@/hooks/arena/useArenaMatch';
import { EventBus } from '@/game/EventBus';
import { IRefPhaserGame } from '@/game/PhaserGame';
import { GameplayEventSnapshot } from '@/types/arena/arena.types';
import MobileControls from '@/components/game/MobileControls';
import SpaceImpactMobileControls from '@/components/game/SpaceImpactMobileControls';
import { Loader2, ShieldAlert, Cpu, Swords, Zap, RefreshCw, LogOut, Trophy } from 'lucide-react';
import Link from 'next/link';
import { getGameById } from '@/lib/games';

// Dynamically import Phaser game to ensure it only evaluates in the browser
const PhaserGame = dynamic(() => import('@/game/PhaserGame').then(mod => mod.PhaserGame), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] aspect-[4/3] flex items-center justify-center bg-zinc-950 border-2 border-neon-cyan/50 rounded-lg">
      <div className="text-neon-cyan font-mono animate-pulse uppercase tracking-widest text-xs">Loading Arcade Engine...</div>
    </div>
  )
});

export default function ArenaMatchPage() {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const params = useParams();
  const router = useRouter();
  
  const matchId = params?.id as string;
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // States for active gameplay metrics
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1.0);
  const [maxCombo, setMaxCombo] = useState(1.0);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  // Refs for tracking event snapshot timelines
  const eventsRef = useRef<GameplayEventSnapshot[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const maxComboRef = useRef<number>(1.0);

  const searchParams = useSearchParams();
  const gameIdParam = searchParams?.get('gameId');
  const queryGameId = gameIdParam ? parseInt(gameIdParam, 10) : 1;

  const {
    uiState,
    activeMatch,
    sessionRecovered,
    recoveryError,
    sessionTimeRemaining,
    tabAuthority,
    showClaimButton,
    claimPlayAuthority,
    startMatchSession,
    submitMatchScore,
    retryRecovery,
    leaveQueue
  } = useArenaMatch(queryGameId, 'BRONZE', getAccessToken, matchId);

  // Redirect back to Arena Hub if match is cancelled or idle
  useEffect(() => {
    if (ready && sessionRecovered && (uiState === 'CANCELLED' || uiState === 'IDLE')) {
      console.log('[Arena][Match] Match cancelled or idle. Redirecting back to Hub...');
      router.push(`/arena?gameId=${queryGameId}`);
    }
  }, [ready, sessionRecovered, uiState, router, queryGameId]);

  const activeGame = activeMatch ? getGameById(activeMatch.gameId) : getGameById(queryGameId);
  const gameSlug = activeGame?.routeSlug ?? 'neon-snake';

  const isPageReloadingRef = useRef(false);
  const uiStateRef = useRef(uiState);
  const tokenRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const token = await getAccessToken();
        tokenRef.current = token;
      } catch {}
    };
    fetchToken();
  }, [getAccessToken]);

  // Window unload listener (differentiates in-app nav vs. page reload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      isPageReloadingRef.current = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // React unmount instant-forfeit hook (when navigating away in-app)
  useEffect(() => {
    return () => {
      if (!isPageReloadingRef.current && uiStateRef.current === 'ACTIVE') {
        console.log('[Arena][Unmount] Player navigated away during active match. Triggering instant forfeit...');
        const localMatchId = localStorage.getItem('rcade_active_match_id') || matchId;
        if (localMatchId) {
          const token = tokenRef.current ? `Bearer ${tokenRef.current}` : '';
          // Fast-path dead call first to settle match instantly & notify opponent
          fetch('/api/arena/session/dead', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token
            },
            body: JSON.stringify({ matchId: localMatchId })
          }).then(() => {
            const payload = {
              matchId: localMatchId,
              score: 0,
              duration: 100,
              replayInputs: { events: [{ t: 100, e: 'forfeit', x: 400, y: 300 }] },
              seed: 'system-seed-v1',
              completed: false
            };

            fetch('/api/arena/session/complete', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': token
              },
              body: JSON.stringify(payload)
            }).catch(err => console.error('[Arena][Unmount] Instant forfeit telemetry failed:', err));
          }).catch(err => console.error('[Arena][Unmount] Instant forfeit dead notify failed:', err));
        }
      }
    };
  }, [matchId]);

  const handleForfeitMatch = async () => {
    const confirmLeave = window.confirm("Are you sure you want to forfeit this match? This will result in an immediate defeat.");
    if (!confirmLeave) return;

    console.log('[Arena][Match] User clicked forfeit match. Terminating round...');
    const localMatchId = localStorage.getItem('rcade_active_match_id') || matchId;
    if (localMatchId) {
      try {
        await fetch('/api/arena/session/dead', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenRef.current ? `Bearer ${tokenRef.current}` : ''
          },
          body: JSON.stringify({ matchId: localMatchId })
        });
      } catch (err) {
        console.error('[Arena][Match] Forfeit dead notification failed:', err);
      }
    }
    await submitMatchScore(0, 100, { events: [{ t: 100, e: 'forfeit', x: 400, y: 300 }] }, false);
  };

  // Sync Phaser instance to global window for robust cleanup unmount sweeps
  useEffect(() => {
    if (phaserRef.current?.game) {
      console.log('[Arena][Phaser] Binding active Phaser game instance to global window.');
      (window as any).sizeGameInstance = phaserRef.current.game;
    }
    return () => {
      if (typeof window !== 'undefined' && (window as any).sizeGameInstance) {
        try {
          console.log('[Arena][Phaser] Unmount clean: Demolishing active Phaser instance.');
          (window as any).sizeGameInstance.destroy(true);
          (window as any).sizeGameInstance = null;
        } catch (err) {
          console.error('[Arena][Phaser] Demolishing Phaser reference failed:', err);
        }
      }
    };
  }, [phaserRef.current?.game]);

  // Shut down Phaser inputs in passive observer mode
  useEffect(() => {
    if (tabAuthority === 'OBSERVER') {
      console.log('[Arena][Authority] Passive observer detected. Deactivating Phaser inputs.');
      if (phaserRef.current?.game) {
        (phaserRef.current.game.input.keyboard as any)?.shutdown();
      }
    }
  }, [tabAuthority, phaserRef.current?.game]);

  // Viewport scroll locks for Mobile touch environments (Refinement 9)
  useEffect(() => {
    if (uiState !== 'ACTIVE') return;

    // Prevent body bounce on touch viewports
    document.body.style.overscrollBehaviorY = 'contain';
    document.body.style.overflow = 'hidden';

    const preventDefaultTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      // Block overscroll bounce on body but allow swipes on actual game elements
      if (!target.closest('#game-container') && !target.closest('.touch-none')) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('touchmove', preventDefaultTouchMove, { passive: false });

    return () => {
      document.body.style.overscrollBehaviorY = '';
      document.body.style.overflow = '';
      window.removeEventListener('touchmove', preventDefaultTouchMove);
    };
  }, [uiState]);

  // Phaser HUD state bindings
  useEffect(() => {
    if (uiState !== 'ACTIVE') return;

    const onScore = (data: any) => {
      const s = typeof data === 'object' ? data.score : data;
      const x = typeof data === 'object' ? data.x : 400;
      const y = typeof data === 'object' ? data.y : 300;
      setScore(s);
      eventsRef.current.push({
        t: Date.now() - startTimeRef.current,
        e: 'pellet',
        x,
        y,
        val: s
      });
    };

    const onCombo = (data: any) => {
      const c = typeof data === 'object' ? data.combo : data;
      const x = typeof data === 'object' ? data.x : 400;
      const y = typeof data === 'object' ? data.y : 300;
      setCombo(c);
      if (c > maxComboRef.current) {
        maxComboRef.current = c;
        setMaxCombo(c);
      }
      eventsRef.current.push({
        t: Date.now() - startTimeRef.current,
        e: 'combo_up',
        x,
        y,
        val: c
      });
    };

    const onDirectionChanged = (data: { x: number; y: number; dx: number; dy: number }) => {
      eventsRef.current.push({
        t: Date.now() - startTimeRef.current,
        e: 'dir_change',
        x: data.x,
        y: data.y,
        val: `${data.dx},${data.dy}`
      });
    };

    const onTelemetryEvent = (data: { e: string; x: number; y: number; val?: any }) => {
      eventsRef.current.push({
        t: Date.now() - startTimeRef.current,
        e: data.e as any,
        x: data.x,
        y: data.y,
        val: data.val
      });
    };

    const onGameStarted = () => {
      setScore(0);
      setCombo(1.0);
      setMaxCombo(1.0);
      maxComboRef.current = 1.0;
      eventsRef.current = [];
      startTimeRef.current = Date.now();
    };

    const onMatchCompletedEvent = (data: any) => {
      console.log('[ARENA_CLIENT] MATCH_COMPLETED received via EventBus inside MatchPage:', data);
      setShowResultOverlay(true);
      if (phaserRef.current?.game) {
        console.log('[ARENA_CLIENT] Instantly freezing Phaser simulation from Page context.');
        try {
          phaserRef.current.game.scene.scenes.forEach(scene => {
            (scene as any).isMatchOver = true;
            (scene as any).isTransitioning = true;
            if (scene.physics && typeof scene.physics.pause === 'function') {
              try {
                scene.physics.pause();
              } catch {}
            }
            scene.scene.pause();
            if ((scene as any).player?.body) {
              try {
                (scene as any).player.setVelocity(0, 0);
              } catch {}
            }
            if ((scene as any).snake) {
              (scene as any).snake.baseSpeed = 0;
            }
          });
          if (phaserRef.current.game.input.keyboard) {
            phaserRef.current.game.input.keyboard.enabled = false;
          }
        } catch (err) {
          console.warn('[ARENA_CLIENT] Redundant Phaser freeze failed:', err);
        }
      }
    };

    EventBus.on('score-changed', onScore);
    EventBus.on('combo-changed', onCombo);
    EventBus.on('direction-changed', onDirectionChanged);
    EventBus.on('telemetry-event', onTelemetryEvent);
    EventBus.on('game-started', onGameStarted);
    EventBus.on('match-completed', onMatchCompletedEvent);

    return () => {
      EventBus.removeListener('score-changed', onScore);
      EventBus.removeListener('combo-changed', onCombo);
      EventBus.removeListener('direction-changed', onDirectionChanged);
      EventBus.removeListener('telemetry-event', onTelemetryEvent);
      EventBus.removeListener('game-started', onGameStarted);
      EventBus.removeListener('match-completed', onMatchCompletedEvent);
    };
  }, [uiState]);

  // Phaser complete/forfeit scoring bindings
  useEffect(() => {
    if (uiState !== 'ACTIVE') return;

    const handleSaveRun = async (runData: {
      score: number;
      combo: number;
      duration: number;
      completed: boolean;
    }) => {
      console.log('[Arena][Match] Game Scene complete emitted. Processing verification payload...');

      // Prevent duplicate input streams
      if (phaserRef.current?.game?.input?.keyboard) {
        phaserRef.current.game.input.keyboard.enabled = false;
      }

      // Add final collision snapshot event
      eventsRef.current.push({
        t: runData.duration,
        e: 'collision',
        x: 400,
        y: 300
      });

      if (!runData.completed) {
        // Player died! Immediately trigger fast-path death endpoint
        console.log('[Arena][Match] Player died locally. Triggering authoritative server-side match termination...');
        const localMatchId = localStorage.getItem('rcade_active_match_id') || matchId;
        if (localMatchId) {
          fetch('/api/arena/session/dead', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': tokenRef.current ? `Bearer ${tokenRef.current}` : ''
            },
            body: JSON.stringify({ matchId: localMatchId })
          }).then(async (res) => {
            console.log('[Arena][Match] Fast-path death registered on server.', res.status);
            // Asynchronously submit score & replay logs afterwards
            await submitMatchScore(
              runData.score,
              runData.duration,
              { events: eventsRef.current },
              false
            );
          }).catch(err => {
            console.error('[Arena][Match] Fast-path death registration failed:', err);
          });
        }
      } else {
        // Normal completion (e.g. Sudoku solved, or level cleared)
        await submitMatchScore(
          runData.score,
          runData.duration,
          { events: eventsRef.current },
          runData.completed
        );
      }
    };

    EventBus.on('save-run', handleSaveRun);
    return () => {
      EventBus.removeListener('save-run', handleSaveRun);
    };
  }, [uiState, matchId, submitMatchScore]);  // Freeze Phaser game when matchmaking/gameplay session ends (e.g. COMPLETED due to opponent death/first blood)
  useEffect(() => {
    const isGameEnded = uiState === 'COMPLETED' || uiState === 'SUBMITTED' || uiState === 'VERIFIED' || uiState === 'DISPUTED';
    if (isGameEnded && phaserRef.current?.game) {
      console.log('[Arena][Match] Gameplay state ended. Freezing active Phaser simulation.');
      try {
        phaserRef.current.game.scene.scenes.forEach(scene => {
          if (scene.physics && typeof scene.physics.pause === 'function') {
            try {
              scene.physics.pause();
            } catch {}
          }
          scene.scene.pause();
          (scene as any).isTransitioning = true;
          if ((scene as any).player?.setVelocity) {
            (scene as any).player.setVelocity(0, 0);
          }
          if ((scene as any).snake) {
            (scene as any).snake.baseSpeed = 0;
          }
        });
        if (phaserRef.current.game.input.keyboard) {
          phaserRef.current.game.input.keyboard.enabled = false;
        }
      } catch (err) {
        console.warn('[Arena][Match] Phaser freeze failed:', err);
      }
    }
  }, [uiState]);

  // Monitor redirects if match already resolved (with a 3-second delay if gameplay is active)
  useEffect(() => {
    if (!ready || !sessionRecovered) return;

    if (!authenticated) {
      router.push('/arena');
      return;
    }

    const isEndingState = uiState === 'SUBMITTED' || uiState === 'VERIFIED' || uiState === 'COMPLETED' || uiState === 'DISPUTED';
    if (!isEndingState) return;

    // Check if the game is already in progress and needs a transition overlay delay
    const isGameplayActive = phaserRef.current?.game !== undefined && phaserRef.current?.game !== null;

    if (isGameplayActive) {
      console.log('[Arena][Match] End state detected during active play. Commencing delayed transition overlay...');
      setShowResultOverlay(true);
      const timer = setTimeout(() => {
        router.push(`/arena/match/${matchId}/result?gameId=${queryGameId}`);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      // If we are mounting directly onto a completed/settled match state, redirect immediately
      router.push(`/arena/match/${matchId}/result?gameId=${queryGameId}`);
    }
  }, [ready, authenticated, sessionRecovered, uiState, matchId, router, queryGameId]);
  // Loading phase
  if (!ready || !sessionRecovered) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] font-mono text-xs text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
        <span className="uppercase tracking-[0.2em]">SYNCHRONIZING ACTIVE ARENA CHANNELS...</span>
      </div>
    );
  }

  // Lock game canvas if match is not active or already completed (Reload exploit prevention)
  const isMatchEnded = uiState === 'COMPLETED' || uiState === 'SUBMITTED' || uiState === 'VERIFIED' || uiState === 'DISPUTED' || uiState === 'CANCELLED';
  if (isMatchEnded) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[600px] font-mono text-zinc-500 gap-3 bg-[#010101] text-center px-4">
        <Loader2 className="w-8 h-8 animate-spin text-neon-cyan mx-auto mb-2" />
        <span className="uppercase tracking-[0.2em] text-xs">MATCH RESOLVED. TRANSLATING TELEMETRY PORTAL...</span>
      </div>
    );
  }

  // Guard page if uiState is IDLE
  if (uiState === 'IDLE') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[600px] font-mono text-zinc-500 gap-3 bg-[#010101] text-center px-4">
        <Loader2 className="w-8 h-8 animate-spin text-neon-cyan mx-auto mb-2" />
        <span className="uppercase tracking-[0.2em] text-xs">VERIFYING GAME SESSION ACCESS...</span>
      </div>
    );
  }

  // 10-second Recovery watchdogs (Refinement 10)
  if (recoveryError) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[600px] text-center px-4 font-mono">
        <div className="p-8 border border-red-500/30 rounded-2xl bg-zinc-950 max-w-md w-full relative">
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-red-500" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-red-500" />
          
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-5 animate-pulse" />
          <h2 className="font-heading font-black text-2xl text-white uppercase tracking-tight mb-2">
            RECOVERY TIMEOUT
          </h2>
          <p className="text-zinc-500 text-[11px] mb-8 uppercase tracking-widest leading-relaxed">
            {recoveryError}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={retryRecovery}
              className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:border-red-500/50 hover:bg-red-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              RETRY RECOVERY
            </button>
            <Link
              href="/arena"
              className="w-full py-3 bg-zinc-950 border border-zinc-800 text-zinc-400 font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:border-zinc-500 hover:text-white transition-all text-center uppercase"
            >
              RETURN TO ARENA
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // State: MATCHED / COUNTDOWN (Pairing found, initiating handshake variables)
  if (uiState === 'MATCHED' || uiState === 'COUNTDOWN') {
    const opp = activeMatch?.players.find(p => p.userId !== (activeMatch?.winnerId || 'self'));
    const opponentName = opp?.username || 'CYBER_RIVAL';
    
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[600px] text-center px-4 font-mono relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
        
        <div className="p-8 border border-zinc-900 rounded-2xl bg-zinc-950/60 max-w-lg w-full relative">
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-neon-cyan" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-neon-cyan" />
          
          <Swords className="w-12 h-12 text-neon-cyan mx-auto mb-6 animate-pulse" />
          <h1 className="font-heading font-black text-3xl text-white uppercase tracking-tight mb-1">
            DUEL FOUND
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-6 font-bold">
            CRYPTOGRAPHIC SEED MATCH READY
          </p>

          <div className="flex justify-between items-center bg-zinc-950 border border-zinc-900/80 rounded-xl p-5 mb-8">
            <div className="text-left">
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">CHALLENGER</div>
              <div className="text-sm font-black text-neon-cyan">YOU</div>
            </div>
            <div className="text-zinc-700 font-black text-xs uppercase tracking-widest">VS</div>
            <div className="text-right">
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">DEFENDER</div>
              <div className="text-sm font-black text-neon-magenta uppercase">{opponentName}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={startMatchSession}
              className="w-full py-4 bg-neon-cyan text-black font-heading font-black text-xs tracking-[0.2em] hover:brightness-110 transition-all rounded-lg uppercase cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            >
              INITIALIZE DYNAMIC SEED
            </button>
            <button
              onClick={leaveQueue}
              className="w-full py-3.5 bg-zinc-950 border border-zinc-800 text-zinc-400 font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/10 transition-all text-center uppercase cursor-pointer"
            >
              CANCEL MATCH
            </button>
          </div>
        </div>
      </div>
    );
  }

  // State: ACTIVE_MATCH (Full gameplay canvas renders)
  return (
    <div className="flex-grow bg-[#010101] py-8 px-4 font-mono relative overflow-hidden flex flex-col items-center">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
      
      {/* HUD Layout */}
      <div className="w-full max-w-[800px] mb-6 bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex justify-between items-center gap-4 flex-wrap">
        <div className="flex gap-6 items-center flex-wrap">
          <div className="font-heading text-base">
            <span className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold block mb-0.5">SCORE</span>
            <span className="text-neon-cyan font-black text-xl drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">{score}</span>
          </div>
          <div className="font-heading text-base">
            <span className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold block mb-0.5">MULTIPLIER</span>
            <span className={`font-black text-xl transition-all ${combo > 2 ? 'text-neon-magenta animate-pulse' : 'text-yellow-400'}`}>
              x{combo.toFixed(1)}
            </span>
          </div>
          <div className="font-heading text-base">
            <span className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold block mb-0.5">PEAK</span>
            <span className="text-white font-black text-xl">{maxCombo.toFixed(1)}</span>
          </div>
        </div>

        {/* Action Button & Status Badge */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleForfeitMatch}
            className="px-3 py-2 border border-red-500/30 text-red-500 hover:border-red-500 hover:bg-red-500/10 hover:text-white hover:shadow-[0_0_15px_rgba(239,68,68,0.35)] text-[9px] font-black uppercase tracking-[0.2em] rounded-lg transition-all cursor-pointer animate-pulse hover:animate-none"
          >
            FORFEIT MATCH
          </button>
          
          <div className="flex-shrink-0 px-4 py-2 border border-neon-cyan/20 bg-neon-cyan/5 text-neon-cyan rounded-lg text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
            FIRST BLOOD DUEL
          </div>
        </div>
      </div>

      {/* Phaser Canvas Wrapper */}
      <div className="relative w-full max-w-[800px] mx-auto select-none rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950/80">
        <PhaserGame ref={phaserRef} startLevel={1} gameSlug={gameSlug} arenaMode={true} />
        
        {/* Lock touches for mobile controls */}
        <div className="md:hidden mt-8 mb-10 w-full flex justify-center touch-none">
          {gameSlug === 'space-impact' ? (
            <SpaceImpactMobileControls onInput={action => {
              if (tabAuthority === 'CONTROLLER' && uiState === 'ACTIVE') {
                EventBus.emit('mobile-input', action);
              }
            }} />
          ) : (
            <MobileControls onInput={dir => {
              if (tabAuthority === 'CONTROLLER' && uiState === 'ACTIVE') {
                EventBus.emit('mobile-input', dir);
              }
            }} />
          )}
        </div>

        {/* Dynamic Observer Lock Overlay */}
        {tabAuthority === 'OBSERVER' && (
          <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-50">
            <ShieldAlert className="w-12 h-12 text-neon-magenta mb-4 animate-pulse" />
            <h3 className="font-heading font-black text-lg text-white uppercase tracking-tight mb-2">
              ACTIVE MATCH CONTROLLED IN ANOTHER TAB
            </h3>
            <p className="text-zinc-500 text-[10px] max-w-sm mb-6 uppercase tracking-widest leading-relaxed">
              This window is now a passive recovery observer. Only one browser tab may control gameplay inputs.
            </p>
            {showClaimButton && (
              <button
                onClick={claimPlayAuthority}
                className="py-3 px-6 bg-neon-magenta text-black font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:brightness-110 transition-all uppercase shadow-[0_0_20px_rgba(255,0,230,0.3)] cursor-pointer"
              >
                CLAIM PLAY AUTHORITY
              </button>
            )}
          </div>
        )}

        {/* Dynamic Premium Game Over Transition Overlay */}
        {showResultOverlay && (
          <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-50 font-mono">
            {/* Cyberpunk grid lines & glows */}
            <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
            <div className="absolute top-0 left-0 w-8 h-[1px] bg-neon-cyan" />
            <div className="absolute top-0 left-0 w-[1px] h-8 bg-neon-cyan" />
            <div className="absolute bottom-0 right-0 w-8 h-[1px] bg-neon-magenta" />
            <div className="absolute bottom-0 right-0 w-[1px] h-8 bg-neon-magenta" />

            {/* Check if we are the winner */}
            {(() => {
              const currentUserId = user?.id || (typeof window !== 'undefined' ? localStorage.getItem('rcade_user_id') : '');
              const isSettled = activeMatch?.status === 'COMPLETED' || activeMatch?.status === 'FORFEITED' || activeMatch?.status === 'INVALIDATED';
              
              if (!isSettled) {
                return (
                  <>
                    <RefreshCw className="w-16 h-16 text-neon-cyan mb-6 animate-spin" />
                    <h2 className="font-heading font-black text-4xl text-neon-cyan uppercase tracking-tighter mb-2 drop-shadow-[0_0_15px_rgba(0,240,255,0.5)]">
                      VERIFYING DUEL RESULTS
                    </h2>
                    <p className="text-zinc-400 text-xs uppercase tracking-[0.2em] mb-4">
                      Securing Cryptographic Telemetry Seeds
                    </p>
                  </>
                );
              }

              const isWinner = activeMatch?.winnerId === currentUserId;
              const isDraw = activeMatch?.winnerId === null && activeMatch?.status === 'COMPLETED';
              
              if (isDraw) {
                return (
                  <>
                    <Zap className="w-16 h-16 text-yellow-400 mb-6 animate-bounce fill-yellow-400/20" />
                    <h2 className="font-heading font-black text-4xl text-yellow-400 uppercase tracking-tighter mb-2 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">
                      DRAW DETECTED
                    </h2>
                    <p className="text-zinc-400 text-xs uppercase tracking-[0.2em] mb-4">
                      Identical Milestones Exchanged
                    </p>
                  </>
                );
              }

              if (isWinner) {
                return (
                  <>
                    <Trophy className="w-16 h-16 text-yellow-500 mb-6 animate-bounce fill-yellow-500/20" />
                    <h2 className="font-heading font-black text-5xl text-green-400 uppercase tracking-tighter mb-2 drop-shadow-[0_0_20px_rgba(74,222,128,0.6)]">
                      VICTORY SECURED
                    </h2>
                    <p className="text-zinc-400 text-xs uppercase tracking-[0.2em] mb-4">
                      Defeated Challenger authoritatively
                    </p>
                  </>
                );
              }

              return (
                <>
                  <ShieldAlert className="w-16 h-16 text-neon-magenta mb-6 animate-pulse" />
                  <h2 className="font-heading font-black text-5xl text-neon-magenta uppercase tracking-tighter mb-2 drop-shadow-[0_0_20px_rgba(255,0,133,0.6)]">
                    DEFEAT REGISTERED
                  </h2>
                  <p className="text-zinc-400 text-xs uppercase tracking-[0.2em] mb-4">
                    Milestone capacity breached
                  </p>
                </>
              );
            })()}

            {/* Micro progress bar loading the results page */}
            <div className="w-48 bg-zinc-950 border border-zinc-800 h-2 p-0.5 rounded overflow-hidden relative mb-2">
              <div className="bg-neon-cyan h-full rounded animate-pulse w-full" />
            </div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.25em]">
              SYNCHRONIZING SECURE TELEMETRY RESULTS...
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
