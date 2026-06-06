import Link from 'next/link';
import { Gamepad2, Trophy, Zap, ChevronRight, Star, TrendingUp, Shield, Users, Coins } from 'lucide-react';

const FEATURES = [
  { icon: Gamepad2, label: 'Play-to-Earn',     body: 'Skill-based arcade games with on-chain rewards for every session.' },
  { icon: Shield,   label: 'True Ownership',   body: 'ERC-1155 assets on Base L2. Your NFTs, your wallet, no custodians.' },
  { icon: TrendingUp,label: 'Live Marketplace', body: 'EIP-712 signed listings. Off-chain speed, on-chain settlement.' },
  { icon: Trophy,   label: 'Leaderboards',     body: 'Global weekly rankings. Top players earn CADE airdrops and rare drops.' },
];


export default function Home() {
  return (
    <div className="flex flex-col w-full">

      {/* ═══════════════════════════════════════════════════
          HERO — absolute-positioned layout matching reference
      ═══════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden -mt-[60px]" style={{ height: '100vh' }}>

        {/* Background Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 35%' }}
        >
          <source src="/assets/hero_video.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Left-edge dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/15 to-transparent pointer-events-none" />
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-[#010101] to-transparent pointer-events-none" />

        {/* ── LEFT: Text — centered vertically, pushed slightly down to clear navbar ─── */}
        <div
          className="absolute top-1/2 -translate-y-[45%] flex flex-col items-start"
          style={{ left: 'clamp(2rem, 8vw, 8rem)', maxWidth: 'min(480px, 38vw)', marginTop: '30px' }}
        >
          {/* Headline */}
          <h1
            className="font-heading font-black text-white leading-[1.05] tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.4rem, 4.2vw, 4.6rem)' }}
          >
            The Next Era<br />
            of{' '}
            <span style={{ color: '#a9ddd3', textShadow: '0 0 28px rgba(169,221,211,0.45)' }}>
              Arcade
            </span>
            <svg
              className="inline-block ml-2 animate-pulse"
              style={{ width: '0.62em', height: '0.62em', verticalAlign: 'middle', marginTop: '-0.08em', color: '#a9ddd3' }}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0L14.6 9.4L24 12L14.6 14.6L12 24L9.4 14.6L0 12L9.4 9.4Z" />
            </svg>
            <br />
            Gaming
          </h1>

          {/* Description */}
          <p
            className="text-white/50 text-[13px] leading-relaxed mb-7"
            style={{ maxWidth: '270px' }}
          >
            A skill-based{' '}
            <span className="text-white/90 font-medium">Web3 arcade</span>{' '}
            where every level you beat becomes an NFT you own — play, earn,
            and trade your progression on Base.
          </p>

          {/* Frosted-glass pill button — teal circle on LEFT, text on RIGHT */}
          <Link
            href="/play"
            className="group flex items-center gap-4 rounded-full transition-all duration-300 hover:scale-[1.03]"
            style={{
              background: 'rgba(169, 221, 211, 0.08)',
              border: '1px solid rgba(169, 221, 211, 0.18)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
              padding: '10px 22px 10px 10px',
            }}
          >
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-black transition-transform duration-300 group-hover:rotate-45"
              style={{ background: '#a9ddd3' }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </div>
            <span className="font-heading font-bold text-white text-[11px] tracking-[0.15em] uppercase">
              Start Playing
            </span>
          </Link>
        </div>

        {/* ── RIGHT: Facts card — pinned bottom-right ── */}
        <div
          className="absolute bottom-10"
          style={{ right: 'clamp(2rem, 6vw, 6rem)', width: 'clamp(230px, 18vw, 275px)' }}
        >
          {/* Floating white circle above-left of card */}
          <div
            className="absolute -top-5 left-5 w-9 h-9 rounded-full bg-white flex items-center justify-center text-black z-20"
            style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </div>

          {/* Glass card */}
          <div
            className="w-full p-6 rounded-2xl flex flex-col gap-4"
            style={{
              background: 'rgba(6, 6, 10, 0.65)',
              border: '1px solid rgba(255,255,255,0.07)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 24px 50px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <p className="text-[9px] font-heading tracking-[0.3em] text-white/30 uppercase">
              Some Facts
            </p>
            <h3 className="font-heading font-bold text-white text-[17px] tracking-wide uppercase leading-[1.2]">
              About the<br />Arcade
            </h3>
            <p className="text-[11px] text-white/45 leading-relaxed">
              Every level you conquer mints an NFT on Base. Sell your
              progress or buy your way up — today and seasons from now.
            </p>
            <div className="flex items-center justify-between pt-3 border-t border-white/6">
              <Link
                href="/marketplace"
                className="text-[9px] font-heading tracking-[0.22em] text-white/30 uppercase hover:text-white/65 transition-colors"
              >
                Learn More Now
              </Link>
              <Link
                href="/marketplace"
                className="w-8 h-8 rounded-full border border-white/12 flex items-center justify-center text-white/40 hover:text-white hover:border-white/35 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </div>
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
