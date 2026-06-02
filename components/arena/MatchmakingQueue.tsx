'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, Cpu, Layers, RefreshCw, XCircle, Terminal, HelpCircle } from 'lucide-react';

interface MatchmakingQueueProps {
  elapsedSeconds: number;
  onCancel: () => void;
}

export function MatchmakingQueue({ elapsedSeconds, onCancel }: MatchmakingQueueProps) {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSec: number) => {
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Generate dynamic retro arcade queue log feeds
  const getLogMessage = (time: number) => {
    if (time < 5) return 'INITIALIZING MATCHMAKER PROTOCOLS...';
    if (time < 10) return 'BROADCASTING GLICKO-2 MATCH IDENTITY GATES...';
    if (time < 15) return 'SCANNING ACTIVE BRONZE TIERS FOR RIVALS...';
    if (time < 20) return 'FILTERING RECENT CONSECUTIVE DUEL COOLDOWNS...';
    if (time < 25) return 'NO IMMEDIATE PAIR FOUND. EXPANDING MMR TARGET RANGE...';
    if (time < 30) return 'POLLING CONCURRENCY ENTRANCES (3000ms standard rate)...';
    if (time === 30) return 'QUEUE AGE EXCEEDS 30s. SHUTTLE COMMITTED FOR GHOST OPPONENT CODES.';
    return 'SEEDING GHOST OPPONENT TELEMETRY VECTOR... STAND BY...';
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-16 font-mono text-zinc-300">
      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-8 relative overflow-hidden shadow-2xl">
        {/* CRT Scanline mesh overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
        
        {/* Neon accent corner lines */}
        <div className="absolute top-0 left-0 w-4 h-[1px] bg-neon-cyan" />
        <div className="absolute top-0 left-0 w-[1px] h-4 bg-neon-cyan" />
        <div className="absolute bottom-0 right-0 w-4 h-[1px] bg-neon-cyan" />
        <div className="absolute bottom-0 right-0 w-[1px] h-4 bg-neon-cyan" />

        {/* Header indicator */}
        <div className="flex justify-between items-center mb-8 border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-neon-cyan animate-spin" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-neon-cyan">
              QUEUE ENGAGED
            </span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            1v1 DUEL
          </span>
        </div>

        {/* Large clock */}
        <div className="text-center py-6">
          <div className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1.5 font-bold">
            SEARCHING FOR MATCHMAKER PAIR{dots}
          </div>
          <div className="text-5xl font-black text-white tracking-wider font-heading drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            {formatTime(elapsedSeconds)}
          </div>
        </div>

        {/* Terminal log logs */}
        <div className="bg-zinc-950/80 border border-zinc-900 rounded-lg p-4 mb-8 min-h-[90px] flex items-start gap-2.5">
          <Terminal className="w-4 h-4 text-neon-cyan mt-0.5 flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">
              System Console Logs:
            </div>
            <div className="text-[11px] text-neon-cyan uppercase leading-relaxed font-bold animate-pulse">
              &gt; {getLogMessage(elapsedSeconds)}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4">
          <button
            onClick={onCancel}
            className="w-full py-4 bg-zinc-950 border border-red-500/30 text-red-400 font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:bg-red-950/10 hover:border-red-500/50 hover:text-red-300 transition-all cursor-pointer flex items-center justify-center gap-2 uppercase shadow-[0_0_15px_rgba(239,68,68,0.05)]"
          >
            <XCircle className="w-4 h-4" />
            ABANDON MATCHSEARCH
          </button>
        </div>

        {/* Queue Safety Advice footer */}
        <div className="mt-8 text-center text-[9px] text-zinc-600 uppercase tracking-widest leading-relaxed">
          Leaving queue now will apply zero rating MMR adjustments.
        </div>
      </div>
    </div>
  );
}
