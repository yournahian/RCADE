'use client';

import React, { useState } from 'react';
import { PlayerRankData, UserDuelHistoryItem, LeaderboardRankItem } from '@/types/arena/arena.types';
import { Trophy, Flame, Play, Sword, Shield, Award, Zap, RefreshCw, BarChart2, Users, Lock, Compass, Plus, LogIn, Gamepad2 } from 'lucide-react';

interface BronzeArenaPanelProps {
  rank: PlayerRankData | null;
  history: UserDuelHistoryItem[];
  standings: LeaderboardRankItem[];
  isLoading: boolean;
  onEnterQueue: (mode: 'CASUAL' | 'RANKED' | 'WAGER', wagerAmount: string | null, region: string) => void;
  onCreateRoom: (wagerAmount: string | null) => void;
  onJoinRoom: (roomCode: string) => void;
  onRefresh: () => void;
  userId: string | null;
  queueActivity: { activeQueuers: number; activeMatches: number };
  customRoom: any;
  onStartPrivateMatch: () => void;
  onLeaveRoom: (roomCode: string) => void;
}

export function BronzeArenaPanel({
  rank,
  history,
  standings,
  isLoading,
  onEnterQueue,
  onCreateRoom,
  onJoinRoom,
  onRefresh,
  userId,
  queueActivity,
  customRoom,
  onStartPrivateMatch,
  onLeaveRoom
}: BronzeArenaPanelProps) {
  const [selectedMode, setSelectedMode] = useState<'CASUAL' | 'RANKED' | 'WAGER' | 'CUSTOM'>('CASUAL');
  const [wagerStakes, setWagerStakes] = useState<string>('50');
  const [joinCode, setJoinCode] = useState<string>('');
  const [region, setRegion] = useState<string>('us-east');

  const trophies = rank?.trophies ?? 100;
  const peakTrophies = rank?.peakTrophies ?? 100;
  const streak = rank?.winStreak ?? 0;
  const matchesPlayed = rank?.matchesPlayed ?? 0;
  const matchesWon = rank?.matchesWon ?? 0;
  const winRate = matchesPlayed > 0 ? ((matchesWon / matchesPlayed) * 100).toFixed(0) : '0';

  // Translate trophies to clean Arcade Ladder Tier names
  const getTrophyTier = (t: number) => {
    if (t < 300) return 'BRONZE CADET';
    if (t < 800) return 'SILVER GLIDER';
    if (t < 1500) return 'GOLD STAR';
    return 'GRANDMASTER';
  };

  // Determine Queue Activity Label (Low/Medium/High)
  const getQueueIndicator = (active: number) => {
    if (active === 0) return { label: 'LOW ACTIVITY', color: 'text-zinc-600 border-zinc-900 bg-zinc-950/20' };
    if (active < 3) return { label: 'MEDIUM ACTIVITY', color: 'text-yellow-400 border-yellow-400/20 bg-yellow-400/5' };
    return { label: 'HIGH TRAFFIC', color: 'text-green-400 border-green-400/20 bg-green-400/5' };
  };

  const activity = getQueueIndicator(queueActivity.activeQueuers);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 font-mono text-zinc-300 relative">
      {/* CRT SCANLINE OVERLAY */}
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />

      {/* Top Banner header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 pb-6 border-b border-zinc-900 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sword className="w-5 h-5 text-neon-cyan animate-pulse" />
            <span className="text-xs font-bold tracking-[0.3em] text-neon-cyan uppercase">Competitive Arena V1</span>
          </div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl text-white uppercase tracking-tight">
            COMPETITIVE MATRIX
          </h1>
          <p className="text-zinc-500 text-xs mt-1 uppercase tracking-wider">
            Purely skill-based competitive arena. Server-authoritative anti-fraud verification engine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.href = '/arena'}
            className="px-4 py-2.5 bg-zinc-950 border border-zinc-900 rounded-lg hover:border-zinc-700 hover:text-white text-xs tracking-wider uppercase font-bold cursor-pointer transition-all flex items-center gap-2"
          >
            <Gamepad2 className="w-4 h-4 text-neon-cyan" />
            Change Game
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-3 bg-zinc-950 border border-zinc-900 rounded-lg hover:border-zinc-700 hover:text-white transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
            title="Sync State"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-neon-cyan' : 'text-zinc-400'}`} />
          </button>
        </div>
      </div>

      {/* Main Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 relative z-10">
        <div className="p-5 bg-zinc-950/60 border border-zinc-900 rounded-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-2.5 h-[1px] bg-neon-cyan" />
          <div className="absolute top-0 left-0 w-[1px] h-2.5 bg-neon-cyan" />
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-neon-cyan" />
            Arena Trophies
          </div>
          <div>
            <div className="text-3xl font-black text-white">{trophies} 🏆</div>
            <div className="text-[9px] text-zinc-400 mt-1 uppercase font-bold">
              {getTrophyTier(trophies)} (Peak: {peakTrophies})
            </div>
          </div>
        </div>

        <div className="p-5 bg-zinc-950/60 border border-zinc-900 rounded-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-2.5 h-[1px] bg-neon-magenta" />
          <div className="absolute top-0 left-0 w-[1px] h-2.5 bg-neon-magenta" />
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-neon-magenta" />
            Win Streak
          </div>
          <div>
            <div className="text-3xl font-black text-white flex items-center gap-2">
              {streak}
              {streak >= 3 && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/30 text-orange-400 animate-pulse font-bold">
                  STREAKING
                </span>
              )}
            </div>
            <div className="text-[9px] text-zinc-400 mt-1 uppercase font-bold">
              Consecutive wins
            </div>
          </div>
        </div>

        <div className="p-5 bg-zinc-950/60 border border-zinc-900 rounded-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-2.5 h-[1px] bg-zinc-700" />
          <div className="absolute top-0 left-0 w-[1px] h-2.5 bg-zinc-700" />
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-zinc-500" />
            Arcade Winrate
          </div>
          <div>
            <div className="text-3xl font-black text-white">{winRate}%</div>
            <div className="text-[9px] text-zinc-400 mt-1 uppercase font-bold">
              {matchesWon} Wins / {matchesPlayed - matchesWon} Losses
            </div>
          </div>
        </div>

        <div className="p-5 bg-zinc-950/60 border border-zinc-900 rounded-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-2.5 h-[1px] bg-zinc-700" />
          <div className="absolute top-0 left-0 w-[1px] h-2.5 bg-zinc-700" />
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            Lobby Activity
          </div>
          <div>
            <div className="text-lg font-black text-white uppercase">{activity.label}</div>
            <div className="text-[9px] text-zinc-400 mt-1.5 uppercase font-bold flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full bg-neon-cyan animate-ping`} />
              {queueActivity.activeMatches} Matches Running Live
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selection and Queue Control Panel */}
      <div className="p-6 border border-zinc-900 rounded-2xl bg-zinc-950/40 backdrop-blur-md mb-10 relative z-10">
        <h2 className="text-white font-heading font-black text-sm tracking-wider uppercase mb-6 flex items-center gap-2">
          <Zap className="w-4 h-4 text-neon-cyan" />
          Choose Matchmaking Mode
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Casual */}
          <button
            onClick={() => setSelectedMode('CASUAL')}
            className={`p-5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[140px] ${
              selectedMode === 'CASUAL'
                ? 'border-neon-cyan bg-neon-cyan/5 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                : 'border-zinc-900 bg-zinc-950/30 hover:border-zinc-800'
            }`}
          >
            <div>
              <div className="text-white font-heading font-black text-xs uppercase tracking-wider mb-1">Casual Arena</div>
              <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                Fast queues. No stakes. No trophies lost. Earns regular game XP.
              </p>
            </div>
            <span className="text-[9px] font-black uppercase text-neon-cyan font-bold">Ready</span>
          </button>

          {/* Card 2: Ranked */}
          <button
            onClick={() => setSelectedMode('RANKED')}
            className={`p-5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[140px] ${
              selectedMode === 'RANKED'
                ? 'border-orange-500 bg-orange-500/5 shadow-[0_0_15px_rgba(249,115,22,0.15)]'
                : 'border-zinc-900 bg-zinc-950/30 hover:border-zinc-800'
            }`}
          >
            <div>
              <div className="text-white font-heading font-black text-xs uppercase tracking-wider mb-1">Ranked Arena</div>
              <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                Flat trophy gain/loss (+20 / -15). Streak bonuses. Seasonal ladder resets.
              </p>
            </div>
            <span className="text-[9px] font-black uppercase text-orange-400 font-bold">Competitive</span>
          </button>

          {/* Card 3: Wager */}
          <button
            onClick={() => setSelectedMode('WAGER')}
            className={`p-5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[140px] ${
              selectedMode === 'WAGER'
                ? 'border-neon-magenta bg-neon-magenta/5 shadow-[0_0_15px_rgba(255,0,230,0.15)]'
                : 'border-zinc-900 bg-zinc-950/30 hover:border-zinc-800'
            }`}
          >
            <div>
              <div className="text-white font-heading font-black text-xs uppercase tracking-wider mb-1">Wager Arena</div>
              <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                Locked Escrow deposit. 5% platform fee. Server-verified payout. Smart contract ready.
              </p>
            </div>
            <span className="text-[9px] font-black uppercase text-neon-magenta font-bold">Staked</span>
          </button>

          {/* Card 4: Custom Room */}
          <button
            onClick={() => setSelectedMode('CUSTOM')}
            className={`p-5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[140px] ${
              selectedMode === 'CUSTOM'
                ? 'border-yellow-400 bg-yellow-400/5 shadow-[0_0_15px_rgba(250,204,21,0.15)]'
                : 'border-zinc-900 bg-zinc-950/30 hover:border-zinc-800'
            }`}
          >
            <div>
              <div className="text-white font-heading font-black text-xs uppercase tracking-wider mb-1">Custom Room</div>
              <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                Private codes. Invite friends. Higher platform fee (10%). No trophies adjusted.
              </p>
            </div>
            <span className="text-[9px] font-black uppercase text-yellow-500 font-bold">Private Lobbies</span>
          </button>
        </div>

        {/* Dynamic Mode Controller Action Area */}
        <div className="p-5 border border-zinc-900/60 rounded-xl bg-zinc-950/40">
          {selectedMode === 'CASUAL' && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="text-white text-xs font-bold uppercase tracking-wider">CASUAL MATCHING SEARCH</h3>
                <p className="text-zinc-500 text-[10px] mt-1 uppercase">NO COIN COST. PERFECT FOR WARMUPS AND GENERAL SKILLS DRILLS.</p>
              </div>
              <button
                onClick={() => onEnterQueue('CASUAL', null, region)}
                className="w-full sm:w-auto px-8 py-3.5 bg-neon-cyan text-black font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)] uppercase flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                FIND CASUAL MATCH
              </button>
            </div>
          )}

          {selectedMode === 'RANKED' && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="text-white text-xs font-bold uppercase tracking-wider">RANKED ARCADE DUELS</h3>
                <p className="text-zinc-500 text-[10px] mt-1 uppercase">CLIMB THE ARCADE LADDER. LOSE OR WIN FLAT TROPHY VALUE POINTS.</p>
              </div>
              <button
                onClick={() => onEnterQueue('RANKED', null, region)}
                className="w-full sm:w-auto px-8 py-3.5 bg-orange-500 text-white font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(249,115,22,0.3)] uppercase flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                FIND RANKED MATCH
              </button>
            </div>
          )}

          {selectedMode === 'WAGER' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-white text-xs font-bold uppercase tracking-wider">WAGER ESCROW DEPOSIT</h3>
                  <p className="text-zinc-500 text-[10px] mt-1 uppercase">PRIZE POOL AWARDED SERVER-AUTHORITATIVELY MINUS 5% PLATFORM FEE.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {['10', '50', '100', '250'].map(stake => (
                    <button
                      key={stake}
                      onClick={() => setWagerStakes(stake)}
                      className={`px-4 py-2 border rounded text-xs cursor-pointer transition-all ${
                        wagerStakes === stake
                          ? 'border-neon-magenta text-neon-magenta bg-neon-magenta/5 font-black'
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'
                      }`}
                    >
                      {stake} RCADE
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => onEnterQueue('WAGER', wagerStakes, region)}
                  className="w-full sm:w-auto px-8 py-3.5 bg-neon-magenta text-black font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(255,0,230,0.3)] uppercase flex items-center justify-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" />
                  INITIATE SECURE WAGER
                </button>
              </div>
            </div>
          )}

          {selectedMode === 'CUSTOM' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Panel 1: Create Room */}
                <div className="p-5 border border-zinc-900 rounded-xl bg-zinc-950/20 flex flex-col justify-between min-h-[160px]">
                  <div>
                    <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-yellow-500" />
                      Create Custom Lobby
                    </h4>
                    <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                      Deploy a custom room code. Stake optional private balance (10% platform fee applies).
                    </p>
                  </div>
                  
                  {customRoom ? (
                    <div className="mt-4 p-3 bg-zinc-950 border border-yellow-400/20 text-yellow-400 rounded-lg flex justify-between items-center flex-wrap gap-3">
                      <div>
                        <div className="text-[8px] text-zinc-500 uppercase">Room Code</div>
                        <div className="text-lg font-black tracking-widest">{customRoom.roomCode}</div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {customRoom.status === 'READY' ? (
                          customRoom.creatorId === userId ? (
                            <button
                              onClick={onStartPrivateMatch}
                              className="px-4 py-2 bg-yellow-500 text-black font-heading font-black text-[10px] tracking-widest rounded hover:brightness-115 transition-all cursor-pointer"
                            >
                              START MATCH
                            </button>
                          ) : (
                            <span className="text-[9px] uppercase tracking-wider animate-pulse text-zinc-400 font-bold">
                              Lobby ready. Waiting for host...
                            </span>
                          )
                        ) : (
                          <span className="text-[9px] uppercase tracking-wider animate-pulse text-zinc-500 font-bold">
                            Waiting for guest...
                          </span>
                        )}
                        
                        <button
                          onClick={() => onLeaveRoom(customRoom.roomCode)}
                          className="px-3 py-2 border border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-500/10 font-heading font-black text-[10px] tracking-widest rounded transition-all cursor-pointer uppercase"
                        >
                          {customRoom.creatorId === userId ? 'CANCEL' : 'LEAVE'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onCreateRoom(wagerStakes)}
                      className="mt-4 w-full py-3 bg-yellow-500 text-black font-heading font-black text-xs tracking-[0.2em] rounded-lg hover:brightness-110 transition-all uppercase"
                    >
                      CREATE ROOM CODE
                    </button>
                  )}
                </div>

                {/* Panel 2: Join Room */}
                <div className="p-5 border border-zinc-900 rounded-xl bg-zinc-950/20 flex flex-col justify-between min-h-[160px]">
                  <div>
                    <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <LogIn className="w-4 h-4 text-neon-cyan" />
                      Join Existing Room
                    </h4>
                    <p className="text-zinc-500 text-[10px] uppercase leading-relaxed font-bold">
                      Enter a 6-letter room code shared by your friend to join their custom arcade lobby instantly.
                    </p>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ENTER CODE"
                      className="flex-grow px-4 py-2 text-center bg-zinc-950 border border-zinc-800 text-white font-heading font-black text-xs tracking-widest rounded-lg focus:outline-none focus:border-neon-cyan"
                    />
                    <button
                      onClick={() => onJoinRoom(joinCode)}
                      className="px-6 bg-neon-cyan text-black font-heading font-black text-xs tracking-[0.1em] rounded-lg hover:brightness-110 transition-all"
                    >
                      JOIN
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Two-Column split for Duel History & Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 relative z-10">
        {/* Left Column: Duel History (3/5 width) */}
        <div className="lg:col-span-3">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-900">
            <Sword className="w-4 h-4 text-neon-cyan" />
            <h2 className="font-heading font-black text-sm text-white uppercase tracking-wider">
              RECENT DUEL HISTORY
            </h2>
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-900 rounded-lg bg-zinc-950/20">
              NO RECENT DUEL RECORD FOUND IN BRONZE ARCHIVES
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-zinc-500 uppercase tracking-widest border-b border-zinc-900">
                    <th className="py-3 font-medium">Opponent</th>
                    <th className="py-3 font-medium">Result</th>
                    <th className="py-3 font-medium text-right">Score Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/40">
                  {history.map((item, idx) => {
                    const isWin = item.outcome === 'VICTORY';
                    const isLoss = item.outcome === 'DEFEAT';
                    const isDraw = item.outcome === 'DRAW';
                    const isCancel = item.outcome === 'CANCELLED';

                    let outcomeText: string = item.outcome;
                    let outcomeColor = 'text-zinc-400';

                    if (isWin) {
                      outcomeColor = 'text-green-400 font-bold';
                    } else if (isLoss) {
                      outcomeColor = 'text-red-400';
                    } else if (isDraw) {
                      outcomeColor = 'text-yellow-500';
                    } else if (isCancel) {
                      outcomeColor = 'text-zinc-500';
                      outcomeText = 'CANCELLED';
                    }

                    return (
                      <tr key={`${item.matchId}-${idx}`} className="hover:bg-zinc-900/10">
                        <td className="py-3 font-bold text-zinc-300">
                          {item.opponent}
                        </td>
                        <td className={`py-3 uppercase tracking-wider font-semibold ${outcomeColor}`}>
                          {outcomeText}
                        </td>
                        <td className="py-3 text-right font-semibold text-zinc-400">
                          {item.myScore} <span className="text-zinc-600 text-[10px]">vs</span> {item.oppScore}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Leaderboard Standings (2/5 width) */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-900">
            <Award className="w-4 h-4 text-neon-magenta" />
            <h2 className="font-heading font-black text-sm text-white uppercase tracking-wider">
              TOP SKILL STANDINGS
            </h2>
          </div>

          {standings.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-900 rounded-lg bg-zinc-950/20">
              SYNCING STANDINGS LEDGERS...
            </div>
          ) : (
            <div className="space-y-3">
              {standings.slice(0, 10).map((player, idx) => {
                return (
                  <div
                    key={`${player.username}-${idx}`}
                    className="p-3 rounded-lg flex items-center justify-between border bg-zinc-950/40 border-zinc-900"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-black text-center w-5 h-5 rounded-full flex items-center justify-center ${
                        idx === 0 
                          ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' 
                          : idx === 1 
                            ? 'bg-zinc-300/20 text-zinc-300 border border-zinc-300/30' 
                            : idx === 2 
                              ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30' 
                              : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                      }`}>
                        {player.rank}
                      </span>
                      <span className="font-bold text-zinc-200">
                        {player.username}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-white text-xs">{player.trophies} Trophies</div>
                      <div className="text-[9px] text-zinc-500 font-bold uppercase">{player.winRate} Winrate</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
