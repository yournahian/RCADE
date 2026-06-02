'use client';

import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { DiagnosticsPanel } from '@/components/arena/DiagnosticsPanel';
import { ShieldAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function DiagnosticsPage() {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] font-mono text-xs text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
        <span className="uppercase tracking-[0.2em]">CONNECTING DIAGNOSTICS CONSOLE...</span>
      </div>
    );
  }

  // Enforce administrative auth checks
  if (!authenticated) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[600px] text-center px-4 font-sans bg-bg-void">
        <div className="arcade-panel max-w-md w-full p-8 relative">
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-red-500" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-red-500" />
          
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-5 animate-pulse" />
          <h2 className="font-heading font-black text-2xl text-white uppercase tracking-tight mb-2">
            ACCESS DENIED
          </h2>
          <p className="text-slate-400 text-xs mb-8 uppercase tracking-widest leading-relaxed">
            Developer diagnostic console is gated by active admin identities.
          </p>
          <Link
            href="/arena"
            className="btn-secondary w-full text-center uppercase block"
          >
            RETURN TO ARENA
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-bg-void py-12 md:py-24 px-4 relative overflow-hidden flex justify-center pixel-grid crt-overlay">
      <div className="w-full max-w-4xl">
        <DiagnosticsPanel />
      </div>
    </div>
  );
}
