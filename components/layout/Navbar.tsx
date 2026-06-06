'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { Menu, X, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

const NAV_LINKS = [
  { href: '/',            label: 'Home' },
  { href: '/play',        label: 'Play' },
  { href: '/arena',       label: 'Arena',     authRequired: true },
  { href: '/marketplace', label: 'Market' },
  { href: '/dashboard',   label: 'Dashboard', authRequired: true },
];

export default function Navbar() {
  const { login, authenticated, logout } = usePrivy();
  const [isOpen, setIsOpen]   = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-[1400px] mx-auto px-8 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between h-[60px]">

          {/* ── Logo ────────────────────────────────────────────────── */}
          <Link href="/" className="flex items-center gap-2.5 select-none group">
            <div
              className="w-6 h-6 flex items-center justify-center flex-shrink-0"
              style={{ background: '#a9ddd3', boxShadow: '0 0 10px rgba(169,221,211,0.4)' }}
            >
              <Zap className="w-3.5 h-3.5 text-black" fill="black" />
            </div>
            <span className="font-heading font-black text-[15px] tracking-[0.22em] text-white group-hover:text-[#a9ddd3] transition-colors duration-200">
              RCADE
            </span>
          </Link>

          {/* ── Desktop nav pill (center) ─────────────────────────── */}
          <div
            className="hidden md:flex items-center gap-1 rounded-full px-3 py-1.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            {NAV_LINKS.filter(l => !l.authRequired || authenticated).map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-1.5 rounded-full text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/5 transition-all duration-200 whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* ── Right: socials + CTA ─────────────────────────────── */}
          <div className="hidden md:flex items-center gap-5">

            {/* Social icons */}
            <div className="flex items-center gap-4">
              {/* Discord */}
              <a
                href="https://discord.gg"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="text-white/35 hover:text-white transition-colors duration-200"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.873-.894a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.92 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009a9.7 9.7 0 0 0 .29.228a.078.078 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.894a.077.077 0 0 0-.041.107a14.314 14.314 0 0 0 1.221 1.985a.078.078 0 0 0 .085.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.156-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.156-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.156 2.418z" />
                </svg>
              </a>

              {/* X / Twitter */}
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X / Twitter"
                className="text-white/35 hover:text-white transition-colors duration-200"
              >
                <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              {/* Instagram */}
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-white/35 hover:text-white transition-colors duration-200"
              >
                <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            </div>

            {/* Thin separator */}
            <div className="w-px h-4 bg-white/12" />

            {/* CTA pill button — white solid with black arrow circle on RIGHT */}
            {authenticated ? (
              <button
                onClick={logout}
                className="flex items-center gap-3 rounded-full pl-5 pr-1.5 py-1.5 transition-all duration-200 hover:opacity-85 hover:scale-[1.02]"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <span className="text-[12px] font-semibold text-white tracking-wide">
                  Disconnect
                </span>
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </div>
              </button>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-3 rounded-full pl-5 pr-1.5 py-1.5 bg-white transition-all duration-200 hover:opacity-90 hover:scale-[1.02] hover:shadow-[0_0_18px_rgba(255,255,255,0.3)]"
              >
                <span className="text-[12px] font-semibold text-black tracking-wide">
                  Connect
                </span>
                <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-white">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </div>
              </button>
            )}
          </div>

          {/* ── Mobile toggle ────────────────────────────────────── */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div
          className="px-6 pb-5 pt-2 flex flex-col gap-1"
          style={{
            background: 'rgba(5,5,8,0.95)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {NAV_LINKS.filter(l => !l.authRequired || authenticated).map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="block px-3 py-3 text-[13px] font-medium text-white/50 hover:text-white border-l-2 border-transparent hover:border-[#a9ddd3] hover:pl-4 transition-all duration-200"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 mt-1 border-t border-white/6">
            {authenticated ? (
              <button
                onClick={() => { logout(); setIsOpen(false); }}
                className="w-full rounded-full py-2.5 text-[12px] font-semibold text-white border border-white/15 hover:bg-white/5 transition-all"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => { login(); setIsOpen(false); }}
                className="w-full rounded-full py-2.5 text-[12px] font-semibold text-black bg-white hover:opacity-90 transition-all"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
