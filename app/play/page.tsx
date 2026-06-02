'use client';
 
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Zap, Cpu, Layers, Trophy, Lock, Gamepad2, Loader2, ArrowLeft, ChevronRight, Swords, Grid } from 'lucide-react';

import Link from 'next/link';
import { GAMES, GameConfig } from '@/lib/games';

 
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Zap,
  Cpu,
  Layers,
  Trophy,
  Swords,
  Grid
};
 
export default function GameHubPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const router = useRouter();
 
  const [progression, setProgression] = useState<Record<string, number>>({});
  const [isLoadingProg, setIsLoadingProg] = useState(true);

  // Fetch progression levels for all LIVE games dynamically
  useEffect(() => {
    async function fetchAllProgressions() {
      if (!ready) return;
      if (!authenticated) { setIsLoadingProg(false); return; }
 
      try {
        const token = await getAccessToken();
        const liveGames = GAMES.filter(g => g.status === 'LIVE');
        const results: Record<string, number> = {};
        
        await Promise.all(
          liveGames.map(async (game) => {
            try {
              const res = await fetch(`/api/session/progression?gameSlug=${game.routeSlug}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                const data = await res.json();
                results[game.routeSlug] = data.effectiveProgressionLevel ?? 0;
              }
            } catch (err) {
              console.error(`[GameHub] Failed to fetch progression for ${game.routeSlug}:`, err);
            }
          })
        );
        
        setProgression(results);
      } catch (err) {
        console.error('[GameHub] Failed to fetch progression preview:', err);
      } finally {
        setIsLoadingProg(false);
      }
    }
 
    fetchAllProgressions();
  }, [ready, authenticated]);

  // Route to the per-game dashboard page instead of directly to a level
  const handleCabinetClick = (game: GameConfig) => {
    if (!authenticated) { login(); return; }
    router.push(`/play/${game.routeSlug}`);
  };

  return (
    <div className="min-h-screen bg-bg-void pixel-grid crt-overlay py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
      
      <div className="max-w-7xl mx-auto relative z-10 animate-fade-in">
        
        {/* Navigation Breadcrumb */}
        <div className="mb-8 flex justify-between items-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-heading font-black tracking-widest text-text-secondary hover:text-white uppercase transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#a9ddd3]" />
            [ Return to Dashboard ]
          </Link>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest bg-zinc-950/80 px-3 py-1 border border-zinc-900 rounded">
            NETWORK STATUS: <span className="text-green-500 font-bold">ONLINE</span>
          </div>
        </div>
 
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 mb-4 bg-[#a9ddd3]/10 border border-[#a9ddd3]/20 px-4 py-1.5 rounded-full">
            <Gamepad2 className="w-4 h-4 text-[#a9ddd3] animate-pulse" />
            <span className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-[#a9ddd3]">
              RCADE MULTI-GAME MAINBOARD
            </span>
          </div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl md:text-6xl text-white uppercase tracking-tight text-arcade mb-4">
            CHOOSE YOUR CABINET
          </h1>
          <p className="max-w-2xl mx-auto text-sm text-text-secondary font-sans leading-relaxed">
            Select a retro game cabinet from the mainboard grid below. Authenticate with your secure Web3 wallet to load progression NFTs, compete on global leaderboards, and mint EIP-1155 game rewards.
          </p>
        </div>
 
        {/* Game Cabinets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {GAMES.map((game, index) => {
            const IconComponent = ICON_MAP[game.icon] || Gamepad2;
            const isLive = game.status === 'LIVE';
            const color = game.accentColor;
            
            // Progression states
            const currentProg = progression[game.routeSlug] ?? 0;
            const nextLevel = currentProg + 1;
 
            return (
              <div
                key={game.gameId}
                className="relative group border border-zinc-800 bg-[#070707] rounded-xl overflow-hidden transition-all duration-300 flex flex-col justify-between"
                style={{
                  boxShadow: isLive 
                    ? `0 4px 30px rgba(0,0,0,0.8), 0 0 0px ${color}1a` 
                    : 'none',
                }}
              >
                {/* Cabinet Glow Accent Line */}
                <div 
                  className="h-1.5 w-full transition-all duration-300 group-hover:opacity-100 opacity-60" 
                  style={{ background: `linear-gradient(90deg, ${color}, ${color}33)` }} 
                />
 
                {/* Cabinet Header */}
                <div className="p-6 sm:p-8 flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div 
                      className="w-14 h-14 rounded-lg flex items-center justify-center border transition-all duration-300"
                      style={{
                        borderColor: `${color}33`,
                        background: `${color}08`,
                        boxShadow: `inset 0 0 10px ${color}0d`
                      }}
                    >
                      <IconComponent 
                        className="w-7 h-7" 
                        style={{ 
                          color,
                          filter: `drop-shadow(0 0 6px ${color}aa)` 
                        }} 
                      />
                    </div>
 
                    {/* Status Badge */}
                    {isLive ? (
                      <span className="text-[9px] font-heading font-bold uppercase tracking-widest px-3 py-1 bg-green-500/10 border border-green-500/30 text-green-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                        LIVE TIER
                      </span>
                    ) : (
                      <span className="text-[9px] font-heading font-bold uppercase tracking-widest px-3 py-1 bg-zinc-900 border border-zinc-800 text-zinc-500 rounded-full flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-zinc-600" />
                        COMING SOON
                      </span>
                    )}
                  </div>
 
                  {/* Title & Desc */}
                  <h3 className="font-heading font-black text-2xl uppercase tracking-tight text-white mb-3">
                    {game.title}
                  </h3>
                  <p className="text-xs text-text-secondary font-sans leading-relaxed mb-6 h-12 overflow-hidden">
                    {game.description}
                  </p>
 
                  {/* Level Details Panel for Live Games */}
                  {isLive && (
                    <div 
                      className="p-4 border rounded bg-zinc-950/60 font-mono text-xs flex justify-between items-center mb-6"
                      style={{ borderColor: `${color}1a` }}
                    >
                      <div className="space-y-1">
                        <div className="text-zinc-500 text-[9px] uppercase tracking-wider">ON-CHAIN PROGRESSION</div>
                        {ready && authenticated ? (
                          isLoadingProg ? (
                            <div className="flex items-center gap-1.5 text-zinc-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Resolving inventory...</span>
                            </div>
                          ) : (
                            <div className="text-white">
                              Active Contiguous Level: <strong className="font-bold" style={{ color }}>{currentProg}</strong>
                            </div>
                          )
                        ) : (
                          <div className="text-zinc-400">[ WALLET OFFLINE ]</div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-heading font-bold text-white px-2 py-0.5 border border-zinc-800 bg-zinc-900 rounded">
                          {game.availableLevels} LEVELS
                        </span>
                      </div>
                    </div>
                  )}
 
                  {/* Lock Screen for Coming Soon Games */}
                  {!isLive && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <Lock className="w-8 h-8 text-zinc-500 mb-2 animate-bounce" />
                      <div className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white">
                        CABINET LOCKED
                      </div>
                      <p className="text-[10px] text-zinc-400 max-w-xs mt-1">
                        This arcade system is currently being compiled. Stay tuned for decentralized alpha deployment.
                      </p>
                    </div>
                  )}
                </div>
 
                {/* Cabinet CTA Footer */}
                {isLive ? (
                  <div className="p-6 sm:p-8 bg-zinc-950/80 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-left w-full sm:w-auto">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">CURRENT PROGRESS</span>
                      <span className="font-heading text-xs font-bold uppercase text-white">
                        {ready && authenticated
                          ? isLoadingProg ? 'Resolving...' : `Level ${currentProg} Active`
                          : 'Insert Coin to Load'
                        }
                      </span>
                    </div>
 
                    <button
                      onClick={() => handleCabinetClick(game)}
                      className="w-full sm:w-auto px-6 py-3 font-heading font-black text-[10px] tracking-[0.2em] uppercase rounded transition-all cursor-pointer flex items-center justify-center gap-2 text-black"
                      style={{
                        backgroundColor: color,
                        boxShadow: `0 0 20px ${color}4d`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 35px ${color}80`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 20px ${color}4d`;
                      }}
                    >
                      {(!ready || !authenticated) ? (
                        <>INSERT COIN</>
                      ) : (
                        <>
                          <ChevronRight className="w-3.5 h-3.5" />
                          OPEN CABINET
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="p-6 sm:p-8 bg-zinc-950/40 border-t border-zinc-900/60 flex justify-between items-center text-zinc-600">
                    <span className="text-[10px] font-mono uppercase tracking-widest">SYSTEM: COMPILING</span>
                    <span className="text-xs font-heading font-bold uppercase">LOCKED</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
 
        {/* Arcade Cabinet Base Aesthetics Banner */}
        <div className="mt-16 text-center border-t border-zinc-900 pt-8 max-w-lg mx-auto">
          <div className="font-heading text-[8px] font-bold uppercase tracking-[0.3em] text-zinc-600 mb-2">
            SECURE DECENTRALIZED HYPERGRID
          </div>
          <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest leading-relaxed">
            Select a cabinet to view full game stats, on-chain progression, and season details before entering play.
          </div>
        </div>

      </div>
    </div>
  );
}
