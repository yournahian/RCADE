'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Grid, Play, Trophy } from 'lucide-react';

export default function SudokuLobby() {
    const { ready, authenticated, login, getAccessToken } = usePrivy();
    const router = useRouter();
    const [progressionLevel, setProgressionLevel] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (ready && !authenticated) {
            setIsLoading(false);
        }
    }, [ready, authenticated]);

    useEffect(() => {
        if (ready && authenticated) {
            // Fetch progression specifically for Sudoku Matrix
            fetch('/api/session/progression?gameSlug=sudoku', {
                headers: { Authorization: `Bearer ${getAccessToken}` }
            })
            .then(res => {
                if (res.ok) return res.json();
                return { effectiveProgressionLevel: 0 };
            })
            .then(data => {
                setProgressionLevel(data.effectiveProgressionLevel ?? 0);
                setIsLoading(false);
            })
            .catch(() => setIsLoading(false));
        }
    }, [ready, authenticated, getAccessToken]);

    if (!ready || isLoading) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] bg-[#020208] font-mono text-xs text-zinc-500 gap-3">
                <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="uppercase tracking-[0.2em] text-amber-500">SYNCHRONIZING CABIN DATA...</span>
            </div>
        );
    }

    return (
        <div className="flex-grow min-h-screen bg-[#020208] pixel-grid relative py-12 px-4 flex flex-col items-center justify-center select-none">
            {/* CRT grid backing */}
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(251,191,36,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />

            <div className="max-w-4xl w-full text-center relative z-10 animate-fade-in p-8 border border-zinc-900 rounded-3xl bg-zinc-950/80 backdrop-blur-md">
                
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-amber-500/10 border-2 border-amber-500 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                        <Grid className="w-12 h-12 text-amber-500 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                    </div>
                </div>

                <h1 className="font-heading text-5xl md:text-7xl font-black text-white uppercase mb-2 tracking-tight">
                    SUDOKU MATRIX
                </h1>
                
                <p className="text-amber-500 font-mono text-xs font-bold uppercase tracking-[0.3em] mb-8">
                    DECENTRALIZED MATRIX SOLVER CODES
                </p>

                <p className="text-zinc-400 font-mono text-sm leading-relaxed max-w-xl mx-auto mb-12">
                    Resolve mathematical desynchronizations inside the mainframe. Avoid matrix conflicts, maintain tactical score combos, and sync verified progression levels to the secure L2 blockchain ledger.
                </p>

                {!authenticated ? (
                    <button
                        onClick={login}
                        className="px-10 py-5 bg-amber-500 text-black font-heading font-black text-lg tracking-[0.2em] hover:brightness-110 transition-all rounded-xl uppercase cursor-pointer shadow-[0_0_25px_rgba(251,191,36,0.4)]"
                    >
                        INSERT COIN — CONNECT WALLET
                    </button>
                ) : (
                    <div className="flex flex-col md:flex-row gap-6 justify-center w-full max-w-2xl mx-auto">
                        
                        {/* Play Campaign Levels */}
                        <Link 
                            href="/play/sudoku" 
                            className="flex-1 px-8 py-5 bg-zinc-900/60 border-2 border-amber-500/50 text-amber-400 font-heading text-lg tracking-wider hover:bg-amber-500 hover:text-black hover:shadow-[0_0_25px_rgba(251,191,36,0.4)] transition-all rounded-xl flex items-center justify-center gap-3"
                        >
                            <Play className="w-5 h-5 fill-current" />
                            PLAY CAMPAIGN
                        </Link>

                        {/* Enter Ranked Arena */}
                        <Link 
                            href="/arena?gameId=6" 
                            className="flex-1 px-8 py-5 bg-amber-500 text-black font-heading text-lg tracking-wider hover:brightness-110 hover:shadow-[0_0_25px_rgba(251,191,36,0.5)] transition-all rounded-xl flex items-center justify-center gap-3 border-2 border-transparent"
                        >
                            <Trophy className="w-5 h-5 fill-current" />
                            RANKED ARENA
                        </Link>
                        
                    </div>
                )}

                <div className="mt-12">
                    <Link href="/play" className="text-xs font-mono text-zinc-600 hover:text-zinc-400 underline uppercase tracking-widest transition-colors">
                        [ Return to mainboard main ]
                    </Link>
                </div>
                
            </div>
        </div>
    );
}
