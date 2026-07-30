'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft, Play, Lock, Zap, Cpu, Layers, Trophy,
  Loader2, AlertTriangle, Star, Package, TrendingUp,
  Shield, ChevronRight, ExternalLink, Gamepad2
} from 'lucide-react';
import Link from 'next/link';
import { getGameBySlug } from '@/lib/games';
import { ApiService } from '@/services/api';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Zap, Cpu, Layers, Trophy
};

const RARITY_COLOR: Record<string, string> = {
  Legendary: '#f59e0b',
  Epic: '#a9ddd3',
  Rare: '#fb923c',
  Common: '#6b6b6b',
};

const RARITY_GLOW: Record<string, string> = {
  Legendary: 'rgba(245,158,11,0.35)',
  Epic: 'rgba(169,221,211,0.35)',
  Rare: 'rgba(251,146,60,0.3)',
  Common: 'rgba(107,107,107,0.15)',
};

const CURRENT_SEASON = {
  name: 'Alpha Season 1',
  status: 'ACTIVE',
  description: 'Closed alpha testing season. Earn NFT progression tokens by completing levels.',
  startDate: 'May 2026',
  endDate: 'TBD',
  rewards: ['Progression NFTs', 'Leaderboard XP', 'Alpha Tester Badge'],
};

export default function GameDashboardPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const params = useParams();
  const router = useRouter();

  const gameSlug = params?.gameSlug as string;
  const game = getGameBySlug(gameSlug);

  const [progression, setProgression] = useState(0);
  const [inventory, setInventory] = useState<any[]>([]);
  const [dbUser, setDbUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMapLevel, setSelectedMapLevel] = useState<number | null>(null);

  const gameInventory = inventory.filter(item => item.gameSlug === gameSlug);
  const ownedLevels = new Set(gameInventory.map((item: any) => item.level));

  useEffect(() => {
    async function load() {
      if (!ready) return;
      if (!authenticated) { setIsLoading(false); return; }
      try {
        const tokenPromise = getAccessToken().catch(() => null);
        const [token] = await Promise.all([tokenPromise]);

        const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        await Promise.all([
          fetch(`/api/session/progression?gameSlug=${gameSlug}`, { headers: authHeaders })
            .then(res => res.ok ? res.json() : null)
            .then(d => { if (d) setProgression(d.effectiveProgressionLevel ?? 0); }),
          fetch('/api/auth/sync', { method: 'POST', headers: authHeaders })
            .then(res => res.ok ? res.json() : null)
            .then(d => { if (d?.user) setDbUser(d.user); }),
          fetch('/api/rewards/history', { headers: authHeaders })
            .then(res => res.ok ? res.json() : null)
            .then(d => { if (d?.rewards) setInventory(d.rewards); })
        ]);
      } catch (err) {
        console.error('[GameDashboard] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [ready, authenticated, gameSlug]);

  if (!game) {
    return (
      <div className="min-h-screen bg-[#010101] flex flex-col items-center justify-center text-center px-4">
        <h1 className="font-heading font-black text-5xl text-white uppercase mb-4">Cabinet Not Found</h1>
        <p className="text-zinc-400 text-lg mb-8">This game cabinet does not exist in the mainboard registry.</p>
        <Link href="/play" className="px-8 py-4 bg-[#a9ddd3] text-black font-heading font-black text-base uppercase tracking-widest">
          ← Return to Hub
        </Link>
      </div>
    );
  }

  if (game.status === 'COMING_SOON') {
    return (
      <div className="min-h-screen bg-[#010101] pixel-grid crt-overlay flex flex-col items-center justify-center text-center px-4">
        <Lock className="w-16 h-16 text-zinc-600 mb-6 animate-bounce" />
        <h1 className="font-heading font-black text-5xl text-white uppercase mb-4">{game.title}</h1>
        <p className="text-zinc-400 text-lg mb-3">This cabinet is currently being compiled.</p>
        <p className="text-zinc-500 text-base font-mono mb-10 uppercase tracking-widest">SYSTEM: COMPILING — STAND BY</p>
        <Link href="/play" className="px-8 py-4 bg-[#a9ddd3] text-black font-heading font-black text-base uppercase tracking-widest">
          ← Return to Hub
        </Link>
      </div>
    );
  }

  const color = game.accentColor;
  const IconComponent = ICON_MAP[game.icon] || Gamepad2;
  const nextLevel = progression + 1;
  const xpPercent = Math.min(100, (progression / 10) * 100);

  return (
    <div
      className="min-h-screen bg-[#010101] pixel-grid crt-overlay py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden"
      style={{ fontFamily: 'inherit' }}
    >
      {/* CRT scanlines */}
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
      <div
        className="absolute top-0 left-0 right-0 h-[1px] opacity-30"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      <div className="max-w-6xl mx-auto relative z-10">

        {/* ── Breadcrumb nav ─────────────────────────────── */}
        <div className="mb-10 flex justify-between items-center">
          <Link
            href="/play"
            className="inline-flex items-center gap-2 text-base font-heading font-black tracking-widest text-zinc-400 hover:text-white uppercase transition-colors"
          >
            <ArrowLeft className="w-5 h-5" style={{ color }} />
            [ Game Hub ]
          </Link>
          <div
            className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest px-4 py-2 border rounded"
            style={{ borderColor: `${color}33`, color: 'rgba(169,221,211,0.6)', background: `${color}08` }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: '#22c55e' }} />
            LIVE — {game.title.toUpperCase()}
          </div>
        </div>

        {/* ── Hero Header ────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-8 mb-12">
          <div className="flex-1">
            <div className="flex items-center gap-5 mb-5">
              <div
                className="w-20 h-20 rounded-xl flex items-center justify-center border flex-shrink-0"
                style={{ background: `${color}10`, borderColor: `${color}22` }}
              >
                <IconComponent className="w-10 h-10" style={{ color }} />
              </div>
              <div>
                <p className="text-sm font-heading uppercase tracking-[0.3em] mb-1" style={{ color }}>
                  Game Cabinet
                </p>
                <h1 className="font-heading font-black text-5xl sm:text-6xl text-white uppercase tracking-tight">
                  {game.title}
                </h1>
              </div>
            </div>
            <p className="text-lg text-zinc-400 font-sans leading-relaxed max-w-xl mb-6">
              {game.description}
            </p>

            {!authenticated ? (
              <button
                onClick={login}
                className="flex items-center gap-3 px-8 py-4 font-heading font-black text-base uppercase tracking-[0.2em] text-black transition-all cursor-pointer rounded"
                style={{ background: color, boxShadow: `0 0 30px ${color}4d` }}
              >
                <Zap className="w-5 h-5 fill-black" />
                INSERT COIN — CONNECT WALLET
              </button>
            ) : isLoading ? (
              <div className="flex items-center gap-3 text-zinc-400 font-mono text-base">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color }} />
                Resolving on-chain progression...
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href={`/play/${gameSlug}/level/${nextLevel}`}
                  className="flex items-center justify-center gap-3 px-6 py-4 font-heading font-black text-base uppercase tracking-[0.2em] text-black transition-all rounded"
                  style={{ background: color }}
                >
                  <Play className="w-5 h-5 fill-black" />
                  {progression === 0 ? 'START — LEVEL 1' : `CONTINUE — LEVEL ${nextLevel}`}
                </Link>
                {game.capabilities.ranked && (
                  <Link
                    href={`/arena?gameId=${game.gameId}`}
                    className="flex items-center justify-center gap-2 px-6 py-4 font-heading font-black text-base uppercase tracking-widest text-white border-2 border-neon-magenta hover:bg-neon-magenta/20 transition-all rounded shadow-[0_0_15px_rgba(255,0,133,0.3)]"
                  >
                    <Trophy className="w-5 h-5 text-neon-magenta fill-neon-magenta" />
                    Ranked Arena
                  </Link>
                )}
                <Link
                  href="/marketplace"
                  className="flex items-center justify-center gap-2 px-6 py-4 font-heading font-black text-base uppercase tracking-widest text-zinc-300 border border-zinc-700 hover:border-[#a9ddd3] hover:text-[#a9ddd3] transition-all rounded"
                >
                  <ExternalLink className="w-5 h-5" />
                  NFT Marketplace
                </Link>
              </div>
            )}
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4 lg:w-[340px]">
            {[
              { icon: TrendingUp, label: 'Progression Level', value: progression, suffix: `/ ${game.availableLevels}` },
              { icon: Star,        label: 'High Score',        value: (dbUser?.highestScore ?? 0).toLocaleString(), suffix: 'pts' },
              { icon: Package,    label: 'NFTs Owned',        value: gameInventory.length, suffix: '' },
              { icon: Shield,     label: 'Season',            value: 'Alpha 1', suffix: '' },
            ].map(({ icon: Icon, label, value, suffix }) => (
              <div
                key={label}
                className="p-5 border rounded-lg flex flex-col gap-1"
                style={{ background: '#0a0a0a', borderColor: `${color}1a` }}
              >
                <Icon className="w-5 h-5 mb-1" style={{ color }} />
                <p className="text-sm font-heading uppercase tracking-widest text-zinc-500">{label}</p>
                <p className="font-heading font-black text-3xl text-white leading-tight">
                  {value} <span className="text-base text-zinc-500 font-normal">{suffix}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── XP Progress Bar ─────────────────────────────── */}
        <div
          className="mb-8 p-6 border rounded-lg relative overflow-hidden"
          style={{ background: '#050505', borderColor: `${color}1a` }}
        >
          <div className="absolute top-0 left-0 w-4 h-[1px]" style={{ background: color }} />
          <div className="absolute top-0 left-0 w-[1px] h-4" style={{ background: color }} />
          <div className="absolute bottom-0 right-0 w-4 h-[1px]" style={{ background: color }} />
          <div className="absolute bottom-0 right-0 w-[1px] h-4" style={{ background: color }} />

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5" style={{ color }} />
              <span className="font-heading text-base font-bold uppercase tracking-[0.2em]" style={{ color }}>
                ON-CHAIN XP PROGRESS
              </span>
            </div>
            <span className="font-mono text-xl text-white font-bold">
              {progression * 100} <span className="text-zinc-500 font-normal text-base">/ 1,000 XP</span>
            </span>
          </div>

          <div className="relative h-5 bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden">
            <div
              className="h-full transition-all duration-1000 ease-out relative"
              style={{
                width: `${Math.max(progression > 0 ? 2 : 0, xpPercent)}%`,
                background: `linear-gradient(90deg, ${color} 0%, ${color}88 100%)`,
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_100%)]" />
            </div>
            <div className="absolute inset-0 flex pointer-events-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-zinc-900/60 last:border-r-0" />
              ))}
            </div>
          </div>

          <div className="flex justify-between mt-3 font-mono text-sm text-zinc-500">
            <span>LVL 0</span>
            <span>LVL 5 (ELITE)</span>
            <span>LVL 10 (GRANDMASTER)</span>
          </div>
        </div>

        {/* ── Two-column: Map + Season/Actions ───────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">

          {/* ── ON-CHAIN PROGRESSION MAP (2/3 width) ──────── */}
          <div
            className="xl:col-span-2 p-6 border rounded-lg relative"
            style={{ background: '#050505', borderColor: `${color}1a` }}
          >
            <div className="absolute top-0 left-0 w-4 h-[1px]" style={{ background: color }} />
            <div className="absolute top-0 left-0 w-[1px] h-4" style={{ background: color }} />

            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
              <h2 className="font-heading text-base font-bold uppercase tracking-[0.15em] text-white flex items-center gap-2">
                <Layers className="w-5 h-5 flex-shrink-0" style={{ color }} />
                ON-CHAIN PROGRESSION MAP (LEVELS 1–10)
              </h2>
              {authenticated && !isLoading && (
                <div className="text-sm font-mono text-zinc-500 uppercase tracking-widest">
                  Active Chain: <strong style={{ color }}>LVL {progression}</strong>
                </div>
              )}
            </div>

            {!authenticated ? (
              <div className="text-center py-10">
                <p className="text-zinc-400 text-base font-mono mb-5">Connect wallet to reveal your progression chain.</p>
                <button
                  onClick={login}
                  className="px-8 py-3 font-heading font-black text-base uppercase tracking-widest text-black rounded transition-all cursor-pointer"
                  style={{ background: color, boxShadow: `0 0 20px ${color}4d` }}
                >
                  Connect Wallet
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-3 py-10 text-zinc-400 font-mono text-base">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color }} />
                Resolving EIP-1155 inventory...
              </div>
            ) : (
              <>
                {/* Node row */}
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-2 py-4 overflow-x-auto scrollbar-none">
                  <div className="hidden md:block absolute top-[46px] left-8 right-8 h-px bg-zinc-800 z-0" />

                  {Array.from({ length: 10 }).map((_, idx) => {
                    const level = idx + 1;
                    const isContiguous = level <= progression;
                    const isTarget = level === progression + 1;
                    const isHeld = !isContiguous && !isTarget && ownedLevels.has(level);
                    const isSelected = selectedMapLevel === level;

                    let nodeBg = '#000';
                    let nodeBorder = '1px solid #27272a';
                    let nodeColor = '#52525b';
                    let shadow = 'none';

                    if (isContiguous) {
                      nodeBg = `${color}18`;
                      nodeBorder = `2px solid ${color}99`;
                      nodeColor = color;
                      shadow = 'none';
                    } else if (isTarget) {
                      nodeBg = 'rgba(34,197,94,0.06)';
                      nodeBorder = '2px dashed rgba(34,197,94,0.7)';
                      nodeColor = '#22c55e';
                      shadow = 'none';
                    } else if (isHeld) {
                      nodeBg = 'rgba(245,158,11,0.05)';
                      nodeBorder = '1px solid rgba(245,158,11,0.5)';
                      nodeColor = '#f59e0b';
                    }

                    if (isSelected) nodeBorder = '2px solid #ffffff';

                    return (
                      <button
                        key={level}
                        onClick={() => setSelectedMapLevel(selectedMapLevel === level ? null : level)}
                        className="relative z-10 flex md:flex-col items-center gap-4 md:gap-2 flex-1 min-w-[72px] transition-all hover:scale-105 focus:outline-none cursor-pointer"
                      >
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center font-heading font-black text-base transition-all duration-300 relative flex-shrink-0"
                          style={{ background: nodeBg, border: nodeBorder, color: nodeColor, boxShadow: shadow }}
                        >
                          {isTarget && <div className="absolute inset-0 rounded-full border border-green-500/30 animate-pulse" />}
                          {isContiguous && <div className="absolute inset-1 rounded-full border animate-ping" style={{ borderColor: `${color}33`, animationDuration: '3s' }} />}
                          {level}
                        </div>
                        <div className="flex flex-col md:items-center text-left md:text-center gap-0.5">
                          <span className="text-sm font-heading font-black uppercase tracking-wider text-white">LVL {level}</span>
                          <span className="text-xs font-mono uppercase tracking-widest font-bold" style={{ color: nodeColor }}>
                            {isContiguous ? 'ACTIVE' : isTarget ? 'TARGET' : isHeld ? 'HELD' : 'LOCKED'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Diagnostic panel */}
                {selectedMapLevel !== null && (() => {
                  const level = selectedMapLevel;
                  const isContiguous = level <= progression;
                  const isTarget = level === progression + 1;
                  const isHeld = !isContiguous && !isTarget && ownedLevels.has(level);
                  const matchingNft = gameInventory.find((item: any) => item.level === level);
                  const heldAmount = matchingNft?.amount || 0;

                  return (
                    <div
                      className="mt-5 p-5 border rounded animate-fadeIn"
                      style={{ background: '#030303', borderColor: '#1f1f1f' }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-base font-heading font-bold uppercase text-white">
                              LEVEL {level} — DIAGNOSTIC STATUS
                            </span>
                            <span
                              className="text-sm font-heading px-2.5 py-1 border font-bold uppercase tracking-wider rounded"
                              style={{
                                borderColor: isContiguous ? color : isTarget ? '#22c55e' : isHeld ? '#f59e0b' : '#3f3f46',
                                color: isContiguous ? color : isTarget ? '#22c55e' : isHeld ? '#f59e0b' : '#3f3f46',
                              }}
                            >
                              {isContiguous ? 'ACTIVE CONTIGUOUS' : isTarget ? 'UNLOCK TARGET' : isHeld ? 'BROKEN LINK' : 'LOCKED'}
                            </span>
                          </div>
                          <p className="text-base font-mono text-zinc-400 max-w-md leading-relaxed">
                            {isContiguous && `Level ${level} NFT is active in your contiguous chain. This node contributes to your on-chain rank.`}
                            {isTarget && `Beat ${game.title} Level ${level} to earn a claimable reward, or purchase a Level ${level} NFT from the marketplace.`}
                            {isHeld && `You own a Level ${level} token (×${heldAmount}) but a lower-level NFT is missing. Your chain is broken — progression is gated.`}
                            {!isContiguous && !isTarget && !isHeld && `Acquire a Level ${level} NFT to activate this progression node.`}
                          </p>
                          {isHeld && (
                            <div className="flex items-center gap-2 text-base font-mono text-red-400">
                              <AlertTriangle className="w-4 h-4" />
                              <span>Chain broken. Fill the gap to restore progression.</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0 flex-wrap">
                          {(isTarget || isContiguous) && (
                            <Link
                              href={`/play/${gameSlug}/level/${level}`}
                              className="px-5 py-2.5 border text-sm font-heading font-bold uppercase tracking-widest transition-all rounded"
                              style={{ borderColor: `${color}66`, color, background: `${color}0d` }}
                            >
                              Play Level {level}
                            </Link>
                          )}
                          {(!isContiguous && !isHeld) && (
                            <Link
                              href="/marketplace"
                              className="px-5 py-2.5 text-black text-sm font-heading font-bold uppercase tracking-widest transition-all rounded"
                              style={{ background: color }}
                            >
                              Find in Market
                            </Link>
                          )}
                          {(isHeld || isContiguous) && (
                            <Link
                              href="/dashboard"
                              className="px-5 py-2.5 border border-zinc-700 hover:border-zinc-400 text-zinc-400 hover:text-white text-sm font-heading font-bold uppercase tracking-widest transition-all rounded"
                            >
                              Manage in Vault
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* ── Season + Quick Actions (1/3 width) ────────── */}
          <div className="flex flex-col gap-4">

            {/* Season Card */}
            <div
              className="p-6 border rounded-lg relative overflow-hidden flex-1"
              style={{ background: '#050505', borderColor: `${color}1a` }}
            >
              <div className="absolute top-0 left-0 w-4 h-[1px]" style={{ background: color }} />
              <div className="absolute top-0 left-0 w-[1px] h-4" style={{ background: color }} />

              <div className="flex items-center gap-2 mb-5 flex-wrap">
                <Shield className="w-5 h-5" style={{ color }} />
                <h3 className="font-heading text-base font-bold uppercase tracking-[0.15em]" style={{ color }}>
                  Current Season
                </h3>
                <span
                  className="text-sm font-heading font-bold uppercase px-2 py-0.5 rounded"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
                >
                  {CURRENT_SEASON.status}
                </span>
              </div>

              <p className="font-heading font-black text-xl text-white uppercase mb-2">{CURRENT_SEASON.name}</p>
              <p className="text-base font-mono text-zinc-400 mb-5 leading-relaxed">{CURRENT_SEASON.description}</p>

              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-base font-mono">
                  <span className="text-zinc-500 uppercase tracking-wider">Start</span>
                  <span className="text-white">{CURRENT_SEASON.startDate}</span>
                </div>
                <div className="flex justify-between text-base font-mono">
                  <span className="text-zinc-500 uppercase tracking-wider">End</span>
                  <span className="text-zinc-400">{CURRENT_SEASON.endDate}</span>
                </div>
              </div>

              <div className="border-t border-zinc-900 pt-4">
                <p className="text-sm font-heading uppercase tracking-widest text-zinc-500 mb-3">Season Rewards</p>
                {CURRENT_SEASON.rewards.map(r => (
                  <div key={r} className="flex items-center gap-2 py-1.5">
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color }} />
                    <span className="text-base font-mono text-zinc-300">{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions Card */}
            <div
              className="p-6 border rounded-lg"
              style={{ background: '#050505', borderColor: `${color}1a` }}
            >
              <h3 className="font-heading text-base font-bold uppercase tracking-[0.15em] mb-5" style={{ color }}>
                Quick Actions
              </h3>
              <div className="space-y-3">
                {authenticated && !isLoading && (
                  <Link
                    href={`/play/${gameSlug}/level/${nextLevel}`}
                    className="flex items-center justify-between w-full px-4 py-3.5 rounded text-left transition-all group"
                    style={{ background: `${color}10`, border: `1px solid ${color}33` }}
                  >
                    <span className="font-heading text-base font-bold uppercase text-white">
                      {progression === 0 ? 'Start Level 1' : `Continue Level ${nextLevel}`}
                    </span>
                    <Play className="w-5 h-5 flex-shrink-0" style={{ color }} />
                  </Link>
                )}
                <Link
                  href="/marketplace"
                  className="flex items-center justify-between w-full px-4 py-3.5 border border-zinc-800 hover:border-zinc-600 rounded text-left transition-all"
                >
                  <span className="font-heading text-base font-bold uppercase text-zinc-400 hover:text-white">
                    Browse NFT Marketplace
                  </span>
                  <ExternalLink className="w-5 h-5 text-zinc-600" />
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between w-full px-4 py-3.5 border border-zinc-800 hover:border-zinc-600 rounded text-left transition-all"
                >
                  <span className="font-heading text-base font-bold uppercase text-zinc-400 hover:text-white">
                    Manage Vault
                  </span>
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── NFT Collection Vault ──────────────────────── */}
        <div
          className="mb-12 p-6 border rounded-lg relative"
          style={{ background: '#050505', borderColor: `${color}1a` }}
        >
          <div className="absolute top-0 left-0 w-4 h-[1px]" style={{ background: color }} />
          <div className="absolute top-0 left-0 w-[1px] h-4" style={{ background: color }} />

          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <Package className="w-5 h-5" style={{ color }} />
            <h2 className="font-heading text-base font-bold uppercase tracking-[0.15em]" style={{ color }}>
              {game.title} NFT Collection
            </h2>
            <div className="h-px flex-1 bg-zinc-900 min-w-[20px]" />
            <span className="text-sm font-heading text-zinc-500 uppercase tracking-widest">
              {gameInventory.length} {gameInventory.length === 1 ? 'token' : 'tokens'} owned
            </span>
          </div>

          {!authenticated ? (
            <div className="text-center py-12">
              <p className="text-zinc-400 font-mono text-base mb-5">Connect wallet to view your NFT collection for this game.</p>
              <button
                onClick={login}
                className="px-8 py-3 font-heading font-black text-base uppercase tracking-widest text-black rounded cursor-pointer"
                style={{ background: color }}
              >
                Connect Wallet
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-zinc-400 font-mono text-base">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color }} />
              Loading collection...
            </div>
          ) : gameInventory.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
              <Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 font-mono text-base mb-2">No {game.title} NFTs in your vault yet.</p>
              <p className="text-zinc-500 text-base font-mono mb-6">
                Beat levels to earn rewards, or buy from the marketplace.
              </p>
              <div className="flex justify-center gap-3">
                {authenticated && (
                  <Link
                    href={`/play/${gameSlug}/level/1`}
                    className="px-6 py-3 font-heading font-black text-sm uppercase tracking-widest text-black rounded"
                    style={{ background: color }}
                  >
                    Play Level 1
                  </Link>
                )}
                <Link
                  href="/marketplace"
                  className="px-6 py-3 font-heading font-bold text-sm uppercase tracking-widest text-zinc-300 border border-zinc-700 rounded hover:border-zinc-400 transition-all"
                >
                  Marketplace
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {gameInventory.map((nft: any) => {
                const isChainActive = nft.level <= progression;
                return (
                  <div
                    key={nft.id}
                    className="group relative p-5 flex flex-col items-center text-center rounded-lg border transition-all duration-300"
                    style={{
                      background: '#0a0a0a',
                      borderColor: isChainActive ? `${color}33` : 'rgba(107,107,107,0.15)',
                    }}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg"
                      style={{ background: RARITY_COLOR[nft.rarity] }}
                    />
                    <div
                      className="w-14 h-14 rounded-lg flex items-center justify-center mb-3 mt-1 relative"
                      style={{
                        background: `${RARITY_COLOR[nft.rarity]}14`,
                        border: `1px solid ${RARITY_GLOW[nft.rarity]}`,
                      }}
                    >
                      <span
                        className="font-heading font-black text-2xl"
                        style={{ color: RARITY_COLOR[nft.rarity] }}
                      >
                        {nft.rarity.charAt(0)}
                      </span>
                      {isChainActive && (
                        <div
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: color }}
                        >
                          <span className="text-[10px] text-black font-black">✓</span>
                        </div>
                      )}
                    </div>

                    <div className="font-heading font-black text-lg text-white">LVL {nft.level}</div>
                    <div className="text-sm font-heading uppercase tracking-widest mb-1" style={{ color: RARITY_COLOR[nft.rarity] }}>
                      {nft.rarity}
                    </div>
                    <div className="text-sm font-mono text-zinc-500">×{nft.amount}</div>

                    <div
                      className="mt-2 text-xs font-heading font-bold uppercase tracking-widest px-2.5 py-1 rounded"
                      style={{
                        background: isChainActive ? `${color}14` : 'rgba(63,63,70,0.3)',
                        color: isChainActive ? color : '#52525b',
                      }}
                    >
                      {isChainActive ? 'ACTIVE' : 'GATED'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer bar ────────────────────────────────── */}
        <div className="border-t border-zinc-900 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="font-heading text-sm font-bold uppercase tracking-[0.2em] text-zinc-600">
            {game.title.toUpperCase()} — EIP-1155 SEQUENTIAL PROGRESSION
          </div>
          <div className="text-sm font-mono text-zinc-600 uppercase tracking-widest text-center sm:text-right max-w-sm">
            All levels are gated by on-chain token ownership. Progression recalculates in real-time.
          </div>
        </div>

      </div>
    </div>
  );
}
