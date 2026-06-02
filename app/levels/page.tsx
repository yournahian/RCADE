'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { ApiService } from '@/services/api';
import { LevelManager, LevelConfig } from '@/game/managers/LevelManager';
import Link from 'next/link';

interface LevelProgressData {
    level: number;
    highestScore: number;
    bestCombo: number;
    completed: boolean;
}

export default function LevelsPage() {
    const { ready, authenticated, getAccessToken } = usePrivy();
    const router = useRouter();
    
    const [highestUnlocked, setHighestUnlocked] = useState(1);
    const [progressMap, setProgressMap] = useState<Record<number, LevelProgressData>>({});
    const [isLoading, setIsLoading] = useState(true);
    
    const [selectedLevel, setSelectedLevel] = useState<LevelConfig | null>(null);

    const levels = LevelManager.getAllLevels();

    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    useEffect(() => {
        async function fetchProgression() {
            if (!authenticated) return;
            try {
                const res = await ApiService.fetchWithAuth('/api/auth/sync', { method: 'POST' }, getAccessToken);
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        // Use Math.max to ensure players can access levels they've cleared or own NFTs for
                        setHighestUnlocked((data.user.effectiveProgressionLevel ?? 0) + 1);
                        
                        const pMap: Record<number, LevelProgressData> = {};
                        if (data.user.levelProgress) {
                            data.user.levelProgress.forEach((p: any) => {
                                pMap[p.level] = p;
                            });
                        }
                        setProgressMap(pMap);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch progression", e);
            } finally {
                setIsLoading(false);
            }
        }
        
        fetchProgression();
    }, [authenticated, getAccessToken]);

    if (!ready || isLoading) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center bg-arcade-dark">
                <div className="text-neon-cyan font-heading animate-pulse text-2xl tracking-widest">DECRYPTING PROTOCOLS...</div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-bg-void text-[#e8e3d5] p-4 md:p-8 relative">
            <div className="max-w-6xl mx-auto">
                
                <header className="flex justify-between items-center mb-12 border-b border-neon-cyan/20 pb-4">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-heading text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]">SYSTEM MAP</h1>
                        <p className="text-gray-400 font-mono mt-2 uppercase tracking-widest">Select your next target</p>
                    </div>
                    <Link href="/dashboard" className="px-6 py-2 border border-gray-600 rounded text-gray-400 hover:text-white hover:border-white transition-all font-mono uppercase text-sm">
                        Return to Hub
                    </Link>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {levels.map((level) => {
                        const isUnlocked = level.level <= highestUnlocked;
                        const progress = progressMap[level.level];
                        
                        if (!isUnlocked) {
                            return (
                                <div key={level.level} className="relative bg-[#0d0d0d]/50 border border-border rounded-xl p-6 glass-panel flex flex-col items-center justify-center min-h-[200px] opacity-60">
                                    <div className="absolute inset-0 bg-[#010101]/40 rounded-xl flex items-center justify-center z-10 backdrop-blur-[2px]">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                        </svg>
                                    </div>
                                    <div className="text-gray-600 font-heading text-2xl mb-1">LEVEL {level.level}</div>
                                    <div className="text-gray-700 font-mono text-xs uppercase tracking-widest">{level.tierName}</div>
                                </div>
                            );
                        }

                        return (
                            <button 
                                key={level.level} 
                                onClick={() => setSelectedLevel(level)}
                                className="group relative bg-[#0d0d0d]/80 border rounded-xl p-6 glass-panel flex flex-col items-start transition-all hover:-translate-y-2 cursor-pointer text-left overflow-hidden"
                                style={{ borderColor: `${level.themeHex}40` }}
                            >
                                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: level.themeHex, boxShadow: `0 0 10px ${level.themeHex}` }}></div>
                                
                                <div className="flex justify-between w-full items-start mb-4">
                                    <div>
                                        <div className="font-heading text-3xl font-bold" style={{ color: level.themeHex, textShadow: `0 0 10px ${level.themeHex}80` }}>
                                            {level.level.toString().padStart(2, '0')}
                                        </div>
                                        <div className="text-white/70 font-mono text-xs uppercase tracking-wider mt-1">{level.tierName}</div>
                                    </div>
                                    <div className="px-2 py-1 bg-black/50 border rounded text-[10px] font-mono uppercase tracking-widest" style={{ borderColor: `${level.themeHex}40`, color: level.themeHex }}>
                                        {level.difficulty}
                                    </div>
                                </div>

                                <div className="w-full space-y-2 mt-auto pt-4 border-t border-white/5">
                                    <div className="flex justify-between items-center text-sm font-mono">
                                        <span className="text-gray-500">BEST SCORE</span>
                                        <span className="text-white">{progress?.highestScore || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-mono">
                                        <span className="text-gray-500">MAX COMBO</span>
                                        <span className="text-white">x{(progress?.bestCombo || 1.0).toFixed(1)}</span>
                                    </div>
                                </div>

                                {/* Hover Glow Overlay */}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" style={{ backgroundColor: level.themeHex }}></div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* PREVIEW MODAL */}
            {selectedLevel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010101]/80 backdrop-blur-sm">
                    <div className="bg-[#0d0d0d] border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        
                        <div className="h-2 w-full" style={{ backgroundColor: selectedLevel.themeHex, boxShadow: `0 0 20px ${selectedLevel.themeHex}` }}></div>
                        
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-3xl font-heading font-bold" style={{ color: selectedLevel.themeHex, textShadow: `0 0 10px ${selectedLevel.themeHex}80` }}>
                                        {selectedLevel.displayName}
                                    </h2>
                                    <p className="text-white/60 font-mono uppercase tracking-widest text-sm mt-1">{selectedLevel.tierName}</p>
                                </div>
                                <button onClick={() => setSelectedLevel(null)} className="text-gray-500 hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between items-center p-3 bg-[#010101]/40 rounded border border-border-dim">
                                    <span className="text-gray-400 font-mono text-sm uppercase">Difficulty</span>
                                    <span className="font-mono" style={{ color: selectedLevel.themeHex }}>{selectedLevel.difficulty}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-[#010101]/40 rounded border border-border-dim">
                                    <span className="text-gray-400 font-mono text-sm uppercase">Target Score</span>
                                    <span className="text-white font-mono">{selectedLevel.targetScore}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-[#010101]/40 rounded border border-border-dim">
                                    <span className="text-gray-400 font-mono text-sm uppercase">Hazards</span>
                                    <span className="text-white font-mono text-xs text-right max-w-[150px]">
                                        {selectedLevel.obstacleTypes.join(' / ')} ({selectedLevel.obstacleCount})
                                    </span>
                                </div>

                                <div className="pt-4 border-t border-white/10 mt-4 flex justify-between px-2">
                                    <div className="text-center">
                                        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-1">Personal Best</div>
                                        <div className="text-xl font-heading text-white">{progressMap[selectedLevel.level]?.highestScore || 0}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-1">Max Combo</div>
                                        <div className="text-xl font-heading" style={{ color: selectedLevel.themeHex }}>x{(progressMap[selectedLevel.level]?.bestCombo || 1.0).toFixed(1)}</div>
                                    </div>
                                </div>
                            </div>

                            <Link 
                                href={`/play/neon-snake/level/${selectedLevel.level}`}
                                className="block w-full py-4 text-center text-black font-heading text-xl rounded hover:scale-[1.02] transition-all cursor-pointer"
                                style={{ backgroundColor: selectedLevel.themeHex, boxShadow: `0 0 15px ${selectedLevel.themeHex}80` }}
                            >
                                INITIATE PROTOCOL
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
