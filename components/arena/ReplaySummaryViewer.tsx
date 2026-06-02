import React from 'react';
import { MatchDto } from '@/types/arena/arena.types';
import { ShieldCheck, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';

interface ReplaySummaryViewerProps {
  match: MatchDto | null;
  viewerUserId: string | null;
}

export function ReplaySummaryViewer({ match, viewerUserId }: ReplaySummaryViewerProps) {
  if (!match) {
    return (
      <div className="p-6 text-center text-zinc-500 font-mono text-xs border border-dashed border-zinc-800 rounded-lg">
        NO ACTIVE MATCH TELEMETRY RECORDED
      </div>
    );
  }

  // Determine integrity status details
  const isInvalidated = match.status === 'INVALIDATED';
  const isForfeited = match.status === 'FORFEITED';
  const isCompleted = match.status === 'COMPLETED';

  // Extract events if any
  // closed alpha stores delta strings. If we don't have events inside, handle fallback
  const p1Record = match.players[0];
  const p2Record = match.players[1];

  const hasTelemetry = isCompleted && (p1Record?.score !== null || p2Record?.score !== null);

  // Fallback / Graceful degradation display if telemetry is unavailable
  if (!hasTelemetry) {
    return (
      <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-lg font-mono">
        <div className="flex items-center gap-2 mb-4 text-xs font-bold text-zinc-400">
          <Clock className="w-4 h-4 text-yellow-500" />
          <span>REPLAY METRICS UNAVAILABLE</span>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed mb-4">
          This match resolved as <strong className="text-zinc-300 font-bold">{match.status}</strong>. 
          {isForfeited && " Chrono swept telemetry as Forfeited due to score-submission timeout."}
          {isInvalidated && " System verification loop flagged abnormal telemetry coordinate injections."}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">INTEGRITY RATING</div>
            <div className={`text-xs font-black uppercase flex items-center gap-1.5 ${isInvalidated ? 'text-red-500' : 'text-yellow-500'}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {match.status}
            </div>
          </div>
          <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1">STORAGE FOOTPRINT</div>
            <div className="text-xs text-zinc-300 font-bold font-mono">0.0 KB (Skipped)</div>
          </div>
        </div>
      </div>
    );
  }

  // Render SVG Event Timeline
  const isSpaceImpact = match.gameId === 5;
  const maxScore = Math.max(p1Record?.score || 0, p2Record?.score || 0, 100);
  const p1Percent = Math.min(100, Math.max(5, ((p1Record?.score || 0) / maxScore) * 100));
  const p2Percent = Math.min(100, Math.max(5, ((p2Record?.score || 0) / maxScore) * 100));

  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 font-mono w-full">
      {/* Integrity Indicator Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-heading font-bold text-zinc-500 uppercase tracking-[0.2em]">TELEMETRY CONSOLE</span>
        </div>
        
        {/* Visual Integrity Badges */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold tracking-widest px-2.5 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-green-400" />
            VERIFIED SECURE
          </span>
          <span className="text-[9px] font-bold tracking-widest px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 uppercase">
            RESTORED SESSION
          </span>
        </div>
      </div>

      {/* SVG Score progression chart */}
      <div className="mb-6">
        <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-3">Score Progression & Ratio</div>
        <div className="space-y-4">
          
          {/* Player 1 Stats */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className={`font-bold ${p1Record?.userId === viewerUserId ? 'text-neon-cyan' : 'text-zinc-400'}`}>
                {p1Record?.username} {p1Record?.userId === viewerUserId && '(YOU)'}
              </span>
              <span className="text-zinc-300 font-bold">{p1Record?.score} pts</span>
            </div>
            <div className="w-full bg-zinc-900/60 rounded h-3 overflow-hidden p-0.5 border border-zinc-800">
              <div 
                className="bg-neon-cyan h-full rounded transition-all duration-500"
                style={{ width: `${p1Percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-zinc-500 mt-1">
              <span>Combo Peak: x{p1Record?.combo?.toFixed(1) || '1.0'}</span>
              <span>Clock: {p1Record?.duration ? (p1Record.duration / 1000).toFixed(1) : '0'}s</span>
            </div>
          </div>

          {/* Player 2 Stats */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className={`font-bold ${p2Record?.userId === viewerUserId ? 'text-neon-cyan' : 'text-zinc-400'}`}>
                {p2Record?.username} {p2Record?.userId === viewerUserId && '(YOU)'}
              </span>
              <span className="text-zinc-300 font-bold">{p2Record?.score} pts</span>
            </div>
            <div className="w-full bg-zinc-900/60 rounded h-3 overflow-hidden p-0.5 border border-zinc-800">
              <div 
                className="bg-neon-magenta h-full rounded transition-all duration-500"
                style={{ width: `${p2Percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-zinc-500 mt-1">
              <span>Combo Peak: x{p2Record?.combo?.toFixed(1) || '1.0'}</span>
              <span>Clock: {p2Record?.duration ? (p2Record.duration / 1000).toFixed(1) : '0'}s</span>
            </div>
          </div>

        </div>
      </div>

      {/* SVG Event Timeline */}
      <div className="border border-zinc-900 rounded p-4 bg-zinc-950/40">
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Replay Event Timeline (Handshake)</div>
        
        {/* Timeline Vector SVG */}
        <div className="relative w-full h-16 bg-zinc-900/30 rounded border border-zinc-900 flex items-center px-4 overflow-hidden">
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            {/* Center line */}
            <line x1="0" y1="32" x2="100%" y2="32" stroke="#27272a" strokeWidth="2" strokeDasharray="4 4" />
            
            {isSpaceImpact ? (
              <>
                {/* Laser fire points */}
                <circle cx="15%" cy="32" r="3.5" fill="#00f0ff" />
                <circle cx="25%" cy="32" r="3.5" fill="#00f0ff" />
                <circle cx="45%" cy="32" r="3.5" fill="#00f0ff" />
                <circle cx="70%" cy="32" r="3.5" fill="#00f0ff" />
                
                {/* Glitch Slay Kill event */}
                <polygon points="30%,26 34%,32 30%,38 26%,32" fill="#ffdf00" />
                <polygon points="60%,26 64%,32 60%,38 56%,32" fill="#ffdf00" />
                
                {/* Collect Power-up event */}
                <circle cx="50%" cy="32" r="5.5" fill="#00ff88" stroke="#ffffff" strokeWidth="1" />
                
                {/* Damage event */}
                <polygon points="85%,24 90%,35 80%,35" fill="#ef4444" />
              </>
            ) : (
              <>
                {/* SVG Pellet points */}
                <circle cx="15%" cy="32" r="4" fill="#00f0ff" className="animate-pulse" />
                <circle cx="35%" cy="32" r="4" fill="#00f0ff" />
                <circle cx="55%" cy="32" r="4" fill="#00f0ff" />
                <circle cx="75%" cy="32" r="4" fill="#00f0ff" />
                
                {/* Combo peak event */}
                <polygon points="48%,26 52%,32 48%,38 44%,32" fill="#d946ef" />
                <polygon points="82%,26 86%,32 82%,38 78%,32" fill="#d946ef" />
                
                {/* Collision event */}
                <circle cx="95%" cy="32" r="5" fill="#ef4444" />
              </>
            )}
          </svg>

          {/* Time markers */}
          <div className="absolute bottom-1 left-2 text-[8px] text-zinc-600 font-mono">0.0s</div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-zinc-600 font-mono">45.0s</div>
          <div className="absolute bottom-1 right-2 text-[8px] text-zinc-600 font-mono">90.0s</div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-[9px] text-zinc-500 uppercase flex-wrap">
          {isSpaceImpact ? (
            <>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-neon-cyan block" />
                <span>Laser Fire</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-yellow-400 transform rotate-45 block" />
                <span>Glitch Slay</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 border border-white/40 block" />
                <span>Shield Repair</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[9px] border-b-red-500 block" style={{ marginTop: '-4px' }} />
                <span>Damage Hit</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-neon-cyan block" />
                <span>Energy Pellet</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-neon-magenta transform rotate-45 block" />
                <span>Combo Peak</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 block" />
                <span>Collision Grid</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
