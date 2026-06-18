'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, ArrowDown, ArrowUp, Swords, Zap, Cpu } from 'lucide-react';

interface CyberRunnerMobileControlsProps {
  onInput: (action: string) => void;
}

export default function CyberRunnerMobileControls({ onInput }: CyberRunnerMobileControlsProps) {
  const startMove = (dir: string) => {
    onInput(dir);
  };

  const stopMove = (dir: string) => {
    onInput(`stop-${dir}`);
  };

  return (
    <div className="w-full max-w-[600px] mx-auto px-4 flex flex-row items-center justify-between gap-8 touch-none select-none">
      {/* 1. D-Pad Directional Controls (Left, Right, Slide Down) */}
      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-40 h-40 bg-zinc-950/40 p-2 rounded-2xl border border-zinc-900/60 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] relative">
        <div />
        <div />
        <div />

        {/* Left Arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('left'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('left'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('left'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('left'); }}
        >
          <ArrowLeft className="text-zinc-400 active:text-neon-cyan w-7 h-7" />
        </button>

        {/* Center Pivot */}
        <div className="flex items-center justify-center">
          <div className="w-4 h-4 bg-zinc-800 rounded-full border border-zinc-700 shadow-inner flex items-center justify-center">
            <div className="w-2 h-2 bg-neon-cyan/25 rounded-full" />
          </div>
        </div>

        {/* Right Arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('right'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('right'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('right'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('right'); }}
        >
          <ArrowRight className="text-zinc-400 active:text-neon-cyan w-7 h-7" />
        </button>

        <div />

        {/* Slide (Down) Arrow */}
        <button 
          className="bg-zinc-900/80 border border-zinc-800 rounded-lg flex items-center justify-center active:bg-neon-cyan/20 active:border-neon-cyan/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          onTouchStart={(e) => { e.preventDefault(); startMove('down'); }}
          onTouchEnd={(e) => { e.preventDefault(); stopMove('down'); }}
          onMouseDown={(e) => { e.preventDefault(); startMove('down'); }}
          onMouseUp={(e) => { e.preventDefault(); stopMove('down'); }}
        >
          <ArrowDown className="text-zinc-400 active:text-neon-cyan w-7 h-7" />
        </button>
        <div />
      </div>

      {/* 2. Action Buttons Cluster (Jump, Melee Attack, Dash, Hack) */}
      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-44 h-44 relative bg-zinc-950/20 p-1.5 rounded-3xl border border-zinc-900/40">
        
        {/* Top: DASH Button (Y) */}
        <div className="col-start-2 row-start-1 flex flex-col items-center">
          <button
            className="w-12 h-12 rounded-full bg-yellow-500/10 border-2 border-yellow-500 flex items-center justify-center active:bg-yellow-500/40 active:scale-90 transition-all shadow-[0_0_8px_rgba(234,179,8,0.2)]"
            onTouchStart={(e) => { e.preventDefault(); onInput('dash'); }}
            onMouseDown={(e) => { e.preventDefault(); onInput('dash'); }}
          >
            <Zap className="w-5 h-5 text-yellow-400 fill-current" />
          </button>
          <span className="text-[7px] font-mono text-zinc-500 mt-0.5">DASH</span>
        </div>

        {/* Left: ATTACK Button (X) */}
        <div className="col-start-1 row-start-2 flex flex-col items-center">
          <button
            className="w-12 h-12 rounded-full bg-neon-magenta/10 border-2 border-neon-magenta flex items-center justify-center active:bg-neon-magenta/40 active:scale-90 transition-all shadow-[0_0_8px_rgba(255,0,133,0.2)]"
            onTouchStart={(e) => { e.preventDefault(); onInput('attack'); }}
            onMouseDown={(e) => { e.preventDefault(); onInput('attack'); }}
          >
            <Swords className="w-5 h-5 text-neon-magenta" />
          </button>
          <span className="text-[7px] font-mono text-zinc-500 mt-0.5">MELEE</span>
        </div>

        {/* Center indicator */}
        <div className="col-start-2 row-start-2 flex items-center justify-center">
          <span className="text-[9px] font-bold text-zinc-700 font-mono tracking-widest">ACT</span>
        </div>

        {/* Right: HACK Button (B) */}
        <div className="col-start-3 row-start-2 flex flex-col items-center">
          <button
            className="w-12 h-12 rounded-full bg-neon-purple/10 border-2 border-neon-purple flex items-center justify-center active:bg-neon-purple/40 active:scale-90 transition-all shadow-[0_0_8px_rgba(168,85,247,0.2)]"
            onTouchStart={(e) => { e.preventDefault(); onInput('hack'); }}
            onMouseDown={(e) => { e.preventDefault(); onInput('hack'); }}
          >
            <Cpu className="w-5 h-5 text-neon-purple" />
          </button>
          <span className="text-[7px] font-mono text-zinc-500 mt-0.5">HACK</span>
        </div>

        {/* Bottom: JUMP Button (A) */}
        <div className="col-start-2 row-start-3 flex flex-col items-center">
          <button
            className="w-12 h-12 rounded-full bg-neon-cyan/15 border-2 border-neon-cyan flex items-center justify-center active:bg-neon-cyan/45 active:scale-90 transition-all shadow-[0_0_8px_rgba(34,211,238,0.2)]"
            onTouchStart={(e) => { e.preventDefault(); onInput('jump'); }}
            onMouseDown={(e) => { e.preventDefault(); onInput('jump'); }}
          >
            <ArrowUp className="w-5 h-5 text-neon-cyan" />
          </button>
          <span className="text-[7px] font-mono text-zinc-500 mt-0.5">JUMP</span>
        </div>

      </div>
    </div>
  );
}
