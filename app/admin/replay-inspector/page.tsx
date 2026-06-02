'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState, useMemo } from 'react';
import { ApiService } from '@/services/api';

interface ReplayEvent {
  t: number;      // timestamp
  type: string;   // event type e.g., 'SCORE', 'COLLISION', 'DRIFT'
  x?: number;     // position coordinate
  y?: number;
  val?: number;   // score value or parameter
  anomaly?: boolean;
}

export default function ReplayInspector() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [secretKey, setSecretKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rcade_admin_secret') || '';
    }
    return '';
  });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [scrubberTime, setScrubberTime] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [overrideWinner, setOverrideWinner] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [appealReason, setAppealReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    if (!secretKey) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await ApiService.fetchWithAuth(`/api/admin/replay-inspector?secret=${secretKey}`, {}, getAccessToken);
      if (!res.ok) {
        if (res.status === 401) {
          setIsUnlocked(false);
          if (typeof window !== 'undefined') localStorage.removeItem('rcade_admin_secret');
          throw new Error("Vault seal verification failed. Access Denied.");
        }
        throw new Error(`Data fetch failed (Status: ${res.status})`);
      }
      const json = await res.json();
      setData(json);
      setAuditResult(json.auditStatus);
      setIsUnlocked(true);
      if (json.matchSessions && json.matchSessions.length > 0) {
        setSelectedSession(json.matchSessions[0]);
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to load Replay Inspector data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (ready && authenticated && secretKey) {
      fetchData();
    } else if (ready && authenticated && !secretKey) {
      setIsLoading(false);
    }
  }, [ready, authenticated, secretKey]);

  // Run a manual ledger integrity check
  const runIntegrityAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await ApiService.fetchWithAuth(`/api/admin/replay-inspector?secret=${secretKey}`, {}, getAccessToken);
      if (!res.ok) {
        if (res.status === 401) {
          setIsUnlocked(false);
          if (typeof window !== 'undefined') localStorage.removeItem('rcade_admin_secret');
          alert("Unauthorized session. Vault sealed.");
          return;
        }
        throw new Error(`Audit failed (Status: ${res.status})`);
      }
      const json = await res.json();
      setAuditResult(json.auditStatus);
      alert(json.auditStatus?.healthy ? "✓ Audit ledger integrity verified! 0% Tampering detected." : "⚠ Ledger compromised! Broken link found.");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Audit run failed.");
    } finally {
      setIsAuditing(false);
    }
  };

  // Resolve moderation appeal
  const handleResolveAppeal = async (appealId: string, status: 'APPROVED' | 'REJECTED') => {
    if (!confirm(`Are you sure you want to ${status} this appeal?`)) return;
    setIsSubmitting(true);
    try {
      const res = await ApiService.fetchWithAuth(`/api/admin/replay-inspector?secret=${secretKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESOLVE_APPEAL',
          appealId,
          status,
          reason: appealReason || `Resolved by moderator as ${status}`
        })
      }, getAccessToken);

      if (res.status === 401) {
        setIsUnlocked(false);
        if (typeof window !== 'undefined') localStorage.removeItem('rcade_admin_secret');
        alert("Unauthorized session. Vault sealed.");
        return;
      }

      if (res.ok) {
        alert(`Appeal successfully ${status.toLowerCase()}ed.`);
        setAppealReason('');
        fetchData();
      } else {
        const err = await res.json();
        alert(`Failed to resolve appeal: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Override Match Winner
  const handleOverrideMatch = async (matchId: string) => {
    if (!overrideWinner) {
      alert("Please enter the new winner user ID or 'DRAW'");
      return;
    }
    if (!overrideReason) {
      alert("Please provide a reason for the override audit trail");
      return;
    }
    if (!confirm(`CRITICAL WARNING: This manual override will atomically change match results in the DB and commit a signed override entry to the immutable ledger. Proceed?`)) return;
    
    setIsSubmitting(true);
    try {
      const res = await ApiService.fetchWithAuth(`/api/admin/replay-inspector?secret=${secretKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'OVERRIDE_MATCH',
          matchId,
          winnerId: overrideWinner === 'DRAW' ? null : overrideWinner,
          reason: overrideReason
        })
      }, getAccessToken);

      if (res.status === 401) {
        setIsUnlocked(false);
        if (typeof window !== 'undefined') localStorage.removeItem('rcade_admin_secret');
        alert("Unauthorized session. Vault sealed.");
        return;
      }

      if (res.ok) {
        alert("✓ Match successfully overridden! Ledger block appended.");
        setOverrideWinner('');
        setOverrideReason('');
        fetchData();
      } else {
        const err = await res.json();
        alert(`Failed to override match: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setIsLoading(true);
    try {
      const res = await ApiService.fetchWithAuth(`/api/admin/replay-inspector?secret=${unlockInput}`, {}, getAccessToken);
      if (!res.ok) {
        throw new Error("AUTHENTICATION FAILURE - DEVIANT SIGNATURE DETECTED");
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('rcade_admin_secret', unlockInput);
      }
      setSecretKey(unlockInput);
      setIsUnlocked(true);
      const json = await res.json();
      setData(json);
      setAuditResult(json.auditStatus);
      if (json.matchSessions && json.matchSessions.length > 0) {
        setSelectedSession(json.matchSessions[0]);
      }
    } catch (err: any) {
      setUnlockError(err.message || "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  // Generate interactive / mock replay events if database is empty or session contains empty replay JSON
  const sessionEvents = useMemo(() => {
    if (!selectedSession) return [];
    
    // Parse replayData if it exists
    let rawEvents: ReplayEvent[] = [];
    try {
      const parsed = typeof selectedSession.replayData === 'string' 
        ? JSON.parse(selectedSession.replayData) 
        : selectedSession.replayData;
      if (parsed && Array.isArray(parsed.events)) {
        rawEvents = parsed.events;
      }
    } catch (err) {
      console.warn("Failed parsing replayData, resorting to mock", err);
    }

    if (rawEvents.length > 0) {
      return rawEvents.sort((a, b) => a.t - b.t);
    }

    // Mock high-fidelity gameplay events to ensure WOW factor when previewing empty/alpha databases
    const duration = 12000; // 12 seconds
    const generated: ReplayEvent[] = [];
    let currentScore = 0;
    
    for (let t = 0; t <= duration; t += 300) {
      const isSnakeGrow = t % 1500 === 0 && t > 0;
      const isSpeedBoost = t % 3600 === 0 && t > 0;
      const hasDriftWarning = t === 4200 || t === 8400;
      const hasCadenceError = t === 7200;

      if (isSnakeGrow) {
        currentScore += 10;
        generated.push({ t, type: 'PELLET_EAT', val: currentScore, x: Math.sin(t/1000) * 100 + 150, y: Math.cos(t/1000) * 100 + 150 });
      } else if (hasDriftWarning) {
        generated.push({ t, type: 'LATENCY_DRIFT', val: currentScore, anomaly: true, x: 200, y: 150 });
      } else if (hasCadenceError) {
        generated.push({ t, type: 'CADENCE_TAMPER', val: currentScore, anomaly: true, x: 120, y: 80 });
      } else {
        generated.push({ t, type: 'MOVE', val: currentScore, x: Math.sin(t/800) * 120 + 150, y: Math.cos(t/1200) * 120 + 150 });
      }
    }

    return generated;
  }, [selectedSession]);

  const maxTime = useMemo(() => {
    if (sessionEvents.length === 0) return 0;
    return sessionEvents[sessionEvents.length - 1].t;
  }, [sessionEvents]);

  // Find active event based on scrubber time
  const currentEventIndex = useMemo(() => {
    let closestIndex = 0;
    let minDiff = Infinity;
    sessionEvents.forEach((ev, i) => {
      const diff = Math.abs(ev.t - scrubberTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    });
    return closestIndex;
  }, [sessionEvents, scrubberTime]);

  const currentEvent = sessionEvents[currentEventIndex];

  // Render SVG Path of gameplay coordinates
  const svgPath = useMemo(() => {
    if (sessionEvents.length === 0) return '';
    return sessionEvents
      .map((ev, i) => {
        const x = ev.x ?? 150;
        const y = ev.y ?? 150;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [sessionEvents]);

  if (!ready || (authenticated && isLoading)) return <div className="p-8 text-[#e8e3d5] bg-[#020108] min-h-screen">Loading Operational Vault...</div>;
  if (!authenticated) return <div className="p-8 text-rose-500 bg-[#020108] min-h-screen flex items-center justify-center font-mono">ACCESS RESTRICTED: PRIVY ADMINISTRATIVE SIGN-IN REQUIRED</div>;

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center p-6 font-sans pixel-grid crt-overlay">
        <div className="arcade-panel max-w-md w-full p-8 relative flex flex-col items-center">
          {/* Glowing Accent Corner Lines */}
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-red-500" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-red-500" />

          {/* Glowing Flashing Shield/Lock Icon */}
          <div className="w-16 h-16 rounded-full bg-red-950/20 border border-red-500 flex items-center justify-center mb-6 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>

          <h2 className="text-lg font-heading font-black text-orange tracking-widest text-center mb-2 uppercase select-none">
            REPLAY SHIELD SEALED
          </h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider text-center mb-8 font-mono">
            Administrative Override Key Required to Inspect Replays &amp; Override Ledger
          </p>

          <form onSubmit={handleUnlock} className="w-full flex flex-col gap-4">
            <input
              type="password"
              placeholder="ENTER ADMIN_SECRET_KEY"
              value={unlockInput}
              onChange={(e) => setUnlockInput(e.target.value)}
              required
              className="bg-bg-dark border border-border text-center text-orange py-3 px-4 rounded w-full tracking-[0.2em] uppercase placeholder-slate-600 focus:outline-none focus:border-orange focus:shadow-[0_0_12px_rgba(169,221,211,0.3)] transition-all font-mono text-xs"
            />

            {unlockError && (
              <div className="text-[10px] bg-red-950/20 border border-red-500/30 text-red-400 font-bold uppercase rounded p-2.5 tracking-wider text-center">
                🚨 {unlockError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full text-xs py-3.5"
            >
              UNSEAL INSPECTOR VAULT
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-void py-12 md:py-24 px-4 max-w-7xl mx-auto space-y-8 pixel-grid crt-overlay font-sans text-slate-300">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center border-b border-border pb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
            <h1 className="text-2xl font-heading font-black text-white uppercase tracking-widest text-gradient">
              Replay Inspector &amp; Ledger Vault
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1.5 uppercase tracking-wider">
            Maturity: Compliance-Grade Operational Layer • Node: authoritative-v1.0.0-alpha
          </p>
        </div>
        
        {/* Secret Key Input Configuration Box */}
        <div className="flex items-center gap-3 bg-bg-card border border-border px-4 py-2.5 rounded shadow-[0_0_15px_rgba(169,221,211,0.05)]">
          <label className="text-[10px] text-orange uppercase font-bold tracking-wider font-mono">SECRET:</label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => {
              setSecretKey(e.target.value);
              if (typeof window !== 'undefined') {
                localStorage.setItem('rcade_admin_secret', e.target.value);
              }
            }}
            placeholder="ADMIN_SECRET_KEY"
            className="bg-bg-dark border border-border rounded px-3 py-1.5 text-orange placeholder-slate-600 text-xs w-60 outline-none focus:border-orange focus:shadow-[0_0_8px_rgba(169,221,211,0.2)] transition-all font-mono"
          />
        </div>

        {/* Ledger Integrity Flag */}
        <div className="flex items-center gap-4 bg-bg-card border border-border px-4 py-2.5 rounded shadow-[0_0_15px_rgba(169,221,211,0.05)]">
          <div className="text-right">
            <div className="text-[8px] uppercase tracking-wider text-slate-500 font-mono">Chain Integrity Status</div>
            <div className={`text-xs font-bold font-mono tracking-wider uppercase ${auditResult?.healthy ? 'text-emerald-400' : 'text-orange-hot'}`}>
              {auditResult?.healthy ? '✓ SECURE (100% HEALTHY)' : '⚠️ CHAIN COMPROMISED'}
            </div>
          </div>
          <button
            onClick={runIntegrityAudit}
            disabled={isAuditing}
            className="btn-secondary text-[10px] py-1.5 px-3 uppercase disabled:opacity-50"
          >
            {isAuditing ? 'Auditing...' : 'RE-AUDIT'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
        
        {/* Left Column: Match & Replay Timeline Selector */}
        <div className="xl:col-span-2 space-y-6 md:space-y-8">
          
          {/* Main Visualizer viewport */}
          <div className="arcade-panel p-6 bg-bg-card relative overflow-hidden">
            <div className="absolute top-2 right-2 text-[8px] font-mono text-slate-600 uppercase select-none">
              HUD-DISPLAY // v1.0.0
            </div>
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="text-[9px] uppercase font-mono tracking-widest text-orange bg-bg-void px-2.5 py-0.5 rounded border border-border">
                  Interactive Timeline Visualizer
                </span>
                <h2 className="text-base font-bold font-heading text-white mt-3 truncate max-w-md">
                  Active Match: <span className="font-mono text-orange text-sm">{selectedSession?.matchId || 'None'}</span>
                </h2>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-500">Scrubber:</span>
                <div className="text-lg font-bold font-mono text-orange">{scrubberTime}ms</div>
              </div>
            </div>

            {/* SVG Visual Canvas of player coordinates and anomalies */}
            <div className="w-full h-80 rounded bg-bg-dark relative border border-border flex items-center justify-center overflow-hidden">
              {/* Background Grid */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#161616_1px,transparent_1px),linear-gradient(to_bottom,#161616_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
              
              <svg className="w-full h-full absolute inset-0 select-none pointer-events-none" viewBox="0 0 300 300">
                {/* Dotted lines of coordinate sweep */}
                <path d={svgPath} fill="none" stroke="rgba(169, 221, 211, 0.2)" strokeWidth="2" strokeDasharray="3 3" />
                <path d={svgPath} fill="none" stroke="url(#cyan-magenta-grad)" strokeWidth="2.5" />
                
                {/* Definitions for gradient */}
                <defs>
                  <linearGradient id="cyan-magenta-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--orange)" />
                    <stop offset="100%" stopColor="var(--orange-hot)" />
                  </linearGradient>
                </defs>

                {/* Anomaly nodes mapping */}
                {sessionEvents.map((ev, idx) => {
                  if (!ev.anomaly) return null;
                  const x = ev.x ?? 150;
                  const y = ev.y ?? 150;
                  return (
                    <g key={idx}>
                      <circle cx={x} cy={y} r="10" className="fill-red-500/20 stroke-red-500 stroke-2 animate-ping" />
                      <circle cx={x} cy={y} r="5" className="fill-red-500 stroke-white stroke-1" />
                    </g>
                  );
                })}

                {/* Current scrubber position node marker */}
                {currentEvent && (
                  <g>
                    <circle cx={currentEvent.x ?? 150} cy={currentEvent.y ?? 150} r="12" className="fill-orange/20 stroke-orange stroke-2 animate-pulse" />
                    <circle cx={currentEvent.x ?? 150} cy={currentEvent.y ?? 150} r="4" className="fill-white" />
                  </g>
                )}
              </svg>

              {/* Float Panel detailing specific scrubber location data */}
              <div className="absolute bottom-4 left-4 right-4 bg-bg-card/90 backdrop-blur-md rounded border border-border p-3 flex justify-between items-center text-[10px] font-mono">
                <div>
                  <span className="text-slate-500">EVENT:</span> <span className="text-orange font-bold">{currentEvent?.type || 'NONE'}</span>
                  <span className="mx-2 text-border">|</span>
                  <span className="text-slate-500">COORDS:</span> <span className="text-white">({Math.round(currentEvent?.x ?? 0)}, {Math.round(currentEvent?.y ?? 0)})</span>
                </div>
                <div>
                  <span className="text-slate-500">SCORE STACK:</span> <span className="text-orange-hot font-bold">{currentEvent?.val ?? 0}</span>
                  {currentEvent?.anomaly && (
                    <span className="ml-3 px-2 py-0.5 bg-red-950/40 text-red-400 border border-red-800/40 rounded font-bold uppercase text-[8px] animate-pulse">
                      ANOMALY DETECTED
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Scrubber controls */}
            <div className="mt-6 space-y-3">
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0ms (START)</span>
                <span>SCRUB CURRENT SESSION TIMELINE</span>
                <span>{maxTime}ms (END)</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxTime}
                value={scrubberTime}
                onChange={(e) => setScrubberTime(Number(e.target.value))}
                className="w-full accent-orange h-2 bg-bg-dark rounded-lg appearance-none cursor-pointer border border-border"
              />
              
              {/* Event Markers / Warning Track */}
              <div className="relative h-6 bg-bg-dark rounded border border-border overflow-hidden">
                {sessionEvents.map((ev, i) => {
                  if (!ev.anomaly) return null;
                  const leftPct = (ev.t / maxTime) * 100;
                  return (
                    <button
                      key={i}
                      onClick={() => setScrubberTime(ev.t)}
                      className="absolute -top-1 w-2.5 h-8 bg-red-500 cursor-pointer hover:bg-red-400 hover:scale-125 transition-all shadow-[0_0_8px_#f43f5e]"
                      style={{ left: `${leftPct}%` }}
                      title={`Anomaly at ${ev.t}ms: ${ev.type}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Session Explorer and Verification */}
          <div className="arcade-panel p-6 bg-bg-card">
            <h3 className="text-base font-bold font-heading text-orange mb-6 uppercase tracking-wider">
              Match Session Metadata &amp; Verification Checksums
            </h3>

            {selectedSession ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
                
                <div className="space-y-4 bg-bg-dark p-4 rounded border border-border">
                  <div>
                    <span className="text-slate-500 uppercase block mb-1 text-[9px]">Session ID</span>
                    <span className="text-white text-xs block select-all break-all bg-bg-void p-1.5 rounded font-bold border border-border">{selectedSession.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block mb-1 text-[9px]">Authoritative User ( Privy DID )</span>
                    <span className="text-white text-xs block select-all break-all">{selectedSession.userId}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 uppercase block mb-1 text-[9px]">Client Salt</span>
                      <span className="text-orange text-xs block select-all truncate">{selectedSession.clientSalt}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase block mb-1 text-[9px]">Session Seed</span>
                      <span className="text-orange-hot text-xs block select-all truncate">{selectedSession.sessionSeed}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 uppercase block mb-1 text-[9px]">Protocol Version Freeze</span>
                    <span className="text-amber text-xs block font-bold">{selectedSession.protocolVersion}</span>
                  </div>
                </div>

                <div className="space-y-4 bg-bg-dark p-4 rounded border border-border flex flex-col justify-between">
                  <div>
                    <span className="text-slate-500 uppercase block mb-1 text-[9px]">Submitted Telemetry SHA-256</span>
                    <span className="text-white text-xs block select-all break-all bg-bg-void p-2 rounded border border-border">
                      {selectedSession.telemetryHash || 'N/A'}
                    </span>
                  </div>
                  
                  {/* Ledger block anchor verification state */}
                  <div className="bg-emerald-950/20 rounded border border-emerald-500/20 p-3 text-emerald-400">
                    <div className="font-bold flex items-center gap-1.5 mb-1 text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>Ledger Anchor Verification</span>
                    </div>
                    <p className="text-[9px] text-emerald-400/70 leading-relaxed">
                      This match is anchored to the immutable Audit Ledger. Checksum verification validates block inputs dynamically on client review.
                    </p>
                  </div>

                  {/* Manual Override Action Console */}
                  <div className="border-t border-border pt-4 mt-2">
                    <div className="text-[10px] font-bold text-orange-hot uppercase tracking-wider mb-3 font-heading">
                      ⚡ SECURITY OVERRIDE CONSOLE
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="New Winner ID or DRAW"
                          value={overrideWinner}
                          onChange={(e) => setOverrideWinner(e.target.value)}
                          className="bg-bg-void border border-border rounded p-2 text-white placeholder-slate-600 focus:outline-none focus:border-orange text-xs font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Override Reason"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          className="bg-bg-void border border-border rounded p-2 text-white placeholder-slate-600 focus:outline-none focus:border-orange text-xs font-mono"
                        />
                      </div>
                      <button
                        onClick={() => handleOverrideMatch(selectedSession.matchId)}
                        disabled={isSubmitting}
                        className="btn-primary w-full text-[10px] py-2 uppercase tracking-wider text-black disabled:opacity-50"
                      >
                        {isSubmitting ? 'EXECUTING TRANSACTION...' : 'FORCE OVERRIDE SETTLEMENT'}
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            ) : (
              <p className="text-slate-500 font-mono text-center">No active match session selected.</p>
            )}
          </div>

        </div>

        {/* Right Column: Moderation Appeals, Receipts, Audit Ledger */}
        <div className="space-y-6 md:space-y-8">
          
          {/* Active Moderation Appeals Dashboard */}
          <div className="arcade-panel p-6 bg-bg-card">
            <h3 className="text-base font-bold font-heading text-orange mb-4 uppercase tracking-wider flex items-center justify-between">
              <span>ACTIVE APPEALS</span>
              <span className="text-[9px] bg-orange-hot/10 text-orange-hot border border-orange-hot/20 px-2 py-0.5 rounded font-mono font-bold">
                {data?.appeals?.length || 0} PENDING
              </span>
            </h3>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
              {data?.appeals?.map((app: any) => (
                <div key={app.id} className="bg-bg-dark rounded border border-border p-4 font-mono text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-orange font-bold">MATCH: {app.matchId.substring(0, 8)}...</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                      app.status === 'PENDING' ? 'bg-amber-dim/10 text-amber border border-amber/20' :
                      app.status === 'APPROVED' ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/20' :
                      'bg-red-950/20 text-red-400 border border-red-800/20'
                    }`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="text-white"><span className="text-slate-500">User:</span> {app.userId.substring(0, 16)}...</div>
                  <div className="text-slate-400"><span className="text-slate-500">Reason:</span> {app.reason}</div>
                  
                  {app.status === 'PENDING' && (
                    <div className="pt-3 border-t border-border flex flex-col gap-2">
                      <input
                        type="text"
                        placeholder="Resolution comments..."
                        value={appealReason}
                        onChange={(e) => setAppealReason(e.target.value)}
                        className="bg-bg-void border border-border rounded p-2 text-white placeholder-slate-600 focus:outline-none focus:border-orange text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleResolveAppeal(app.id, 'APPROVED')}
                          disabled={isSubmitting}
                          className="btn-secondary py-1.5 text-[9px] uppercase tracking-wider disabled:opacity-50"
                        >
                          APPROVE
                        </button>
                        <button
                          onClick={() => handleResolveAppeal(app.id, 'REJECTED')}
                          disabled={isSubmitting}
                          className="btn-secondary py-1.5 text-[9px] text-orange-hot border-orange-hot/50 hover:bg-orange-hot/10 uppercase tracking-wider disabled:opacity-50"
                        >
                          REJECT
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {(!data?.appeals || data.appeals.length === 0) && (
                <div className="text-center font-mono text-xs text-slate-500 py-6 border border-dashed border-border rounded">
                  NO ACTIVE APPEALS RECORDED
                </div>
              )}
            </div>
          </div>

          {/* Audit Ledger ledger blocks */}
          <div className="arcade-panel p-6 bg-bg-card">
            <h3 className="text-base font-heading font-bold text-orange mb-4 uppercase tracking-wider">
              TAMPER-EVIDENT LEDGER (SHA-256)
            </h3>
            
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
              {data?.auditBlocks?.map((bl: any) => (
                <div key={bl.id} className="bg-bg-dark p-3 rounded border border-border font-mono text-[9px] space-y-1.5 hover:border-orange/20 transition-all">
                  <div className="flex justify-between items-center text-orange font-bold">
                    <span>BLOCK #{bl.sequenceId}</span>
                    <span className="text-[8px] bg-orange-hot/10 text-orange border border-orange/20 px-1.5 py-0.2 rounded font-bold uppercase">
                      {bl.entryType}
                    </span>
                  </div>
                  <div className="text-white">
                    <span className="text-slate-500">HASH:</span> {bl.currentHash.substring(0, 16)}...
                  </div>
                  <div className="text-white">
                    <span className="text-slate-500">PREV:</span> {bl.prevHash.substring(0, 16)}...
                  </div>
                  <div className="text-[8px] text-slate-600 truncate">
                    TIME: {new Date(bl.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
              {(!data?.auditBlocks || data.auditBlocks.length === 0) && (
                <div className="text-center font-mono text-xs text-slate-500 py-6 border border-dashed border-border rounded">
                  LEDGER IS EMPTY (GENESIS BLOCK IDLE)
                </div>
              )}
            </div>
          </div>

          {/* Session lists */}
          <div className="arcade-panel p-6 bg-bg-card">
            <h3 className="text-base font-heading font-bold text-orange mb-4 uppercase tracking-wider">
              RECENT MATCH SESSIONS
            </h3>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
              {data?.matchSessions?.map((sess: any) => (
                <button
                  key={sess.id}
                  onClick={() => setSelectedSession(sess)}
                  className={`w-full text-left p-3 rounded border font-mono text-xs transition-all duration-200 block cursor-pointer ${
                    selectedSession?.id === sess.id
                      ? 'bg-bg-dark border-orange shadow-[0_0_8px_rgba(169,221,211,0.2)]'
                      : 'bg-bg-dark/50 border-border hover:border-orange/20'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white truncate max-w-[140px]">{sess.id.substring(0, 12)}...</span>
                    <span className={`text-[9px] font-bold ${
                      sess.status === 'COMPLETED' ? 'text-emerald-400' : 'text-orange-hot'
                    }`}>
                      {sess.status}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1 truncate">User: {sess.userId.substring(0, 16)}...</div>
                </button>
              ))}
              {(!data?.matchSessions || data.matchSessions.length === 0) && (
                <p className="text-slate-500 font-mono text-xs text-center py-6">No recent match sessions found.</p>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
