'use client';

import React, { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useArenaMatch } from '@/hooks/arena/useArenaMatch';
import { BronzeArenaPanel } from '@/components/arena/BronzeArenaPanel';
import { Loader2, ShieldAlert, Cpu, Zap, Swords, Grid, Gamepad2, ArrowRight } from 'lucide-react';
import { GAMES } from '@/lib/games';

function ArenaHubContent() {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const gameIdParam = searchParams?.get('gameId');
  const hasSelectedGame = !!gameIdParam;
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 1;

  // Instantiate our React match state hook dynamically
  const {
    uiState,
    activeMatch,
    playerRank,
    sessionRecovered,
    recoveryError,
    matchHistory,
    standings,
    queueActivity,
    customRoom,
    enterQueue,
    createPrivateRoom,
    joinPrivateRoom,
    startPrivateMatch,
    leavePrivateRoom,
    fetchHistoryAndStandings
  } = useArenaMatch(gameId, 'BRONZE', getAccessToken);

  // Auto-leave room lobby on component unmount (in-app navigation / page exits)
  const customRoomRef = useRef(customRoom);
  const tokenRef = useRef<string | null>(null);
  const isPageReloadingRef = useRef(false);

  useEffect(() => {
    customRoomRef.current = customRoom;
  }, [customRoom]);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const token = await getAccessToken();
        tokenRef.current = token;
      } catch {}
    };
    fetchToken();
  }, [getAccessToken]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      isPageReloadingRef.current = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!isPageReloadingRef.current && customRoomRef.current && customRoomRef.current.roomCode) {
        console.log('[Arena][Hub][Unmount] Navigating away. Leaving custom lobby:', customRoomRef.current.roomCode);
        fetch(`/api/arena/room?roomCode=${customRoomRef.current.roomCode}`, {
          method: 'DELETE',
          headers: {
            'Authorization': tokenRef.current ? `Bearer ${tokenRef.current}` : ''
          }
        }).catch(err => console.error('[Arena][Hub][Unmount] Auto leave room failed:', err));
      }
    };
  }, []);

  // Check state and redirect if the player is in an active match/queue cycle
  useEffect(() => {
    if (!ready || !authenticated || !sessionRecovered) return;

    console.log('[Arena][Hub] Active uiState in Hub page:', uiState);

    if (uiState === 'QUEUED') {
      router.push(`/arena/queue?gameId=${gameId}`);
    } else if (uiState === 'MATCHED' || uiState === 'COUNTDOWN' || uiState === 'ACTIVE') {
      if (activeMatch?.id) {
        router.push(`/arena/match/${activeMatch.id}?gameId=${gameId}`);
      }
    } else if (uiState === 'SUBMITTED' || uiState === 'VERIFIED' || uiState === 'COMPLETED' || uiState === 'CANCELLED' || uiState === 'DISPUTED') {
      if (activeMatch?.id) {
        router.push(`/arena/match/${activeMatch.id}/result?gameId=${gameId}`);
      }
    }
  }, [ready, authenticated, sessionRecovered, uiState, activeMatch?.id, router, gameId]);

  // Loading/Ready states
  if (!ready || (authenticated && !sessionRecovered)) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] font-mono text-xs text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
        <span className="uppercase tracking-[0.2em]">SYNCHRONIZING SECURE ARENA STATE...</span>
      </div>
    );
  }

  // Not authenticated screen (Coin-op retro arcade premium layout)
  if (!authenticated) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[600px] text-center px-4 font-mono relative overflow-hidden">
        {/* CRT Scanline Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
        
        <div className="p-10 border border-zinc-900 rounded-2xl bg-zinc-950/60 max-w-lg relative">
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-neon-cyan" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-neon-cyan" />
          
          <Cpu className="w-12 h-12 text-neon-cyan mx-auto mb-6 animate-bounce" />
          <h1 className="font-heading font-black text-4xl text-white uppercase tracking-tight mb-2">
            INSERT COIN
          </h1>
          <p className="text-zinc-400 text-xs mb-8 uppercase tracking-widest leading-relaxed">
            COMPETITIVE ARENA ENTRY GATED BY ACTIVE PRIVY IDENTITY WALLETS. CONNECT CODES TO LOAD GLICKO-2 PROGRESSION.
          </p>

          <button
            onClick={login}
            className="w-full py-4 bg-neon-cyan text-black font-heading font-black text-xs tracking-[0.2em] hover:brightness-110 transition-all rounded-lg uppercase cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.3)]"
          >
            INSERT COIN — CONNECT WALLET
          </button>
        </div>
      </div>
    );
  }

  const getGameIcon = (iconName: string, color: string) => {
    switch (iconName) {
      case 'Zap': return <Zap className="w-8 h-8" style={{ color }} />;
      case 'Swords': return <Swords className="w-8 h-8" style={{ color }} />;
      case 'Grid': return <Grid className="w-8 h-8" style={{ color }} />;
      default: return <Gamepad2 className="w-8 h-8 text-zinc-400" />;
    }
  };

  // STEP 1: Select Game selector if not chosen yet
  if (!hasSelectedGame) {
    const liveGames = GAMES.filter(g => g.status === 'LIVE');

    return (
      <div className="flex-grow bg-[#010101] pixel-grid relative py-12 px-4 font-mono flex flex-col justify-center min-h-[600px]">
        {/* CRT Scanline Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
        
        <div className="max-w-4xl mx-auto relative z-10 text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Gamepad2 className="w-6 h-6 text-neon-cyan animate-pulse" />
            <span className="text-xs font-bold tracking-[0.3em] text-neon-cyan uppercase">RCADE SYSTEM INTERFACE</span>
          </div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl text-white uppercase tracking-tight mb-2">
            CHOOSE YOUR BATTLEFIELD
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest max-w-lg mx-auto leading-relaxed">
            SELECT A SECURE ARMORED MATRIX NODE TO INITIALIZE GLICKO-2 MATCHMAKING PROTOCOLS.
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 w-full">
          {liveGames.map(game => {
            return (
              <button
                key={game.gameId}
                onClick={() => router.push(`/arena?gameId=${game.gameId}`)}
                className="p-6 border border-zinc-900 bg-zinc-950/60 rounded-2xl hover:border-zinc-700 hover:bg-zinc-950 transition-all text-left flex flex-col justify-between min-h-[220px] relative group cursor-pointer w-full"
                style={{
                  boxShadow: `0 0 15px rgba(0, 0, 0, 0.5)`
                }}
              >
                {/* Visual Accent Glow on Hover */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300 rounded-2xl"
                  style={{
                    backgroundColor: game.accentColor,
                    filter: 'blur(10px)'
                  }}
                />
                
                <div className="relative z-10">
                  <div className="mb-4">
                    {getGameIcon(game.icon, game.accentColor)}
                  </div>
                  <h3 className="text-white font-heading font-black text-base uppercase tracking-wide mb-2">
                    {game.title}
                  </h3>
                  <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                    {game.description}
                  </p>
                </div>

                <div className="relative z-10 mt-6 flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-zinc-400 group-hover:text-white transition-colors w-full">
                  <span>ENTER NODE</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Render Arena Hub panel (STEP 2: Select Mode FOR THAT GAME)
  return (
    <div className="flex-grow bg-[#010101] pixel-grid relative py-6">
      {/* CRT Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />

      <BronzeArenaPanel
        rank={playerRank}
        history={matchHistory}
        standings={standings}
        isLoading={!sessionRecovered}
        onEnterQueue={enterQueue}
        onCreateRoom={createPrivateRoom}
        onJoinRoom={joinPrivateRoom}
        onStartPrivateMatch={startPrivateMatch}
        onLeaveRoom={leavePrivateRoom}
        onRefresh={fetchHistoryAndStandings}
        userId={user?.id || playerRank?.userId || null}
        queueActivity={queueActivity}
        customRoom={customRoom}
      />
    </div>
  );
}

export default function ArenaHubPage() {
  return (
    <React.Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-black font-mono">
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    }>
      <ArenaHubContent />
    </React.Suspense>
  );
}
