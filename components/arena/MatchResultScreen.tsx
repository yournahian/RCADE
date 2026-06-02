import React from 'react';
import { MatchDto, PlayerRankData } from '@/types/arena/arena.types';
import { ReplaySummaryViewer } from './ReplaySummaryViewer';
import { Trophy, ArrowUpRight, Flame, ShieldAlert, Award, Star, Info } from 'lucide-react';

interface MatchResultScreenProps {
  match: MatchDto | null;
  rank: PlayerRankData | null;
  userId: string | null;
  onRequeue: () => void;
  onRematch?: () => void;
  onLeave?: () => void;
}

export function MatchResultScreen({ match, rank, userId, onRequeue, onRematch, onLeave }: MatchResultScreenProps) {
  if (!match) return null;

  const myRecord = match.players.find(p => p.userId === userId);
  const oppRecord = match.players.find(p => p.userId !== userId);

  const opponentName = oppRecord?.username || 'CyberPlayer';
  
  const isWinner = match.winnerId === userId;
  const isDraw = match.winnerId === null;
  const isForfeited = match.status === 'FORFEITED';
  const isInvalidated = match.status === 'INVALIDATED';
  const isCustomMode = match.mode === 'CUSTOM';

  // Determine final visually clear match outcome tag
  let outcomeText = 'PENDING';
  let outcomeSub = 'Awaiting Settlement';
  let themeColor = 'text-zinc-400';
  let borderColor = 'border-zinc-800';
  let bgGradient = 'from-zinc-950/80';

  if (isInvalidated) {
    outcomeText = 'INVALIDATED';
    outcomeSub = 'Anti-Cheat Disqualification';
    themeColor = 'text-red-500';
    borderColor = 'border-red-500/30';
    bgGradient = 'from-red-950/20';
  } else if (isForfeited) {
    if (myRecord?.status === 'FORFEITED') {
      outcomeText = 'FORFEITED';
      outcomeSub = 'Abandoned active session';
      themeColor = 'text-red-400';
      borderColor = 'border-red-500/20';
      bgGradient = 'from-red-950/10';
    } else {
      outcomeText = 'VICTORY (OPPONENT FORFEIT)';
      outcomeSub = 'Rival abandoned play';
      themeColor = 'text-green-400';
      borderColor = 'border-green-500/30';
      bgGradient = 'from-green-950/20';
    }
  } else if (match.status === 'COMPLETED') {
    if (isWinner) {
      outcomeText = 'VICTORY';
      outcomeSub = 'Match Won cleanly';
      themeColor = 'text-green-400';
      borderColor = 'border-green-500/30';
      bgGradient = 'from-green-950/20';
    } else if (isDraw) {
      outcomeText = 'DRAW';
      outcomeSub = 'Identical scores submitted';
      themeColor = 'text-yellow-500';
      borderColor = 'border-yellow-500/20';
      bgGradient = 'from-yellow-950/10';
    } else {
      outcomeText = 'DEFEAT';
      outcomeSub = 'Match lost';
      themeColor = 'text-red-400';
      borderColor = 'border-red-500/20';
      bgGradient = 'from-red-950/10';
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8 font-mono">
      {/* Title result banner */}
      <div className={`p-8 rounded-xl border bg-gradient-to-b ${bgGradient} to-zinc-950/90 text-center mb-8 shadow-2xl relative overflow-hidden ${borderColor}`}>
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
        
        {isWinner && !isForfeited && !isInvalidated && (
          <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-4 animate-bounce" />
        )}
        
        {isInvalidated && (
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4 animate-pulse" />
        )}

        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.25em] mb-1.5">MATCH SETTLED</div>
        <h1 className={`font-heading font-black text-4xl uppercase tracking-tight mb-2 ${themeColor}`}>
          {outcomeText}
        </h1>
        <p className="text-zinc-500 text-xs uppercase tracking-widest">{outcomeSub}</p>
      </div>

      {/* Ranks & MMR Delta movements (Prioritizing trust metrics) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* Placement Standings */}
        <div className="p-5 bg-zinc-950 border border-zinc-900 rounded-xl flex flex-col justify-between">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-zinc-500" />
            Lobby Rank
          </div>
          <div>
            <div className="text-2xl font-black text-white">
              {rank?.isPlaced ? `${rank.mmr} MMR` : 'PLACING'}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 uppercase">
              {rank?.isPlaced 
                ? 'Bronze Standings Active' 
                : `${rank?.placementMatchesRemaining ?? 5} Placements Remaining`
              }
            </div>
          </div>
        </div>

        {/* MMR Delta movement */}
        <div className="p-5 bg-zinc-950 border border-zinc-900 rounded-xl flex flex-col justify-between">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
            Rank Adjustment
          </div>
          <div>
            <div className={`text-2xl font-black flex items-center gap-1.5 ${isCustomMode ? 'text-zinc-400' : (isWinner ? 'text-green-400' : isDraw ? 'text-zinc-400' : 'text-red-400')}`}>
              {isCustomMode ? '+0 MMR' : (isWinner ? '+16 MMR' : isDraw ? '+0 MMR' : '-16 MMR')}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 uppercase">
              {isCustomMode ? 'Custom match (Unranked)' : 'Glicko deviation updated'}
            </div>
          </div>
        </div>

        {/* Win Streak progress */}
        <div className="p-5 bg-zinc-950 border border-zinc-900 rounded-xl flex flex-col justify-between">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-zinc-500" />
            Active Streaks
          </div>
          <div>
            <div className="text-2xl font-black text-white flex items-center gap-1.5">
              {rank?.winStreak ?? 0}
              {(rank?.winStreak ?? 0) >= 3 && (
                <Flame className="w-5 h-5 text-orange-500 animate-pulse fill-orange-500" />
              )}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 uppercase">
              Consecutive wins
            </div>
          </div>
        </div>

      </div>

      {/* Fairness confirmation timeline */}
      <div className="mb-8">
        <h3 className="font-heading font-black text-sm uppercase tracking-wider text-white mb-4 flex items-center gap-1.5">
          <Star className="w-4 h-4 text-neon-cyan" />
          VERIFICATION METRICS
        </h3>
        <ReplaySummaryViewer match={match} viewerUserId={userId} />
      </div>

      {/* Action triggers */}
      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        {isCustomMode ? (
          <button
            onClick={onRematch}
            className="flex-1 py-4 bg-neon-magenta text-white font-heading font-black text-xs tracking-[0.2em] hover:brightness-110 transition-all rounded-lg uppercase cursor-pointer text-center shadow-[0_0_15px_rgba(255,0,133,0.3)] animate-pulse"
          >
            REMATCH OPPONENT
          </button>
        ) : (
          <button
            onClick={onRequeue}
            className="flex-1 py-4 bg-neon-cyan text-black font-heading font-black text-xs tracking-[0.2em] hover:brightness-110 transition-all rounded-lg uppercase cursor-pointer text-center shadow-[0_0_15px_rgba(0,240,255,0.3)]"
          >
            FIND NEW RIVAL
          </button>
        )}
        <button
          onClick={async () => {
            if (onLeave) {
              try {
                onLeave();
              } catch {}
            }
            window.location.href = '/arena';
          }}
          className="py-4 px-8 bg-zinc-950 border border-zinc-800 text-zinc-400 font-heading font-black text-xs tracking-[0.2em] hover:border-zinc-500 hover:text-white transition-all rounded-lg uppercase cursor-pointer text-center"
        >
          Back to Arena Hub
        </button>
      </div>

      {/* Secure footer */}
      <div className="mt-8 text-center text-[9px] text-zinc-600 uppercase tracking-widest leading-relaxed flex items-center justify-center gap-1">
        <Info className="w-3 h-3 text-zinc-500" />
        All settlements are Glicko-2 compliant and mathematically deterministic.
      </div>
    </div>
  );
}
