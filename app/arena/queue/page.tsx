'use client';

import React, { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useArenaMatch } from '@/hooks/arena/useArenaMatch';
import { MatchmakingQueue } from '@/components/arena/MatchmakingQueue';
import { Loader2 } from 'lucide-react';

function ArenaQueueContent() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();

  const gameIdParam = searchParams?.get('gameId');
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 1;

  const {
    uiState,
    activeMatch,
    queueTimeElapsed,
    sessionRecovered,
    leaveQueue
  } = useArenaMatch(gameId, 'BRONZE', getAccessToken);

  // Monitor queuing state redirects
  useEffect(() => {
    if (!ready || !sessionRecovered) return;

    if (!authenticated) {
      router.push(`/arena?gameId=${gameId}`);
      return;
    }

    console.log('[Arena][QueuePage] Current State:', uiState);

    // If IDLE, redirect back to Arena dashboard
    if (uiState === 'IDLE') {
      router.push(`/arena?gameId=${gameId}`);
    }
    // If paired and advancing to match, redirect to active match arena
    else if (uiState === 'MATCHED' || uiState === 'COUNTDOWN' || uiState === 'ACTIVE') {
      if (activeMatch?.id) {
        router.push(`/arena/match/${activeMatch.id}?gameId=${gameId}`);
      }
    }
  }, [ready, authenticated, sessionRecovered, uiState, activeMatch?.id, router, gameId]);

  if (!ready || !sessionRecovered) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] font-mono text-xs text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
        <span className="uppercase tracking-[0.2em]">INITIALIZING MATCHMAKING PORTS...</span>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-[#010101] flex items-center justify-center py-10 relative">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
      
      <MatchmakingQueue
        elapsedSeconds={queueTimeElapsed}
        onCancel={leaveQueue}
      />
    </div>
  );
}

export default function ArenaQueuePage() {
  return (
    <React.Suspense fallback={
      <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] font-mono text-xs text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
        <span className="uppercase tracking-[0.2em]">INITIALIZING MATCHMAKING PORTS...</span>
      </div>
    }>
      <ArenaQueueContent />
    </React.Suspense>
  );
}
