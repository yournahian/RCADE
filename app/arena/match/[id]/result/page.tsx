'use client';

import React, { useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useArenaMatch } from '@/hooks/arena/useArenaMatch';
import { MatchResultScreen } from '@/components/arena/MatchResultScreen';
import { Loader2, ShieldCheck, RefreshCw, Cpu, Activity, Info } from 'lucide-react';

export default function ArenaResultPage() {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const matchId = params?.id as string;
  const gameIdParam = searchParams?.get('gameId');
  const gameId = gameIdParam ? parseInt(gameIdParam, 10) : 1;

  const {
    uiState,
    activeMatch,
    playerRank,
    sessionRecovered,
    enterQueue,
    resetState,
    rematchRequest,
    sendRematchRequest,
    acceptRematch,
    declineRematch,
    rematchDeclined,
    clearRematchDeclined,
    rematchError,
    clearRematchError,
    rematchAccepted,
    clearRematchAccepted,
    opponentLeft,
    clearOpponentLeft,
    notifyLeaveLobby,
    startRematchMatch
  } = useArenaMatch(gameId, 'BRONZE', getAccessToken, matchId);

  const isEnteringRematchRef = useRef(false);

  // Monitor requeue transitions
  useEffect(() => {
    if (!ready || !sessionRecovered) return;

    if (!authenticated) {
      router.push(`/arena?gameId=${gameId}`);
      return;
    }

    console.log('[Arena][ResultPage] State:', uiState);

    // If a player clicks requeue and transition happens
    if (uiState === 'QUEUED') {
      router.push(`/arena/queue?gameId=${gameId}`);
    }
  }, [ready, authenticated, sessionRecovered, uiState, router, gameId]);

  // Notify opponent upon window close/refresh in custom matches (exploit & ghost exit protection)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isEnteringRematchRef.current) {
        notifyLeaveLobby();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [notifyLeaveLobby]);

  const handleRequeue = async () => {
    await enterQueue('CASUAL', null, 'global');
    router.push(`/arena/queue?gameId=${gameId}`);
  };

  // Loading phase
  if (!ready || !sessionRecovered) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center min-h-[500px] font-mono text-xs text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-neon-cyan" />
        <span className="uppercase tracking-[0.2em]">SYNCHRONIZING RESULTS PORTAL...</span>
      </div>
    );
  }

  // Visual Telemetry Verification Portal (Refinement 6)
  const isSettleOrVerify = uiState === 'SUBMITTED' || uiState === 'VERIFIED';

  if (isSettleOrVerify) {
    let loadingTitle = 'SCORE UPLOAD';
    let loadingSub = 'Transmitting gameplay telemetry to RCADE mainboard...';
    let percent = '40%';

    if (uiState === 'VERIFIED') {
      loadingTitle = 'TELEMETRY VERIFYING';
      loadingSub = 'Anti-cheat verifier validating HMAC milestone entropy hashes and Glicko adjustments...';
      percent = '85%';
    }

    return (
      <div className="flex-grow bg-[#010101] flex items-center justify-center py-16 px-4 font-mono">
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
        
        <div className="p-8 border border-zinc-900 rounded-2xl bg-zinc-950/60 max-w-md w-full text-center relative shadow-2xl">
          {/* Accent corners */}
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-neon-cyan" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-neon-cyan" />
          <div className="absolute bottom-0 right-0 w-4 h-[1px] bg-neon-cyan" />
          <div className="absolute bottom-0 right-0 w-[1px] h-4 bg-neon-cyan" />

          <RefreshCw className="w-10 h-10 text-neon-cyan mx-auto mb-6 animate-spin" />
          <h2 className="font-heading font-black text-xl text-white uppercase tracking-wider mb-2">
            {loadingTitle}
          </h2>
          <p className="text-zinc-400 text-[10px] uppercase tracking-widest leading-relaxed mb-6 font-semibold">
            {loadingSub}
          </p>

          {/* Secure progress bar */}
          <div className="w-full bg-zinc-900 h-3 p-0.5 rounded border border-zinc-800 overflow-hidden mb-6 relative">
            <div 
              className="bg-neon-cyan h-full rounded transition-all duration-500 relative"
              style={{ width: percent }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0)_100%)]" />
            </div>
          </div>

          <div className="text-[9px] text-zinc-500 uppercase tracking-widest flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
            DO NOT ACCIDENTALLY REFRESH OR DISCONNECT PORTAL
          </div>
        </div>
      </div>
    );
  }

  // Render Completed / Settled Results Screen
  return (
    <div className="flex-grow bg-[#010101] py-8 relative">
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
      
      {/* Rematch Invitation Dialog Overlay */}
      {rematchRequest && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-zinc-950/95 backdrop-blur-md border-2 border-neon-cyan/50 rounded-2xl p-6 shadow-[0_0_40px_rgba(0,240,255,0.35)] font-mono text-center animate-bounce">
          <div className="absolute top-0 left-0 w-6 h-[1px] bg-neon-cyan" />
          <div className="absolute top-0 left-0 w-[1px] h-6 bg-neon-cyan" />
          <div className="absolute bottom-0 right-0 w-6 h-[1px] bg-neon-cyan" />
          <div className="absolute bottom-0 right-0 w-[1px] h-6 bg-neon-cyan" />

          <h4 className="text-neon-cyan font-black text-xs uppercase tracking-[0.25em] mb-2">
            REMATCH CHALLENGE
          </h4>
          <p className="text-zinc-300 text-sm mb-6 uppercase tracking-widest leading-relaxed font-black">
            {rematchRequest.senderUsername.toUpperCase()} WANTS A REMATCH!
          </p>
          
          <div className="flex gap-4 items-center justify-center">
            <button
              onClick={acceptRematch}
              className="py-3 px-8 bg-neon-cyan text-black font-heading font-black text-xs tracking-[0.15em] rounded-lg hover:brightness-110 transition-all uppercase cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)]"
            >
              ACCEPT
            </button>
            <button
              onClick={declineRematch}
              className="py-3 px-6 bg-transparent text-red-500 hover:text-red-400 font-heading font-black text-xs tracking-[0.15em] rounded-lg transition-all uppercase cursor-pointer"
            >
              DECLINE
            </button>
          </div>
        </div>
      )}

      {/* Rematch Declined Notification Overlay */}
      {rematchDeclined && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-zinc-950/95 backdrop-blur-md border-2 border-red-500/50 rounded-2xl p-6 shadow-[0_0_40px_rgba(239,68,68,0.35)] font-mono text-center animate-pulse">
          <div className="absolute top-0 left-0 w-6 h-[1px] bg-red-500" />
          <div className="absolute top-0 left-0 w-[1px] h-6 bg-red-500" />
          <div className="absolute bottom-0 right-0 w-6 h-[1px] bg-red-500" />
          <div className="absolute bottom-0 right-0 w-[1px] h-6 bg-red-500" />

          <h4 className="text-red-500 font-black text-xs uppercase tracking-[0.25em] mb-2">
            REMATCH DECLINED
          </h4>
          <p className="text-zinc-300 text-sm mb-6 uppercase tracking-widest leading-relaxed font-black">
            {rematchDeclined.senderUsername.toUpperCase()} DECLINED THE REMATCH.
          </p>
          
          <div className="flex justify-center">
            <button
              onClick={clearRematchDeclined}
              className="py-2 px-6 bg-red-950/40 border border-red-500/30 text-red-400 hover:text-white hover:bg-red-500/20 font-heading font-black text-xs tracking-[0.15em] rounded-lg transition-all uppercase cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Rematch Error Notification Overlay */}
      {rematchError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-zinc-950/95 backdrop-blur-md border-2 border-red-500/50 rounded-2xl p-6 shadow-[0_0_40px_rgba(239,68,68,0.35)] font-mono text-center">
          <div className="absolute top-0 left-0 w-6 h-[1px] bg-red-500" />
          <div className="absolute top-0 left-0 w-[1px] h-6 bg-red-500" />
          <div className="absolute bottom-0 right-0 w-6 h-[1px] bg-red-500" />
          <div className="absolute bottom-0 right-0 w-[1px] h-6 bg-red-500" />

          <h4 className="text-red-500 font-black text-xs uppercase tracking-[0.25em] mb-2">
            REMATCH FAILED
          </h4>
          <p className="text-zinc-300 text-xs mb-6 uppercase tracking-widest leading-relaxed">
            {rematchError}
          </p>
          
          <div className="flex justify-center">
            <button
              onClick={clearRematchError}
              className="py-2 px-6 bg-red-950/40 border border-red-500/30 text-red-400 hover:text-white hover:bg-red-500/20 font-heading font-black text-xs tracking-[0.15em] rounded-lg transition-all uppercase cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Rematch Accepted Dialog Overlay */}
      {rematchAccepted && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-zinc-950/95 backdrop-blur-md border-2 border-green-500/50 rounded-2xl p-6 shadow-[0_0_40px_rgba(74,222,128,0.35)] font-mono text-center animate-bounce">
          <div className="absolute top-0 left-0 w-6 h-[1px] bg-green-500" />
          <div className="absolute top-0 left-0 w-[1px] h-6 bg-green-500" />
          <div className="absolute bottom-0 right-0 w-6 h-[1px] bg-green-500" />
          <div className="absolute bottom-0 right-0 w-[1px] h-6 bg-green-500" />

          <h4 className="text-green-400 font-black text-xs uppercase tracking-[0.25em] mb-2">
            REMATCH ACCEPTED!
          </h4>
          <p className="text-zinc-300 text-sm mb-6 uppercase tracking-widest leading-relaxed font-black">
            READY FOR CONSECUTIVE COMBAT!
          </p>
          
          <div className="flex gap-4 items-center justify-center">
            <button
              onClick={() => {
                isEnteringRematchRef.current = true;
                startRematchMatch(rematchAccepted.matchId);
              }}
              className="py-3 px-8 bg-green-500 text-black font-heading font-black text-xs tracking-[0.15em] rounded-lg hover:brightness-110 transition-all uppercase cursor-pointer shadow-[0_0_15px_rgba(74,222,128,0.3)] animate-pulse"
            >
              START GAME
            </button>
            <button
              onClick={clearRematchAccepted}
              className="py-3 px-6 bg-transparent text-zinc-500 hover:text-zinc-400 font-heading font-black text-xs tracking-[0.15em] rounded-lg transition-all uppercase cursor-pointer"
            >
              LATER
            </button>
          </div>
        </div>
      )}

      {/* Opponent Left Chamber Notification Overlay */}
      {opponentLeft && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-zinc-950/95 backdrop-blur-md border-2 border-amber-500/50 rounded-2xl p-6 shadow-[0_0_40px_rgba(245,158,11,0.35)] font-mono text-center animate-pulse">
          <div className="absolute top-0 left-0 w-6 h-[1px] bg-amber-500" />
          <div className="absolute top-0 left-0 w-[1px] h-6 bg-amber-500" />
          <div className="absolute bottom-0 right-0 w-6 h-[1px] bg-amber-500" />
          <div className="absolute bottom-0 right-0 w-[1px] h-6 bg-amber-500" />

          <h4 className="text-amber-500 font-black text-xs uppercase tracking-[0.25em] mb-2">
            OPPONENT DEPARTED
          </h4>
          <p className="text-zinc-300 text-sm mb-6 uppercase tracking-widest leading-relaxed font-black">
            {opponentLeft.senderUsername.toUpperCase()} HAS LEFT THE CHAMBER.
          </p>
          
          <div className="flex justify-center">
            <button
              onClick={clearOpponentLeft}
              className="py-2 px-6 bg-amber-950/40 border border-amber-500/30 text-amber-400 hover:text-white hover:bg-amber-500/20 font-heading font-black text-xs tracking-[0.15em] rounded-lg transition-all uppercase cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      <MatchResultScreen
        match={activeMatch}
        rank={playerRank}
        userId={playerRank?.userId ?? user?.id ?? (typeof window !== 'undefined' ? localStorage.getItem('rcade_user_id') : null)}
        onRequeue={handleRequeue}
        onRematch={sendRematchRequest}
        onLeave={() => {
          isEnteringRematchRef.current = true;
          notifyLeaveLobby();
        }}
      />
    </div>
  );
}
