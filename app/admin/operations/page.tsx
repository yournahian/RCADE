'use client';

import React, { useState, useEffect, useRef } from 'react';

export default function OperationsDashboard() {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string>(
    'RCADE Arena Sentinel Terminal v1.0.0-alpha initialized.\nReady to monitor production survivability...'
  );
  const [actionPending, setActionPending] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Poll operations API data every 5 seconds
  useEffect(() => {
    if (!secretKey) {
      setLoading(false);
      return;
    }
    let intervalId: any;

    async function fetchStats() {
      try {
        const res = await fetch(`/api/admin/arena/operations-data?secret=${secretKey}`);
        if (!res.ok) {
          if (res.status === 401) {
            setIsUnlocked(false);
            if (typeof window !== 'undefined') localStorage.removeItem('rcade_admin_secret');
            throw new Error('Vault seal verification failed. Access Denied.');
          }
          throw new Error(`Telemetry request failed (Status: ${res.status})`);
        }
        const json = await res.json();
        setData(json);
        setIsUnlocked(true);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to fetch real-time operational telemetry.');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    intervalId = setInterval(fetchStats, 5000);

    return () => clearInterval(intervalId);
  }, [secretKey]);

  // Scroll terminal logs automatically to the bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Handle manual actions
  const triggerAction = async (actionType: string) => {
    if (actionPending) return;
    setActionPending(true);
    
    // Add start log to terminal
    let commandDisplay = '';
    if (actionType === 'triggerGC') commandDisplay = 'sre-ctl --heap-sweep --flush';
    if (actionType === 'triggerIntegrityCheck') commandDisplay = 'audit-ctl --ledger-walk --verify';
    if (actionType === 'runRecovery') commandDisplay = 'journal-ctl --rollback-recovery --repair';
    
    setTerminalLogs((prev) => `${prev}\n\n$ ${commandDisplay}\n[System] Dispatched command request. Awaiting verification...`);

    try {
      const res = await fetch(`/api/admin/arena/operations-data?secret=${secretKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType })
      });
      
      if (res.status === 401) {
        setIsUnlocked(false);
        if (typeof window !== 'undefined') localStorage.removeItem('rcade_admin_secret');
        setTerminalLogs((prev) => `${prev}\n[Fatal] Session unauthorized. Vault sealed.`);
        return;
      }
      
      const result = await res.json();
      
      if (result.success) {
        setTerminalLogs((prev) => `${prev}\n${result.logs}\n[System] Action resolved successfully.`);
      } else {
        setTerminalLogs((prev) => `${prev}\nError: ${result.error}\n[System] Action failed.`);
      }
    } catch (err: any) {
      setTerminalLogs((prev) => `${prev}\nPanic: ${err.message || String(err)}\n[System] Transaction aborted.`);
    } finally {
      setActionPending(false);
    }
  };

  const handleBackupDownload = () => {
    setTerminalLogs((prev) => `${prev}\n\n$ backups-client --download-latest --signed\n[System] Initiating export snap of sequence tip...`);
    
    // Open backup route to trigger direct JSON attachment download
    window.open(`/api/admin/backups?secret=${secretKey}`, '_blank');
    
    setTerminalLogs((prev) => `${prev}\n[System] Download request opened in a separate window.`);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/arena/operations-data?secret=${unlockInput}`);
      if (!res.ok) {
        throw new Error("AUTHENTICATION FAILURE - DEVIANT SIGNATURE DETECTED");
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('rcade_admin_secret', unlockInput);
      }
      setSecretKey(unlockInput);
      setIsUnlocked(true);
    } catch (err: any) {
      setUnlockError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to draw custom glowing SVG line charts
  const generateSvgPath = (points: number[], width: number, height: number, minVal: number, maxVal: number) => {
    if (points.length < 2) return '';
    const span = Math.max(1, maxVal - minVal);
    
    return points
      .map((val, i) => {
        const x = (i / (points.length - 1)) * width;
        // Keep within 10% margins top and bottom
        const yVal = ((val - minVal) / span) * 0.8 * height + 0.1 * height;
        const y = height - yVal;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center p-6 font-sans pixel-grid crt-overlay">
        <div className="arcade-panel max-w-md w-full p-8 relative flex flex-col items-center">
          {/* Glowing Accent Corner Lines */}
          <div className="absolute top-0 left-0 w-4 h-[1px] bg-red-500" />
          <div className="absolute top-0 left-0 w-[1px] h-4 bg-red-500" />

          {/* Glowing Flashing Lock Icon */}
          <div className="w-16 h-16 rounded-full bg-red-950/20 border border-red-500 flex items-center justify-center mb-6 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <h2 className="text-lg font-heading font-black text-orange tracking-widest text-center mb-2 uppercase select-none">
            SECURE VAULT SEALED
          </h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider text-center mb-8 font-mono">
            Administrative Override Key Required for Nerve Center Control
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
              UNSEAL VAULT
            </button>
          </form>
        </div>
      </div>
    );
  }

  const historicalPoints = data?.historical || [];
  const latencies = historicalPoints.map((h: any) => h.settlementLatency);
  const queueDelays = historicalPoints.map((h: any) => h.queueDelay);

  return (
    <div className="min-h-screen bg-bg-void py-12 md:py-24 px-4 max-w-7xl mx-auto space-y-8 pixel-grid crt-overlay font-sans text-slate-300">
      {/* Top Banner Navigation Header */}
      <header className="flex flex-col md:flex-row justify-between md:items-center border-b border-border pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse shadow-[0_0_10px_rgba(169,221,211,0.8)]"></span>
            <h1 className="text-2xl font-heading font-black tracking-wider uppercase text-gradient">
              RCADE Operations Nerve Center
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 uppercase tracking-wider font-mono">
            Production Survivability, Observability &amp; Distributed Coordination Protocol
          </p>
        </div>

        {/* Secret Key Input Configuration Box */}
        <div className="flex items-center gap-3 bg-bg-card border border-border px-4 py-2.5 rounded shadow-[0_0_15px_rgba(169,221,211,0.05)]">
          <label className="text-[10px] text-orange uppercase font-bold tracking-wider font-mono">SECRET:</label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="ADMIN_SECRET_KEY"
            className="bg-bg-dark border border-border rounded px-3 py-1.5 text-orange placeholder-slate-600 text-xs w-60 outline-none focus:border-orange focus:shadow-[0_0_8px_rgba(169,221,211,0.2)] transition-all font-mono"
          />
        </div>
      </header>

      {error && (
        <div className="bg-red-950/20 border border-red-500/30 rounded p-4 text-red-400 font-sans text-xs flex items-center gap-2">
          <strong>⚠️ Operations Telemetry Offline:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center h-96 text-orange">
          <div className="w-10 h-10 border-2 border-orange/20 border-t-orange rounded-full animate-spin mb-4"></div>
          <span className="text-xs font-mono uppercase tracking-widest">Reading system diagnostics...</span>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8">
          {/* Active Infrastructure Modes Status Panel */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            <div className="arcade-panel p-6 bg-bg-card relative overflow-hidden flex flex-col justify-between">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Lock Infrastructure</div>
              <div className={`text-base font-black font-heading mt-3 uppercase ${data?.modes?.lockCoordinator === 'REDIS_CLUSTER' ? 'text-orange' : 'text-orange-hot'}`}>
                {data?.modes?.lockCoordinator === 'REDIS_CLUSTER' ? '🔥 REDIS MASTER LOCK' : '🛡️ POSTGRES DB LOCK'}
              </div>
              <div className="text-[9px] text-slate-500 mt-2">
                {data?.modes?.lockCoordinator === 'REDIS_CLUSTER' ? 'High throughput multi-node' : 'Active durable fallback mode'}
              </div>
            </div>

            <div className="arcade-panel p-6 bg-bg-card relative overflow-hidden flex flex-col justify-between">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Verifier State</div>
              <div className={`text-base font-black font-heading mt-3 uppercase ${data?.modes?.verifierState === 'HEALTHY' ? 'text-emerald-400' : 'text-amber'}`}>
                {data?.modes?.verifierState === 'HEALTHY' ? '❇️ VERIFIER HEALTHY' : '⚠️ HEAVY TAMPER GUARD'}
              </div>
              <div className="text-[9px] text-slate-500 mt-2">
                Tamper protection state &amp; curve validation
              </div>
            </div>

            <div className="arcade-panel p-6 bg-bg-card relative overflow-hidden flex flex-col justify-between">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Alert Routing Gateway</div>
              <div className="text-base font-black font-heading mt-3 text-orange uppercase">
                📢 WEBHOOK FAIL-OPEN
              </div>
              <div className="text-[9px] text-slate-500 mt-2">
                Discord down? Ledgers archive fallbacks active
              </div>
            </div>

            <div className="arcade-panel p-6 bg-bg-card relative overflow-hidden flex flex-col justify-between">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Degraded Metrics</div>
              <div className={`text-base font-black font-heading mt-3 uppercase ${data?.modes?.degradedMetricsMode ? 'text-orange-hot' : 'text-emerald-400'}`}>
                {data?.modes?.degradedMetricsMode ? '⚠️ METRICS DEGRADED' : '✅ TELEMETRY NOMINAL'}
              </div>
              <div className="text-[9px] text-slate-500 mt-2">
                Self-healing resolution scale gate
              </div>
            </div>
          </section>

          {/* Main Gauges & Interactive Charts Panel */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            {/* Live Stats Gauges Card */}
            <div className="arcade-panel p-6 bg-bg-card flex flex-col justify-between">
              <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-orange mb-6">
                🎛️ Real-Time Telemetry Counters
              </h2>

              <div className="grid grid-cols-2 gap-6 flex-grow">
                <div className="border-l-2 border-orange pl-3 py-1">
                  <div className="text-[9px] text-slate-500 uppercase font-mono">Active Locks</div>
                  <div className="text-2xl font-black text-white font-heading mt-1">
                    {data?.live?.activeLocks}
                  </div>
                </div>

                <div className="border-l-2 border-orange-hot pl-3 py-1">
                  <div className="text-[9px] text-slate-500 uppercase font-mono">Active Arenas</div>
                  <div className="text-2xl font-black text-white font-heading mt-1">
                    {data?.live?.activeMatches}
                  </div>
                </div>

                <div className="border-l-2 border-emerald-500 pl-3 py-1">
                  <div className="text-[9px] text-slate-500 uppercase font-mono">Completed</div>
                  <div className="text-2xl font-black text-emerald-400 font-heading mt-1">
                    {data?.live?.completedMatches}
                  </div>
                </div>

                <div className="border-l-2 border-red-500 pl-3 py-1">
                  <div className="text-[9px] text-slate-500 uppercase font-mono">Invalidated</div>
                  <div className="text-2xl font-black text-red-500 font-heading mt-1 animate-pulse">
                    {data?.live?.invalidatedMatches}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom SVG Line Chart - Settlement Latency */}
            <div className="arcade-panel p-6 bg-bg-card flex flex-col">
              <div className="flex flex-col gap-2 mb-4 border-b border-border pb-3">
                <h2 className="text-sm font-heading font-bold tracking-wider text-orange">
                  📈 Settlement Latency (p99)
                </h2>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">
                    Average: <strong className="text-white">{data?.live?.avgSettlementMs || 210}ms</strong>
                  </span>
                  <span className="text-orange font-bold bg-orange/10 px-2 py-0.5 rounded border border-orange/20">
                    Live: {latencies[latencies.length - 1] || data?.live?.avgSettlementMs || 210}ms
                  </span>
                </div>
              </div>
              <div className="relative h-36 bg-bg-dark border border-border rounded overflow-hidden flex-grow">
                {latencies.length > 1 && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={generateSvgPath(latencies, 100, 100, 100, 300)}
                      fill="none"
                      stroke="var(--orange)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`${generateSvgPath(latencies, 100, 100, 100, 300)} L 100 100 L 0 100 Z`}
                      fill="url(#latencyGrad)"
                    />
                  </svg>
                )}
                <div className="absolute top-2 left-2 text-[11px] text-slate-400 font-mono font-bold bg-bg-dark/80 px-1.5 py-0.5 rounded border border-border/30">300ms</div>
                <div className="absolute bottom-2 left-2 text-[11px] text-slate-400 font-mono font-bold bg-bg-dark/80 px-1.5 py-0.5 rounded border border-border/30">100ms</div>
              </div>
            </div>

            {/* Custom SVG Line Chart - Queue Delay */}
            <div className="arcade-panel p-6 bg-bg-card flex flex-col">
              <div className="flex flex-col gap-2 mb-4 border-b border-border pb-3">
                <h2 className="text-sm font-heading font-bold tracking-wider text-orange">
                  ⏳ Matchmaker Wait (p95)
                </h2>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">
                    Active Queue Delay
                  </span>
                  <span className="text-orange-hot font-bold bg-orange-hot/10 px-2 py-0.5 rounded border border-orange-hot/20">
                    Live: {queueDelays[queueDelays.length - 1] ? (queueDelays[queueDelays.length - 1] / 1000).toFixed(1) : '1.5'}s
                  </span>
                </div>
              </div>
              <div className="relative h-36 bg-bg-dark border border-border rounded overflow-hidden flex-grow">
                {queueDelays.length > 1 && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    <defs>
                      <linearGradient id="queueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--orange-hot)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--orange-hot)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={generateSvgPath(queueDelays, 100, 100, 500, 2500)}
                      fill="none"
                      stroke="var(--orange-hot)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`${generateSvgPath(queueDelays, 100, 100, 500, 2500)} L 100 100 L 0 100 Z`}
                      fill="url(#queueGrad)"
                    />
                  </svg>
                )}
                <div className="absolute top-2 left-2 text-[11px] text-slate-400 font-mono font-bold bg-bg-dark/80 px-1.5 py-0.5 rounded border border-border/30">2.5s</div>
                <div className="absolute bottom-2 left-2 text-[11px] text-slate-400 font-mono font-bold bg-bg-dark/80 px-1.5 py-0.5 rounded border border-border/30">0.5s</div>
              </div>
            </div>
          </section>

          {/* SRE Manual Overrides and Terminal Control Panel */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-stretch">
            {/* Quick SRE Commands Override Controls */}
            <div className="arcade-panel p-6 bg-bg-card flex flex-col justify-between gap-6">
              <div>
                <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-orange mb-1">
                  🛠️ Operational Controls
                </h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                  Manual override capabilities for live operations
                </p>
              </div>

              <div className="flex flex-col gap-3 flex-grow justify-center">
                <button
                  onClick={() => triggerAction('triggerGC')}
                  disabled={actionPending}
                  className="btn-secondary w-full text-[10px] py-3 text-center uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⚡ Flush Heap &amp; Run GC Sweep
                </button>

                <button
                  onClick={() => triggerAction('triggerIntegrityCheck')}
                  disabled={actionPending}
                  className="btn-secondary w-full text-[10px] py-3 text-center uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔍 Verify Ledger Integrity
                </button>

                <button
                  onClick={() => triggerAction('runRecovery')}
                  disabled={actionPending}
                  className="btn-secondary w-full text-[10px] py-3 text-center uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔄 Resolve Incomplete Transactions
                </button>

                <button
                  onClick={handleBackupDownload}
                  className="btn-primary w-full text-[10px] py-3 text-center uppercase tracking-wider text-black"
                >
                  📦 Download Signed Ledger Snapshot
                </button>
              </div>
            </div>

            {/* Glowing Interactive Cyberpunk Terminal logs Console */}
            <div className="arcade-panel p-6 bg-bg-card flex flex-col h-[380px] lg:col-span-2">
              <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
                <span className="text-[10px] font-heading font-bold tracking-wider text-orange uppercase">
                  📺 SENTINEL SRE DIAGNOSTIC LOGGER
                </span>
                <div className="flex gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto font-mono text-[11px] text-orange bg-bg-dark p-4 rounded border border-border leading-relaxed scrollbar-thin">
                <pre className="margin-0 whitespace-pre-wrap">{terminalLogs}</pre>
                <div ref={logsEndRef}></div>
              </div>
            </div>
          </section>

          {/* Quick Navigation Cards Panel */}
          <section className="space-y-4">
            <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-orange">
              🧭 Quick Navigation Gateways
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              <a href="/admin/replay-inspector" className="no-underline">
                <div className="bg-bg-dark border border-border p-6 rounded hover:border-orange/20 transition-all cursor-pointer h-full flex flex-col justify-between gap-3">
                  <div className="font-heading font-bold text-sm text-white uppercase tracking-wider">🛡️ Replay Inspector Console</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">Review game verification runs, checkpoints, and referee invalidations.</p>
                </div>
              </a>

              <a href="/api/admin/diagnose" target="_blank" className="no-underline">
                <div className="bg-bg-dark border border-border p-6 rounded hover:border-orange/20 transition-all cursor-pointer h-full flex flex-col justify-between gap-3">
                  <div className="font-heading font-bold text-sm text-white uppercase tracking-wider">🩺 Database Diagnostics Portal</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">Inspect active prisma pools, rpc block syncs, and database latencies.</p>
                </div>
              </a>

              <a href={`/api/admin/metrics?secret=${secretKey}`} target="_blank" className="no-underline">
                <div className="bg-bg-dark border border-border p-6 rounded hover:border-orange/20 transition-all cursor-pointer h-full flex flex-col justify-between gap-3">
                  <div className="font-heading font-bold text-sm text-white uppercase tracking-wider">📊 Prometheus Scrape Target</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-sans">Access metrics exposition standard endpoints for grafana targets.</p>
                </div>
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
