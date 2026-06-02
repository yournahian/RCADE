'use client';

import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface MobileControlsProps {
  onInput: (direction: string) => void;
}

export default function MobileControls({ onInput }: MobileControlsProps) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-3 w-56 h-56 mx-auto opacity-80 touch-none">
      <div />
      <button 
        className="bg-neon-cyan/20 border-2 border-neon-cyan rounded-lg flex items-center justify-center active:bg-neon-cyan/60 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
        onTouchStart={(e) => { e.preventDefault(); onInput('up'); }}
        onMouseDown={(e) => { e.preventDefault(); onInput('up'); }}
      >
        <ArrowUp className="text-neon-cyan w-10 h-10" />
      </button>
      <div />
      
      <button 
        className="bg-neon-cyan/20 border-2 border-neon-cyan rounded-lg flex items-center justify-center active:bg-neon-cyan/60 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
        onTouchStart={(e) => { e.preventDefault(); onInput('left'); }}
        onMouseDown={(e) => { e.preventDefault(); onInput('left'); }}
      >
        <ArrowLeft className="text-neon-cyan w-10 h-10" />
      </button>
      <div className="bg-arcade-dark/80 border-2 border-neon-cyan/30 rounded-full flex items-center justify-center shadow-[inset_0_0_10px_rgba(0,240,255,0.2)]">
        <div className="w-6 h-6 bg-neon-cyan/40 rounded-full animate-pulse"></div>
      </div>
      <button 
        className="bg-neon-cyan/20 border-2 border-neon-cyan rounded-lg flex items-center justify-center active:bg-neon-cyan/60 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
        onTouchStart={(e) => { e.preventDefault(); onInput('right'); }}
        onMouseDown={(e) => { e.preventDefault(); onInput('right'); }}
      >
        <ArrowRight className="text-neon-cyan w-10 h-10" />
      </button>

      <div />
      <button 
        className="bg-neon-cyan/20 border-2 border-neon-cyan rounded-lg flex items-center justify-center active:bg-neon-cyan/60 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
        onTouchStart={(e) => { e.preventDefault(); onInput('down'); }}
        onMouseDown={(e) => { e.preventDefault(); onInput('down'); }}
      >
        <ArrowDown className="text-neon-cyan w-10 h-10" />
      </button>
      <div />
    </div>
  );
}
