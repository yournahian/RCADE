'use client';

import dynamic from 'next/dynamic';
import { useRef, useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { IRefPhaserGame } from '@/game/PhaserGame';
import { EventBus } from '@/game/EventBus';
import MobileControls from '@/components/game/MobileControls';
import SpaceImpactMobileControls from '@/components/game/SpaceImpactMobileControls';
import SudokuMobileControls from '@/components/game/SudokuMobileControls';
import Link from 'next/link';
import { ApiService } from '@/services/api';
import { Lock, Play } from 'lucide-react';
import { getGameBySlug } from '@/lib/games';

const PhaserGame = dynamic(() => import('@/game/PhaserGame').then(mod => mod.PhaserGame), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[600px] flex items-center justify-center bg-arcade-dark border-2 border-neon-cyan/50 rounded-lg">
      <div className="text-neon-cyan font-heading animate-pulse">LOADING ENGINE...</div>
    </div>
  )
});

// ─── Completion state ────────────────────────────────────────────────────────
interface CompletionState {
  show: boolean;
  reward: any | null;         // PREPARED reward from session/complete
  completedLevel: number;     // the level that was just beaten
  nextLevelUnlocked: boolean; // whether they can play the next level immediately
}

const IDLE_STATE: CompletionState = {
  show: false,
  reward: null,
  completedLevel: 0,
  nextLevelUnlocked: false,
};

// ─── Rarity helpers ──────────────────────────────────────────────────────────
function rarityColor(rarity: string) {
  switch (rarity) {
    case 'Legendary': return '#ffd700';
    case 'Epic':      return '#b026ff';
    case 'Rare':      return '#00f0ff';
    default:          return '#aaaaaa';
  }
}
function rarityGlow(rarity: string) {
  switch (rarity) {
    case 'Legendary': return 'shadow-[0_0_50px_rgba(255,215,0,0.5)]';
    case 'Epic':      return 'shadow-[0_0_40px_rgba(176,38,255,0.4)]';
    case 'Rare':      return 'shadow-[0_0_30px_rgba(0,240,255,0.3)]';
    default:          return 'shadow-[0_0_20px_rgba(170,170,170,0.2)]';
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
function PlayContent() {
  const { getAccessToken } = usePrivy();
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const router = useRouter();
  const params = useParams();

  const gameSlug = params?.gameSlug as string;
  const levelParam = params?.level as string;

  // Validate game exists and is LIVE
  const game = getGameBySlug(gameSlug);
  
  // HUD state (display only)
  const [score, setScore] = useState(0);
  const [targetScore, setTargetScore] = useState(100);
  const [combo, setCombo] = useState(1.0);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  /**
   * STRICT WEB3: The ONLY authority for what level the player may play.
   * Set exclusively by createSession() after syncing effectiveProgressionLevel
   * from the backend.
   */
  const [authorizedLevel, setAuthorizedLevel] = useState(1);

  // Completion overlay state
  const [completion, setCompletion] = useState<CompletionState>(IDLE_STATE);

  // ─── Refs (prevent stale closures in once-registered EventBus handlers) ────
  const sessionIdRef = useRef<string | null>(null);
  const authorizedLevelRef = useRef<number>(1);
  const getAccessTokenRef = useRef(getAccessToken);
  const gameSlugRef = useRef(gameSlug);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { authorizedLevelRef.current = authorizedLevel; }, [authorizedLevel]);
  useEffect(() => { getAccessTokenRef.current = getAccessToken; }, [getAccessToken]);
  useEffect(() => { gameSlugRef.current = gameSlug; }, [gameSlug]);

  // ─── createSession ────────────────────────────────────────────────────────
  const createSession = useCallback(async (requestedLevel: number): Promise<{ success: boolean; level: number; effectiveProgressionLevel: number }> => {
    try {
      const token = await getAccessTokenRef.current();
      const currentSlug = gameSlugRef.current;

      // Layer 1: frontend sync
      let authorizedNextLevel = requestedLevel;
      let effectiveProg = 0;
      try {
        const syncRes = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          // Progression is calculated dynamically for the active game
          const progRes = await fetch(`/api/session/progression?gameSlug=${currentSlug}`, {
             headers: { Authorization: `Bearer ${token}` }
          });
          if (progRes.ok) {
            const progData = await progRes.json();
            effectiveProg = progData.effectiveProgressionLevel ?? 0;
          } else {
            effectiveProg = syncData.user?.effectiveProgressionLevel ?? 0;
          }
          const maxAllowed = effectiveProg + 1;
          console.log(`[Play] Sync → effectiveProgressionLevel=${effectiveProg}, maxAllowed=${maxAllowed}, requested=${requestedLevel}`);
          authorizedNextLevel = Math.max(1, Math.min(requestedLevel, maxAllowed));
        }
      } catch (syncErr) {
        console.warn('[Play] Sync failed — backend gate will enforce:', syncErr);
      }

      // Layer 2: backend gate
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ level: authorizedNextLevel, gameSlug: currentSlug })
      });

      if (res.ok) {
        const data = await res.json();
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
        setAuthorizedLevel(authorizedNextLevel);
        authorizedLevelRef.current = authorizedNextLevel;
        return { success: true, level: authorizedNextLevel, effectiveProgressionLevel: effectiveProg };
      } else {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Play] Session rejected:', errData);
        setSessionError(errData.error || 'Level locked');
        setSessionId(null);
        sessionIdRef.current = null;
        return { success: false, level: authorizedNextLevel, effectiveProgressionLevel: effectiveProg };
      }
    } catch (e: any) {
      console.error('[Play] createSession error:', e);
      setSessionError(e.message || 'Network error');
      setSessionId(null);
      sessionIdRef.current = null;
      return { success: false, level: requestedLevel, effectiveProgressionLevel: 0 };
    }
  }, []); // no deps — reads via refs

  // ─── Init session on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!game || game.status !== 'LIVE') {
      router.push('/play');
      return;
    }

    async function init() {
      try {
        const startLevel = (levelParam && !isNaN(parseInt(levelParam, 10)))
          ? parseInt(levelParam, 10) : 1;
        await createSession(startLevel);
      } finally {
        setIsInitializing(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSlug, levelParam, game]);

  // ─── HUD-only Phaser listeners ───────────────────────────────────────
  useEffect(() => {
    const onScore = (s: number) => setScore(s);
    const onTarget = (t: number) => setTargetScore(t);
    const onCombo = (c: number) => setCombo(c);
    const onGameStarted = () => { setScore(0); setCombo(1.0); };
    const onLevelChanged = (l: number) =>
      console.log(`[Play] Phaser level-changed=${l} (informational; authorizedLevel=${authorizedLevelRef.current})`);

    EventBus.on('score-changed', onScore);
    EventBus.on('target-changed', onTarget);
    EventBus.on('combo-changed', onCombo);
    EventBus.on('game-started', onGameStarted);
    EventBus.on('level-changed', onLevelChanged);

    return () => {
      EventBus.removeListener('score-changed', onScore);
      EventBus.removeListener('target-changed', onTarget);
      EventBus.removeListener('combo-changed', onCombo);
      EventBus.removeListener('game-started', onGameStarted);
      EventBus.removeListener('level-changed', onLevelChanged);
    };
  }, []);

  // ─── Run save + next-level (registered once, uses refs) ──────────────────
  useEffect(() => {
    const handleSaveRun = async (runData: {
      level: number; score: number; combo: number; duration: number; completed: boolean;
    }) => {
      const sid = sessionIdRef.current;
      const lvl = authorizedLevelRef.current;
      const currentSlug = gameSlugRef.current;
      if (!sid) { EventBus.emit('run-saved'); return; }

      try {
        const completeRes = await ApiService.fetchWithAuth('/api/session/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, gameSlug: currentSlug, ...runData })
        }, getAccessTokenRef.current);

        let reward = null;
        if (completeRes.ok && runData.completed) {
          const completeData = await completeRes.json();
          reward = completeData.reward ?? null;
        }

        // Sync and re-create session at the same level (Web3 rules)
        const result = await createSession(lvl);
        
        if (runData.completed) {
            const nextLevelUnlocked = result.effectiveProgressionLevel >= lvl;
            setCompletion({
                show: true,
                reward,
                completedLevel: lvl,
                nextLevelUnlocked
            });
        }

        EventBus.emit('run-saved');
      } catch (e) {
        console.error('[Play] Failed to save run:', e);
        EventBus.emit('run-saved');
      }
    };

    const handleRequestNextLevel = async () => {
      const lvl = authorizedLevelRef.current;
      console.log(`[Play] request-next-level fallback. Requesting level ${lvl + 1}...`);
      const result = await createSession(lvl + 1);
      if (phaserRef.current?.scene) {
        const sceneKey = gameSlugRef.current === 'space-impact' ? 'SpaceImpactScene' : gameSlugRef.current === 'sudoku' ? 'SudokuScene' : 'GameScene';
        phaserRef.current.scene.scene.start(sceneKey, { level: result.level, score: 0 });
      }
    };

    EventBus.on('save-run', handleSaveRun);
    EventBus.on('request-next-level', handleRequestNextLevel);

    return () => {
      EventBus.removeListener('save-run', handleSaveRun);
      EventBus.removeListener('request-next-level', handleRequestNextLevel);
    };
  }, [createSession]);

  // ─── "Play next level" ──────────────────────────────
  const handlePlayNextLevel = useCallback(() => {
    const nextLevel = completion.completedLevel + 1;
    setCompletion(IDLE_STATE);
    
    // Smooth transition to next dynamic route
    router.push(`/play/${gameSlug}/level/${nextLevel}`);
  }, [completion.completedLevel, gameSlug, router]);

  // ─── Dismiss overlay (replay same level) ─────────────────────────────────
  const handleDismissOverlay = useCallback(() => {
    const lvl = completion.completedLevel;
    setCompletion(IDLE_STATE);
    if (phaserRef.current?.scene) {
      const sceneKey = gameSlugRef.current === 'space-impact' ? 'SpaceImpactScene' : gameSlugRef.current === 'sudoku' ? 'SudokuScene' : 'GameScene';
      phaserRef.current.scene.scene.start(sceneKey, { level: lvl, score: 0 });
    }
  }, [completion.completedLevel]);
  
  const handleGoToVault = useCallback(() => {
      router.push('/dashboard');
  }, [router]);

  const progressPercent = Math.min(100, Math.max(0, (score / targetScore) * 100));

  if (!game || game.status !== 'LIVE') {
    return null;
  }

  // ─── Loading / error screens ──────────────────────────────────────────────
  if (isInitializing) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-arcade-dark">
        <div className="text-neon-cyan font-heading animate-pulse text-2xl">Validating {game.title} Access...</div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center gap-4 bg-arcade-dark">
        <div className="text-neon-magenta font-heading text-xl">Session Invalid or Level Locked.</div>
        {sessionError && (
          <div className="text-gray-400 font-mono text-sm max-w-md text-center bg-red-900/20 p-4 rounded border border-red-500/50">
            {sessionError}
          </div>
        )}
        <Link href="/play" className="mt-4 px-6 py-2 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-black transition-colors rounded">
          Return to Game Hub
        </Link>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 flex flex-col items-center">
      {/* HUD */}
      <div className="w-full max-w-[800px] mb-4 bg-arcade-dark p-4 rounded-lg border border-neon-cyan/30 glass-panel shadow-[0_0_15px_rgba(0,240,255,0.1)]">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 md:gap-6 items-center flex-wrap">
            <div className="font-heading text-lg md:text-xl">
              <span className="text-gray-400">SCORE: </span>
              <span className="text-neon-cyan font-bold drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">{score}</span>
            </div>
            <div className="font-heading text-lg md:text-xl">
              <span className="text-gray-400">LEVEL: </span>
              <span className="text-neon-magenta font-bold drop-shadow-[0_0_8px_rgba(255,0,85,0.8)]">{authorizedLevel}</span>
            </div>
            <div className="font-heading text-lg">
              <span className="text-gray-400">COMBO: </span>
              <span className={`font-bold transition-all ${combo > 2 ? 'text-neon-purple animate-pulse drop-shadow-[0_0_10px_rgba(157,0,255,0.8)]' : 'text-yellow-400'}`}>
                x{combo.toFixed(1)}
              </span>
            </div>
          </div>
          <Link href={`/games/${gameSlug}`} className="text-sm text-gray-400 hover:text-white transition-colors border border-gray-600 rounded px-3 py-1 hover:border-white whitespace-nowrap ml-4">
            Exit
          </Link>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-neon-cyan to-neon-magenta h-2.5 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="text-right text-xs text-gray-500 mt-1">Target: {targetScore}</div>
      </div>

      {/* Game canvas */}
      <div className="relative w-full max-w-[800px] mx-auto">
        <PhaserGame ref={phaserRef} startLevel={authorizedLevel} gameSlug={gameSlug} />

        <div className="md:hidden mt-8 mb-16 w-full flex justify-center touch-none">
          {gameSlug === 'space-impact' ? (
            <SpaceImpactMobileControls onInput={action => EventBus.emit('mobile-input', action)} />
          ) : gameSlug === 'sudoku' ? (
            <SudokuMobileControls onInput={action => EventBus.emit('mobile-input', action)} />
          ) : (
            <MobileControls onInput={dir => EventBus.emit('mobile-input', dir)} />
          )}
        </div>

        {/* ─── Completion Overlay ─────────────────────────────────────────── */}
        {completion.show && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/92 backdrop-blur-md rounded-lg overflow-hidden">
            <div className="animate-in zoom-in-90 fade-in duration-500 flex flex-col items-center p-8 w-full max-w-sm">

              <h2 className="text-white font-heading text-3xl mb-1 drop-shadow-md">LEVEL {completion.completedLevel} CLEARED</h2>
              <p className="text-gray-400 font-mono text-xs uppercase tracking-widest mb-4">Asset Secured</p>

              {/* Locked next level indicator */}
              {!completion.nextLevelUnlocked && (
                  <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded border border-neon-magenta/30 bg-neon-magenta/5 text-center">
                    <Lock className="w-3.5 h-3.5 text-neon-magenta flex-shrink-0" />
                    <span className="text-neon-magenta font-mono text-xs uppercase tracking-widest">
                      Mint your NFT in the Reward Vault to unlock Level {completion.completedLevel + 1}
                    </span>
                  </div>
              )}

              {/* Reward card */}
              {completion.reward && (() => {
                const c = rarityColor(completion.reward.rarity);
                return (
                  <div
                    className={`relative w-40 h-52 border-2 rounded-xl flex flex-col items-center justify-center p-4 mb-6 ${rarityGlow(completion.reward.rarity)}`}
                    style={{ borderColor: `${c}80`, background: `${c}0d` }}
                  >
                    <div className="text-5xl mb-3 font-bold" style={{ color: c, textShadow: `0 0 15px ${c}cc` }}>
                      {completion.reward.rarity.charAt(0)}
                    </div>
                    <div className="font-heading text-lg uppercase tracking-widest" style={{ color: c }}>
                      {completion.reward.rarity}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono mt-1 uppercase">
                      Rank #{completion.reward.completionRank}
                    </div>
                  </div>
                );
              })()}

              {!completion.reward && (
                  <p className="text-gray-500 font-mono text-sm mb-6 text-center">
                    Reward is being prepared… check your Reward Vault shortly.
                  </p>
              )}

              {/* CTA Buttons */}
              {completion.nextLevelUnlocked ? (
                  <button
                    onClick={handlePlayNextLevel}
                    className="w-full py-3.5 bg-neon-cyan text-black font-heading text-lg tracking-widest hover:brightness-110 transition-all rounded mb-4 flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5 fill-black" />
                    PLAY LEVEL {completion.completedLevel + 1}
                  </button>
              ) : (
                  <button
                    onClick={handleGoToVault}
                    className="w-full py-3.5 bg-neon-purple text-white font-heading text-lg tracking-widest hover:brightness-110 transition-all rounded mb-4 shadow-[0_0_15px_rgba(157,0,255,0.4)]"
                  >
                    GO TO REWARD VAULT
                  </button>
              )}

              {/* Replay same level */}
              <button
                onClick={handleDismissOverlay}
                className="text-xs text-gray-500 hover:text-gray-300 font-mono uppercase tracking-widest underline"
              >
                Replay Level {completion.completedLevel}
              </button>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div className="w-full min-h-screen flex items-center justify-center bg-arcade-dark">
        <div className="text-neon-cyan font-heading animate-pulse text-2xl">INITIALIZING ENGINE...</div>
      </div>
    }>
      <PlayContent />
    </Suspense>
  );
}
