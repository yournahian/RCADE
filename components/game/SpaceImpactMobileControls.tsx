'use client';

import React from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Zap } from 'lucide-react';

interface SpaceImpactMobileControlsProps {
  onInput: (action: string) => void;
}

export default function SpaceImpactMobileControls({ onInput }: SpaceImpactMobileControlsProps) {
  // Helpers to handle starting and stopping movement dynamically
  const startMove = (dir: string) => {
    onInput(dir);
  };

  const stopMove = (dir: string) => {
    onInput(`stop-${dir}`);
  };

  return (
    <div className="w-full max-w-[500px] mx-auto px-4 flex flex-row items-center justify-between gap-6 touch-none select-none">
      
      {/* 1. D-Pad Directional Controls */}
      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-44 h-44 bg-zinc-950/40 p-2 rounded-2xl border border-zinc-900/60 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] relative">
        <div />
        
        {/* Up arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('up'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('up'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('up'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('up'); }}
        >
          <ArrowUp className="text-zinc-400 active:text-neon-cyan w-8 h-8" />
        </button>
        <div />
        
        {/* Left arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('left'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('left'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('left'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('left'); }}
        >
          <ArrowLeft className="text-zinc-400 active:text-neon-cyan w-8 h-8" />
        </button>
        
        {/* Core Center Anchor */}
        <div className="flex items-center justify-center">
          <div className="w-5 h-5 bg-zinc-800 rounded-full border border-zinc-700 shadow-inner flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-neon-cyan/20 rounded-full animate-ping" />
          </div>
        </div>
        
        {/* Right arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('right'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('right'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('right'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('right'); }}
        >
          <ArrowRight className="text-zinc-400 active:text-neon-cyan w-8 h-8" />
        </button>

        <div />
        
        {/* Down arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('down'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('down'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('down'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('down'); }}
        >
          <ArrowDown className="text-zinc-400 active:text-neon-cyan w-8 h-8" />
        </button>
        <div />
      </div>

      {/* 2. Big Neon Magenta FIRE Button */}
      <div className="flex flex-col items-center justify-center gap-1">
        <button
          className="w-24 h-24 rounded-full bg-neon-magenta/15 border-4 border-neon-magenta flex items-center justify-center shadow-[0_0_20px_rgba(255,0,133,0.4),inset_0_0_15px_rgba(255,0,133,0.3)] active:bg-neon-magenta/50 active:scale-90 transition-all cursor-pointer select-none"
          onTouchStart={(e) => { e.preventDefault(); onInput('fire'); }}
          onMouseDown={(e) => { e.preventDefault(); onInput('fire'); }}
        >
          <Zap className="w-10 h-10 text-white fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
        </button>
        <span className="text-[9px] font-mono font-bold tracking-[0.25em] text-neon-magenta uppercase mt-2 select-none">
          FIRE WEAPON
        </span>
      </div>

    </div>
  );
}
