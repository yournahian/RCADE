'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';
import { ApiService } from '@/services/api';

export default function AdminDashboard() {
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
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        if (!secretKey) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const res = await ApiService.fetchWithAuth(`/api/admin/data?secret=${secretKey}`, {}, getAccessToken);
            if (res.ok) {
                const json = await res.json();
                setData(json);
                setIsUnlocked(true);
                setUnlockError(null);
            } else if (res.status === 401) {
                setIsUnlocked(false);
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('rcade_admin_secret');
                }
                throw new Error("Vault seal verification failed. Access Denied.");
            } else {
                throw new Error(`Data fetch failed (Status: ${res.status})`);
            }
        } catch (e: any) {
            console.error(e);
            setUnlockError(e.message || "Failed to load admin data.");
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

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnlockError(null);
        setIsLoading(true);
        try {
            const res = await ApiService.fetchWithAuth(`/api/admin/data?secret=${unlockInput}`, {}, getAccessToken);
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
        } catch (err: any) {
            setUnlockError(err.message || "Authentication failed.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecalculate = async (wallet: string) => {
        try {
            const res = await ApiService.fetchWithAuth(`/api/admin/recalculate?secret=${secretKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet })
            }, getAccessToken);

            if (res.status === 401) {
                setIsUnlocked(false);
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('rcade_admin_secret');
                }
                alert("Session unauthorized. Vault sealed.");
                return;
            }

            if (res.ok) {
                alert("Recalculation successful");
                fetchData();
            } else {
                alert("Recalculation failed");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (!ready || (authenticated && isLoading)) return <div className="p-8 text-[#e8e3d5] bg-[#020108] min-h-screen">Loading Operational Vault...</div>;
    if (!authenticated) return <div className="p-8 text-rose-500 bg-[#020108] min-h-screen flex items-center justify-center font-mono">ACCESS RESTRICTED: PRIVY ADMINISTRATIVE SIGN-IN REQUIRED</div>;

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
                        SECURE PROGRESSION VAULT SEALED
                    </h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider text-center mb-8 font-mono">
                        Administrative Override Key Required for Progression Controls
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

    return (
        <div className="min-h-screen bg-bg-void py-12 md:py-24 px-4 max-w-7xl mx-auto space-y-8 pixel-grid crt-overlay font-sans text-slate-300">
            <div className="flex flex-col md:flex-row justify-between md:items-center border-b border-border pb-6 gap-4">
                <h1 className="text-3xl font-heading font-black text-white uppercase tracking-widest text-gradient">
                    Admin Dashboard
                </h1>
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
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Users Section */}
                <div className="arcade-panel p-6 bg-bg-card">
                    <h2 className="text-lg font-heading font-bold mb-6 text-orange uppercase tracking-wider">
                        Progression Consistency
                    </h2>
                    <div className="space-y-4">
                        {data?.users?.map((u: any) => (
                            <div key={u.id} className="bg-bg-dark p-4 rounded flex justify-between items-center border border-border transition-all hover:border-orange/20">
                                <div className="space-y-1">
                                    <div className="font-mono text-xs text-white truncate max-w-[200px] md:max-w-xs">{u.wallet}</div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Historical Max: {u.highestUnlockedLevel}</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-mono">Effective</div>
                                        <div className="text-xl font-black text-orange font-heading">{u.effectiveProgressionLevel}</div>
                                    </div>
                                    <button 
                                        onClick={() => handleRecalculate(u.wallet)}
                                        className="btn-secondary text-[10px] py-1.5 px-3"
                                    >
                                        RECALC
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Event Logs */}
                <div className="arcade-panel p-6 bg-bg-card">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-heading font-bold text-orange uppercase tracking-wider">
                            Blockchain Indexer
                        </h2>
                        <button onClick={fetchData} className="text-[10px] font-heading font-bold tracking-widest text-slate-500 hover:text-white uppercase transition-colors">
                            REFRESH
                        </button>
                    </div>
                    <div className="space-y-2.5 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {data?.events?.map((e: any) => (
                            <div key={e.id} className="text-[11px] font-mono bg-bg-dark p-3 rounded flex justify-between border border-border transition-all hover:border-orange/10">
                                <div className="space-y-0.5">
                                    <div>
                                        <span className="text-emerald-400 font-bold">[{e.eventName}]</span> 
                                    </div>
                                    <div className="text-slate-500 text-[10px]">
                                        Block: {e.blockNumber}
                                    </div>
                                </div>
                                <a href={`https://sepolia.basescan.org/tx/${e.transactionHash}`} target="_blank" className="text-orange hover:text-orange-bright hover:underline self-center">
                                    {e.transactionHash.slice(0, 10)}...
                                </a>
                            </div>
                        ))}
                        {data?.events?.length === 0 && <div className="text-slate-500 font-mono text-center py-10 uppercase tracking-widest text-xs">No events indexed.</div>}
                    </div>
                </div>
            </div>

            {/* NFT Ownership */}
            <div className="arcade-panel p-6 bg-bg-card">
                <h2 className="text-lg font-heading font-bold mb-6 text-orange uppercase tracking-wider">
                    Active NFT Ownership
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {data?.ownerships?.filter((o: any) => o.isActive).map((o: any) => {
                        const tId = BigInt(o.tokenId);
                        const categoryCode = Number((tId >> 192n) & 0xFFFFn);
                        const levelCode = Number((tId >> 176n) & 0xFFFFn);
                        
                        return (
                            <div key={o.id} className="bg-bg-dark p-4 rounded border border-border transition-all hover:border-orange/20">
                                <div className="font-mono text-[10px] text-slate-500 truncate mb-3">{o.wallet}</div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-white">Cat: {categoryCode} | Lvl: {levelCode}</span>
                                    <span className="text-xs font-bold font-heading text-orange">Amt: {o.amount}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
