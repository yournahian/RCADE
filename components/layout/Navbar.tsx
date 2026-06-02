'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { Menu, X, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

const NAV_LINKS = [
  { href: '/',            label: 'Home' },
  { href: '/play',        label: 'Play' },
  { href: '/arena',       label: 'Arena', authRequired: true },
  { href: '/marketplace', label: 'Market' },
  { href: '/dashboard',   label: 'Dashboard', authRequired: true },
];

export default function Navbar() {
  const { login, authenticated, logout } = usePrivy();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'glass-nav shadow-[0_2px_20px_rgba(0,0,0,0.8)]' : 'bg-transparent border-b border-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group select-none">
            <div className="w-7 h-7 flex items-center justify-center"
              style={{ background: '#a9ddd3', boxShadow: '0 0 12px rgba(169,221,211,0.5)' }}>
              <Zap className="w-4 h-4 text-black" fill="black" />
            </div>
            <span className="font-heading font-black text-lg tracking-[0.2em] text-white group-hover:text-orange transition-colors duration-200">
              RCADE
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-0">
            {NAV_LINKS.filter(l => !l.authRequired || authenticated).map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="px-5 py-4 text-xs font-heading font-bold tracking-[0.12em] uppercase text-text-secondary hover:text-white border-b-2 border-transparent hover:border-orange transition-all duration-200"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center">
            {authenticated ? (
              <button onClick={logout} className="btn-secondary text-[0.65rem] px-5 py-2.5">
                Disconnect
              </button>
            ) : (
              <button onClick={login} className="btn-primary text-[0.65rem] px-5 py-2.5">
                <Zap className="w-3 h-3" fill="black" /> Connect
              </button>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden w-12 h-12 flex items-center justify-center text-text-secondary hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`md:hidden overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="bg-bg-dark border-t border-border px-4 pb-4 pt-2 flex flex-col gap-1">
          {NAV_LINKS.filter(l => !l.authRequired || authenticated).map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="block px-3 py-3 text-xs font-heading font-bold tracking-widest uppercase text-text-secondary hover:text-orange border-l-2 border-transparent hover:border-orange transition-all"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-border mt-1">
            {authenticated
              ? <button onClick={() => { logout(); setIsOpen(false); }} className="btn-secondary w-full text-[0.65rem] py-2.5">Disconnect</button>
              : <button onClick={() => { login(); setIsOpen(false); }} className="btn-primary w-full text-[0.65rem] py-2.5"><Zap className="w-3 h-3" fill="black" /> Connect Wallet</button>
            }
          </div>
        </div>
      </div>
    </nav>
  );
}
