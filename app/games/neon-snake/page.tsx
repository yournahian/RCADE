'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiService } from '@/services/api';

export default function NeonSnakeLobby() {
    const { ready, authenticated, getAccessToken } = usePrivy();
    const router = useRouter();
    const [effectiveProgressionLevel, setEffectiveProgressionLevel] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    useEffect(() => {
        if (ready && authenticated) {
            ApiService.fetchWithAuth('/api/auth/sync', { method: 'POST' }, getAccessToken)
                .then(res => res.json())
                .then(data => {
                    if (data.user) setEffectiveProgressionLevel(data.user.effectiveProgressionLevel ?? 0);
                    setIsLoading(false);
                })
                .catch(() => setIsLoading(false));
        }
    }, [ready, authenticated, getAccessToken]);

    if (!ready || isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[80vh]">
                <div className="w-16 h-16 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-12 w-full flex flex-col items-center justify-center min-h-[80vh] text-center">
            <h1 className="font-heading text-5xl md:text-7xl font-bold text-neon-cyan mb-4 drop-shadow-[0_0_15px_rgba(0,240,255,0.8)]">NEON SNAKE</h1>
            <p className="text-gray-400 font-mono mb-12 max-w-lg">
                Navigate the cyber grid, consume energy data, and survive the digital hazards. Are you ready for the ultimate arcade challenge?
            </p>

            <div className="flex flex-col md:flex-row gap-6">
                <Link 
                    href={`/play/neon-snake/level/${effectiveProgressionLevel + 1}`} 
                    className="px-8 py-4 bg-neon-magenta/10 border-2 border-neon-magenta text-neon-magenta font-heading text-xl hover:bg-neon-magenta hover:text-white transition-all shadow-[0_0_15px_rgba(255,0,60,0.4)] hover:shadow-[0_0_30px_rgba(255,0,60,0.8)] rounded-lg min-w-[250px]"
                >
                    Continue (Level {effectiveProgressionLevel + 1})
                </Link>
                <Link 
                    href="/levels" 
                    className="px-8 py-4 bg-gray-900/50 border-2 border-neon-cyan/50 text-neon-cyan font-heading text-xl hover:bg-neon-cyan/20 transition-all rounded-lg min-w-[250px]"
                >
                    Select Level
                </Link>
            </div>
            
            <Link href="/dashboard" className="mt-12 text-sm font-mono text-gray-500 hover:text-white underline uppercase tracking-widest">
                Return to Games Hub
            </Link>
        </div>
    );
}
