import Link from 'next/link';
import { Gamepad2, Trophy, Zap, ChevronRight, Star, TrendingUp, Shield, Users, Coins } from 'lucide-react';

const FEATURES = [
  { icon: Gamepad2, label: 'Play-to-Earn',     body: 'Skill-based arcade games with on-chain rewards for every session.' },
  { icon: Shield,   label: 'True Ownership',   body: 'ERC-1155 assets on Base L2. Your NFTs, your wallet, no custodians.' },
  { icon: TrendingUp,label: 'Live Marketplace', body: 'EIP-712 signed listings. Off-chain speed, on-chain settlement.' },
  { icon: Trophy,   label: 'Leaderboards',     body: 'Global weekly rankings. Top players earn CADE airdrops and rare drops.' },
];

const STATS = [
  { label: 'Active Players',    value: '24K+' },
  { label: 'NFTs Minted',       value: '182K+' },
  { label: 'CADE Distributed',  value: '4.8M+' },
  { label: 'Games Played',      value: '1.2M+' },
];

export default function Home() {
  return (
    <div className="flex flex-col w-full">

      {/* ═══════════════════════════════════════════════════
          HERO — minimal one-liner + single CTA
      ═══════════════════════════════════════════════════ */}
      <section className="relative w-full min-h-[92vh] flex flex-col justify-center pixel-grid crt-overlay overflow-hidden">
        {/* Corner decoration lines */}
        <div className="absolute top-8 left-8 w-16 h-16 border-t-2 border-l-2 pointer-events-none" style={{ borderColor: '#a9ddd3', opacity: 0.5 }} />
        <div className="absolute top-8 right-8 w-16 h-16 border-t-2 border-r-2 pointer-events-none" style={{ borderColor: '#a9ddd3', opacity: 0.5 }} />
        <div className="absolute bottom-8 left-8 w-16 h-16 border-b-2 border-l-2 pointer-events-none" style={{ borderColor: '#a9ddd3', opacity: 0.5 }} />
        <div className="absolute bottom-8 right-8 w-16 h-16 border-b-2 border-r-2 pointer-events-none" style={{ borderColor: '#a9ddd3', opacity: 0.5 }} />

        {/* Centered content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full text-center">

          {/* Pre-title */}
          <div className="animate-fade-up mb-8">
            <span className="stat-chip">
              <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse" style={{ boxShadow: '0 0 6px rgba(169,221,211,0.9)' }} />
              Web3 Arcade — Base Sepolia
            </span>
          </div>

          {/* Main headline */}
          <div className="animate-fade-up delay-100 mb-4">
            <h1
              className="font-heading font-black leading-none tracking-tight"
              style={{ fontSize: 'clamp(3rem, 10vw, 7.5rem)' }}
            >
              <span className="text-white">INSERT</span>
              <br />
              <span style={{
                color: '#a9ddd3',
                textShadow: '0 0 30px rgba(169,221,211,0.8), 0 0 60px rgba(169,221,211,0.4)',
              }}>
                COIN
              </span>
            </h1>
          </div>

          {/* Sub-line */}
          <p className="animate-fade-up delay-200 text-text-secondary text-base md:text-lg tracking-wider mb-12 font-heading uppercase max-w-md mx-auto">
            Play. Earn. Own. — The on-chain arcade is live.
          </p>

          {/* CTA */}
          <div className="animate-fade-up delay-300 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/play" className="btn-primary text-sm px-10 py-4">
              <Zap className="w-4 h-4" fill="black" /> Start Playing
            </Link>
            <Link href="/marketplace" className="btn-secondary text-sm px-10 py-4">
              Browse Market <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Live stats row */}
          <div className="animate-fade-up delay-400 flex flex-wrap justify-center gap-x-10 gap-y-4 mt-20">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <div className="font-heading font-black text-2xl text-white" style={{ textShadow: '0 0 20px rgba(169,221,211,0.4)' }}>{s.value}</div>
                <div className="text-[10px] font-heading tracking-[0.15em] text-text-muted uppercase mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-fade-in delay-500">
          <div className="w-px h-12 bg-gradient-to-b from-orange to-transparent" />
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════════════════════════════════════════════════
          FEATURES — 4 column grid
      ═══════════════════════════════════════════════════ */}
      <section className="w-full py-12 md:py-24 pixel-grid crt-overlay overflow-hidden">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16">
            <p className="text-[10px] font-heading tracking-[0.25em] text-orange uppercase mb-3">Platform</p>
            <h2 className="font-heading text-2xl md:text-3xl font-semibold text-white">
              Why RCADE?
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="bg-bg-void p-8 group hover:bg-bg-card transition-colors duration-200">
                  <div
                    className="w-10 h-10 flex items-center justify-center mb-6 transition-all duration-200 group-hover:shadow-[0_0_15px_rgba(169,221,211,0.5)]"
                    style={{ background: '#a9ddd3' }}
                  >
                    <Icon className="w-5 h-5 text-black" />
                  </div>
                  <h3 className="font-heading font-bold text-sm text-white tracking-wider mb-3 uppercase">{f.label}</h3>
                  <p className="text-base leading-relaxed text-slate-300 max-w-prose">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════════════════════════════════════════════════
          GAME SHOWCASE
      ═══════════════════════════════════════════════════ */}
      <section className="w-full py-12 md:py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-6 md:gap-8 items-center">

            {/* Left — game terminal */}
            <div className="relative animate-float">
              {/* CRT screen frame */}
              <div className="relative" style={{ border: '2px solid #1f1f1f', borderRadius: '4px', background: '#010101' }}>
                {/* Top bar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  <div className="w-2 h-2 rounded-full bg-orange-hot" />
                  <div className="w-2 h-2 rounded-full bg-amber" />
                  <div className="w-2 h-2 rounded-full bg-border" />
                  <span className="ml-2 text-[10px] font-heading tracking-widest text-text-muted uppercase">neon-snake.exe</span>
                </div>
                {/* Screen content */}
                <div className="relative h-72 flex items-center justify-center overflow-hidden crt-overlay">
                  <div className="text-center">
                    <Gamepad2 className="w-16 h-16 mx-auto mb-4" style={{ color: '#a9ddd3', filter: 'drop-shadow(0 0 12px rgba(169,221,211,0.8))' }} />
                    <p className="font-heading text-[10px] tracking-[0.3em] text-orange uppercase">Press Start</p>
                    <p className="font-heading text-[10px] tracking-[0.3em] text-text-muted uppercase mt-1 cursor-blink">_</p>
                  </div>
                  {/* Corner brackets */}
                  <div className="absolute top-3 left-3 w-8 h-8 border-t border-l border-orange" style={{ opacity: 0.3 }} />
                  <div className="absolute top-3 right-3 w-8 h-8 border-t border-r border-orange" style={{ opacity: 0.3 }} />
                  <div className="absolute bottom-3 left-3 w-8 h-8 border-b border-l border-orange" style={{ opacity: 0.3 }} />
                  <div className="absolute bottom-3 right-3 w-8 h-8 border-b border-r border-orange" style={{ opacity: 0.3 }} />
                </div>
              </div>
            </div>

            {/* Right — info */}
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[10px] font-heading tracking-[0.25em] text-orange uppercase mb-3">Featured Game</p>
                <h2 className="font-heading text-2xl md:text-3xl font-semibold text-white mb-5 uppercase tracking-tight">
                  Neon Snake
                </h2>
                <p className="text-base md:text-lg leading-relaxed text-slate-300 max-w-2xl">
                  Classic mechanics. Completely reimagined. 60 FPS in-browser, zero downloads. Beat levels to mint on-chain NFT rewards on Base L2.
                </p>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-2 gap-px bg-border">
                {[
                  { label: 'Frame Rate', value: '60 FPS'    },
                  { label: 'Engine',     value: 'Phaser.js'  },
                  { label: 'Chain',      value: 'Base L2'    },
                  { label: 'Rewards',    value: 'ERC-1155'   },
                ].map(s => (
                  <div key={s.label} className="bg-bg-card px-5 py-4">
                    <div className="font-heading font-bold text-base text-white" style={{ color: '#a9ddd3' }}>{s.value}</div>
                    <div className="text-[10px] font-heading tracking-widest text-text-muted uppercase mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 flex-wrap">
                <Link href="/play"        className="btn-primary  text-xs px-7 py-3.5">Play Now</Link>
                <Link href="/dashboard"   className="btn-secondary text-xs px-7 py-3.5">My Stats</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════════════════════════════════════════════════
          MARKETPLACE CTA
      ═══════════════════════════════════════════════════ */}
      <section className="w-full py-12 md:py-24 pixel-grid crt-overlay overflow-hidden">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 md:gap-8">
            <div className="max-w-xl">
              <p className="text-[10px] font-heading tracking-[0.25em] text-orange uppercase mb-3">NFT Marketplace</p>
              <h2 className="font-heading text-2xl md:text-3xl font-semibold text-white uppercase mb-5 leading-tight">
                Your Skills.<br />
                <span style={{ color: '#a9ddd3' }}>Real Value.</span>
              </h2>
              <p className="text-base md:text-lg leading-relaxed text-slate-300 max-w-2xl mb-8">
                List, buy and trade exclusive game NFTs. Off-chain EIP-712 signatures. On-chain Base L2 settlement. Non-custodial. Yours forever.
              </p>
              <div className="flex flex-wrap gap-3 mb-8">
                {['EIP-712 Signed', 'ERC-1155 Assets', 'Non-Custodial', 'Instant Settlement'].map(t => (
                  <span key={t} className="stat-chip">{t}</span>
                ))}
              </div>
              <Link href="/marketplace" className="btn-primary text-xs px-8 py-4 inline-flex">
                Open Marketplace <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Stats block */}
            <div className="grid grid-cols-2 gap-px bg-border w-full lg:max-w-sm">
              {[
                { label: 'Total Volume',  value: '248 ETH',  icon: Coins   },
                { label: 'Active Listings', value: '3.4K',  icon: Star    },
                { label: 'Unique Traders', value: '1.8K',   icon: Users   },
                { label: 'Avg Sale',       value: '0.08 ETH',icon: TrendingUp },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-bg-card px-6 py-6">
                    <Icon className="w-4 h-4 mb-2" style={{ color: '#a9ddd3' }} />
                    <div className="font-heading font-black text-xl text-white">{s.value}</div>
                    <div className="text-[10px] font-heading tracking-widest text-text-muted uppercase mt-1">{s.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
