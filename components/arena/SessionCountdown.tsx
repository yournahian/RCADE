import React from 'react';
import { Clock, ShieldAlert } from 'lucide-react';

interface SessionCountdownProps {
  secondsRemaining: number;
}

export function SessionCountdown({ secondsRemaining }: SessionCountdownProps) {
  const formatTime = (totalSec: number) => {
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isLowTime = secondsRemaining <= 60;

  return (
    <div className={`p-4 rounded-lg border font-mono text-center transition-all ${
      isLowTime 
        ? 'bg-red-950/20 border-red-500/50 text-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
        : 'bg-zinc-950 border-zinc-900 text-zinc-300'
    }`}>
      <div className="flex items-center justify-center gap-2 mb-1.5">
        {isLowTime ? (
          <ShieldAlert className="w-4 h-4 text-red-500 animate-bounce" />
        ) : (
          <Clock className="w-4 h-4 text-neon-cyan animate-pulse" />
        )}
        <span className="text-[10px] font-heading font-black uppercase tracking-[0.25em]">
          SESSION TIME BOUND
        </span>
      </div>

      <div className={`font-heading font-black text-3xl tracking-wider ${
        isLowTime ? 'text-red-500' : 'text-white'
      }`}>
        {formatTime(secondsRemaining)}
      </div>

      {isLowTime && (
        <div className="text-[8px] uppercase tracking-widest text-red-400 mt-1 font-bold">
          Submit score immediately or risk automatic forfeit!
        </div>
      )}
    </div>
  );
}
