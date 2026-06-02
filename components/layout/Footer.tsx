'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

export default function Footer() {
  const { authenticated } = usePrivy();

  const platformLinks = [
    { label: 'Home',        href: '/'           },
    { label: 'Play',        href: '/play'        },
    { label: 'Arena',       href: '/arena'       },
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'Dashboard',   href: '/dashboard'   },
  ];

  return (
    <footer className="relative border-t border-border bg-bg-dark z-10 mt-auto">
      {/* Top mint line accent */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #a9ddd3, #a9ddd3, transparent)', opacity: 0.5 }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-8">

          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center" style={{ background: '#a9ddd3' }}>
                <Zap className="w-4 h-4 text-black" fill="black" />
              </div>
              <span className="font-heading font-black text-base tracking-[0.2em] text-white">RCADE</span>
            </Link>
            <p className="text-base leading-relaxed text-slate-400 max-w-prose">
              Skill-based Web3 arcade. Play real games, earn on-chain NFTs, own your progress.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse" style={{ boxShadow: '0 0 6px rgba(169,221,211,0.8)' }} />
              <span className="text-[10px] font-heading tracking-widest text-orange uppercase">Live on Base Sepolia</span>
            </div>
          </div>

          {/* Links */}
          <div>
            <p className="text-[10px] font-heading font-bold tracking-[0.2em] text-text-muted uppercase mb-4">Platform</p>
            <ul className="flex flex-col gap-2.5">
              {platformLinks.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-text-secondary hover:text-orange transition-colors font-heading tracking-wider">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <p className="text-[10px] font-heading font-bold tracking-[0.2em] text-text-muted uppercase mb-4">Community</p>
            <div className="flex gap-2">
              {['Twitter / X', 'Discord'].map(s => (
                <a key={s} href="#" className="px-3 py-2 border border-border text-[10px] font-heading tracking-widest text-text-secondary hover:border-orange hover:text-orange transition-all uppercase">
                  {s}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Dedicated Admin Portal Rows */}
        {authenticated && (
          <div className="mb-6 pt-6 border-t border-border flex flex-col gap-2.5 text-xs font-heading tracking-wider">
            <span className="text-[10px] font-bold text-orange uppercase flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange animate-pulse" style={{ boxShadow: '0 0 6px rgba(251,146,60,0.8)' }} />
              Admin Portal
            </span>
            <div className="flex flex-col gap-2 pl-4">
              <Link href="/admin/operations" className="text-text-secondary hover:text-orange transition-colors w-fit">
                Admin Ops
              </Link>
              <Link href="/admin/replay-inspector" className="text-text-secondary hover:text-orange transition-colors w-fit">
                Inspector
              </Link>
            </div>
          </div>
        )}

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] font-heading tracking-widest text-text-muted uppercase">
            © {new Date().getFullYear()} RCADE Platform
          </p>
          <p className="text-[10px] font-heading tracking-widest text-text-muted uppercase">
            Base L2 · EIP-712 · ERC-1155
          </p>
        </div>
      </div>
    </footer>
  );
}
