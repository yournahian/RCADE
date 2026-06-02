'use client';

import React from 'react';
import { Eraser } from 'lucide-react';

interface SudokuMobileControlsProps {
  onInput: (action: string) => void;
}

export default function SudokuMobileControls({ onInput }: SudokuMobileControlsProps) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="w-full max-w-[480px] mx-auto px-4 flex flex-col gap-4 touch-none select-none">
      
      {/* 1. 1-9 Cyber Numeric Grid */}
      <div className="grid grid-cols-5 gap-2.5 bg-zinc-950/40 p-3 rounded-2xl border border-zinc-900/60 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)]">
        {digits.map(num => (
          <button
            key={num}
            className="h-12 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center justify-center font-heading text-lg font-black text-white hover:border-amber-400 active:bg-amber-500/20 active:border-amber-500/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)] cursor-pointer"
            onTouchStart={(e) => { e.preventDefault(); onInput(`input-${num}`); }}
            onMouseDown={(e) => { e.preventDefault(); onInput(`input-${num}`); }}
          >
            {num}
          </button>
        ))}

        {/* 2. Cyber Erase Button */}
        <button
          className="h-12 col-span-1 bg-red-950/20 border border-red-900/40 hover:border-red-500 rounded-xl flex items-center justify-center font-heading text-xs font-bold text-red-400 active:bg-red-500/20 active:border-red-500/60 active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,0,0,0.5)] cursor-pointer"
          onTouchStart={(e) => { e.preventDefault(); onInput('erase'); }}
          onMouseDown={(e) => { e.preventDefault(); onInput('erase'); }}
        >
          <Eraser className="w-5 h-5 text-red-400 active:text-red-300" />
        </button>
      </div>

      <div className="text-center">
        <span className="text-[9px] font-mono font-bold tracking-[0.25em] text-zinc-500 uppercase">
          CYBERNETIC MATRIX KEYPAD
        </span>
      </div>

    </div>
  );
}
