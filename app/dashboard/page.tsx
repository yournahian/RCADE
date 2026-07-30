'use client';

import { usePrivy, useWallets, useExportWallet, useFundWallet } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { 
  Wallet, Trophy, Star, ExternalLink, Loader2, Send, ShieldAlert, ArrowRight, X, 
  Zap, TrendingUp, Award, Package, Info, ChevronDown, ChevronUp, RefreshCw, 
  AlertTriangle, Cpu, Layers, Settings, ShieldCheck, Gamepad2, Swords, Grid,
  Copy, Check, Key, Plus, Coins
} from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/ui/toast-provider';
import { motion, AnimatePresence } from 'framer-motion';

const GAME_ICON_MAP: Record<string, any> = {
  Zap: Zap,
  Cpu: Cpu,
  Layers: Layers,
  Trophy: Trophy,
  Gamepad2: Gamepad2,
  Swords: Swords,
  Grid: Grid
};
import { baseSepolia } from 'viem/chains';
import { ApiService } from '@/services/api';

// ─── helpers ────────────────────────────────────────────────
function calculateEffectiveProgression(inventory: any[], excludeTokenId?: string, transferAmount = 0) {
  const ownedLevels = new Set<number>();
  for (const item of inventory) {
    let amount = item.amount;
    if (excludeTokenId && item.tokenId === excludeTokenId) amount -= transferAmount;
    if (amount > 0) ownedLevels.add(item.level);
  }
  let effective = 0;
  while (ownedLevels.has(effective + 1)) effective++;
  return effective;
}

const RARITY_COLOR: Record<string, string> = {
  Legendary: '#f59e0b', Epic: '#a9ddd3', Rare: '#fb923c', Common: '#6b6b6b',
};
const RARITY_BORDER: Record<string, string> = {
  Legendary: 'rgba(245,158,11,0.5)', Epic: 'rgba(169,221,211,0.5)',
  Rare: 'rgba(251,146,60,0.4)', Common: 'rgba(107,107,107,0.25)',
};

const copyToClipboardFallback = (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    textArea.remove();
  }
};

// ─── component ──────────────────────────────────────────────
export default function Dashboard() {
  const { ready, authenticated, user, login, getAccessToken, createWallet } = usePrivy();
  const { wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const { fundWallet } = useFundWallet();

  const [dbUser, setDbUser] = useState<any>(null);
  const activeWalletAddress = useMemo(() => user?.wallet?.address || dbUser?.wallet, [user?.wallet?.address, dbUser?.wallet]);
  
  const showEmbeddedControls = useMemo(() => {
    if (!authenticated) return false;
    const hasExternalWallet = wallets.some(
      w => w.walletClientType !== 'privy' && w.connectorType !== 'embedded'
    );
    const hasEmbeddedWallet = wallets.some(
      w => w.walletClientType === 'privy' || w.connectorType === 'embedded'
    );
    const primaryIsEmbedded = user?.wallet?.walletClientType === 'privy' || user?.wallet?.connectorType === 'embedded';
    
    return primaryIsEmbedded || hasEmbeddedWallet || !hasExternalWallet;
  }, [authenticated, wallets, user?.wallet]);

  const [addressCopied, setAddressCopied] = useState(false);
  const handleCopyAddress = () => {
    const addr = activeWalletAddress;
    if (addr) {
      copyToClipboardFallback(addr);
      setAddressCopied(true);
      toast.success('COPIED', 'Wallet address copied to clipboard');
      setTimeout(() => setAddressCopied(false), 2000);
    }
  };

  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<string>("10");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  const handleFundWallet = () => {
    setShowTopUpModal(true);
  };

  const handleCreateIntent = async () => {
    setIsCreatingIntent(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/pay/ababilpay/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount_usdc: Number(topUpAmount),
          return_path: '/dashboard'
        })
      });
      const result = await res.json();
      if (res.ok && result.success && result.data.checkout_url) {
        toast.info('REDIRECTING', 'Sending you to Ababilpay Hosted Checkout...');
        window.location.href = result.data.checkout_url;
      } else {
        toast.error('INTENT ERROR', result.error || 'Failed to initiate checkout.');
        setIsCreatingIntent(false);
      }
    } catch (err) {
      console.error('Failed to initiate top up:', err);
      toast.error('INTENT ERROR', 'Could not establish connection to Ababilpay.');
      setIsCreatingIntent(false);
    }
  };

  const handleExportWallet = async () => {
    try {
      await exportWallet();
    } catch (err: any) {
      console.error("Wallet export failed:", err);
      const isCancel = err?.message?.toLowerCase().includes("cancel") || err?.message?.toLowerCase().includes("dismiss") || err?.message?.toLowerCase().includes("user rejected");
      if (!isCancel) {
        toast.error("EXPORT ERROR", err?.message || "An error occurred during wallet export.");
      }
    }
  };

  const router = useRouter();

  const [mintingId, setMintingId] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<any[]>([]);
  const [preparedRewards, setPreparedRewards] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'vault' | 'leaderboard'>('vault');

  // ─── client mounting hydration guard ────────────────────────
  const [mounted, setMounted] = useState(false);
  
  // ─── FTUE onboarding state ──────────────────────────────────
  const [showFTUE, setShowFTUE] = useState(false);
  const [ftueStep, setFtueStep] = useState(0);


  // ─── QA Debugger state ──────────────────────────────────────
  const [showQAPanel, setShowQAPanel] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isFetchingDiagnostics, setIsFetchingDiagnostics] = useState(false);
  const [qaConsoleLogs, setQaConsoleLogs] = useState<string[]>([
    "System initialized. Ready for diagnostics."
  ]);
  const [ethBalance, setEthBalance] = useState<string>("0.00");
  const [isSyncingProgression, setIsSyncingProgression] = useState(false);

  const [transferModal, setTransferModal] = useState<{
    show: boolean; nft: any | null; recipient: string; amount: number; confirmText: string; error: string | null;
  }>({ show: false, nft: null, recipient: '', amount: 1, confirmText: '', error: null });

  // ─── mount logic ───────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('rcade_ftue_dismissed');
      if (!dismissed) {
        setShowFTUE(true);
      }
    }
  }, []);

  const fetchEthBalance = async () => {
    const activeWalletAddress = user?.wallet?.address;
    if (!activeWalletAddress) return;
    try {
      const { formatEther } = await import('viem');
      const { publicClient } = await import('@/lib/web3');
      const balance = await publicClient.getBalance({ address: activeWalletAddress as `0x${string}` });
      setEthBalance(Number(formatEther(balance)).toFixed(4));
    } catch (e) {
      console.error("Failed to fetch balance in QA panel:", e);
    }
  };

  const fetchDiagnostics = async () => {
    setIsFetchingDiagnostics(true);
    setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Querying diagnostics API...`]);
    try {
      const res = await fetch('/api/admin/diagnose');
      if (res.ok) {
        const data = await res.json();
        setDiagnosticsData(data);
        setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Diagnostics resolved: ${data.health}. RPC block: ${data.rpc?.blockNumber}`]);
      } else {
        const text = await res.text();
        setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Warning: Diagnostics API returned error state (expected if indexer in fallback): ${text.slice(0, 100)}`]);
        try {
          const parsed = JSON.parse(text);
          setDiagnosticsData(parsed);
        } catch {
          setDiagnosticsData({ health: 'UNHEALTHY', error: text });
        }
      }
    } catch (e: any) {
      console.error(e);
      setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Critical API request failed: ${e.message}`]);
    } finally {
      setIsFetchingDiagnostics(false);
    }
  };

  const handleForceSyncProgression = async () => {
    setIsSyncingProgression(true);
    setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Initializing force sync & level recalculation...`]);
    try {
      const authRes = await ApiService.fetchWithAuth('/api/auth/sync', { method: 'POST' }, getAccessToken);
      if (authRes.ok) {
        const data = await authRes.json();
        setDbUser(data.user);
        setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sync success! Effective level: ${data.user.effectiveProgressionLevel}`]);
        // Also fetch active historical balance to make sure
        const hRes = await ApiService.fetchWithAuth('/api/rewards/history', {}, getAccessToken);
        if (hRes.ok) {
          const hData = await hRes.json();
          setInventory(hData.rewards);
        }
        await fetchDiagnostics();
      } else {
        const errText = await authRes.text();
        setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sync failure: ${errText}`]);
      }
    } catch (e: any) {
      setQaConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sync execution crashed: ${e.message}`]);
    } finally {
      setIsSyncingProgression(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('ababilpay_status');
    const intentId = urlParams.get('ababilpay_intent_id');

    if (status === 'success' && intentId) {
      const verifyPayment = async () => {
        setIsVerifyingPayment(true);
        try {
          const token = await getAccessToken();
          const res = await fetch('/api/pay/ababilpay/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ intentId })
          });
          const result = await res.json();
          if (res.ok && result.success) {
            toast.success(
              'TOP-UP SUCCESSFUL', 
              result.alreadyProcessed 
                ? 'Your top-up was already verified and processed.'
                : `Successfully credited ${result.ethPayout} Base Sepolia ETH to your wallet!`
            );
            await fetchData();
            await fetchEthBalance();
          } else {
            toast.error('TOP-UP VERIFICATION FAILED', result.error || 'Payment verification failed');
          }
        } catch (err) {
          console.error('Verify error:', err);
          toast.error('VERIFICATION ERROR', 'Could not complete top-up verification.');
        } finally {
          setIsVerifyingPayment(false);
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      };
      
      verifyPayment();
    }
  }, [ready, authenticated]);

  const fetchData = async () => {
    try {
      await Promise.all([
        ApiService.fetchWithAuth('/api/auth/sync', { method: 'POST' }, getAccessToken)
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data?.user) setDbUser(data.user); }),
        fetch('/api/leaderboard')
          .then(res => res.ok ? res.json() : null)
          .then(lbData => { if (lbData?.leaderboards) setLeaderboards(lbData.leaderboards); }),
        ApiService.fetchWithAuth('/api/rewards/pending', {}, getAccessToken)
          .then(res => res.ok ? res.json() : null)
          .then(pData => { if (pData?.rewards) setPreparedRewards(pData.rewards); }),
        ApiService.fetchWithAuth('/api/rewards/history', {}, getAccessToken)
          .then(res => res.ok ? res.json() : null)
          .then(hData => { if (hData?.rewards) setInventory(hData.rewards); })
      ]);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { 
    if (ready && authenticated) {
      fetchData();
      fetchEthBalance();
      fetchDiagnostics();
    } 
  }, [ready, authenticated, getAccessToken]);

  const handleMintNFT = async (rewardId: string) => {
    try {
      setMintingId(rewardId);
      let activeWalletAddress = user?.wallet?.address;
      if (!activeWalletAddress) { const newWallet = await createWallet(); activeWalletAddress = newWallet.address; }
      const activeWallet = wallets.find(w => w.address?.toLowerCase() === activeWalletAddress?.toLowerCase());
      if (!activeWallet) { alert("Wallet not fully synced yet. Please refresh."); setMintingId(null); return; }
      if (activeWallet.chainId !== `eip155:${baseSepolia.id}`) { await activeWallet.switchChain(baseSepolia.id).catch(() => {}); }

      const payloadRes = await ApiService.fetchWithAuth('/api/rewards/mint-payload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rewardId, userWallet: activeWallet.address }) }, getAccessToken);
      if (!payloadRes.ok) throw new Error(await payloadRes.text());
      const { payload } = await payloadRes.json();

      const { encodeFunctionData, createWalletClient, custom } = await import('viem');
      const { RCADE_ERC1155_ABI, CONTRACT_ADDRESS, publicClient } = await import('@/lib/web3');
      const data = encodeFunctionData({ abi: RCADE_ERC1155_ABI, functionName: 'mint', args: [payload.to, BigInt(payload.tokenId), BigInt(payload.amount), payload.rewardId, payload.signature] });
      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: activeWallet.address as `0x${string}`, chain: baseSepolia, transport: custom(provider) });
      const txHash = await walletClient.sendTransaction({ account: activeWallet.address as `0x${string}`, to: CONTRACT_ADDRESS as `0x${string}`, data, value: 0n, chain: baseSepolia });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await ApiService.fetchWithAuth('/api/rewards/mint-success', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rewardId, txHash }) }, getAccessToken);
      await fetchData();
      setMintingId(null);
    } catch (e) { console.error(e); setMintingId(null); alert("Failed to mint NFT. See console for details."); }
  };

  const handleTransferSubmit = async () => {
    if (!transferModal.nft || transferringId) return;
    const { recipient, amount, nft } = transferModal;
    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) { setTransferModal(prev => ({ ...prev, error: 'Invalid recipient address' })); return; }
    if (amount <= 0 || amount > nft.amount) { setTransferModal(prev => ({ ...prev, error: 'Invalid amount' })); return; }
    setTransferringId(nft.id); setTransferModal(prev => ({ ...prev, error: null }));
    try {
      const activeWalletAddress = user?.wallet?.address;
      const activeWallet = wallets.find(w => w.address?.toLowerCase() === activeWalletAddress?.toLowerCase());
      if (!activeWallet) throw new Error("Wallet not synced");
      if (activeWallet.chainId !== `eip155:${baseSepolia.id}`) { await activeWallet.switchChain(baseSepolia.id).catch(() => {}); }
      const { encodeFunctionData, createWalletClient, custom } = await import('viem');
      const { RCADE_ERC1155_ABI, CONTRACT_ADDRESS, publicClient } = await import('@/lib/web3');
      const data = encodeFunctionData({ abi: RCADE_ERC1155_ABI, functionName: 'safeTransferFrom', args: [activeWallet.address as `0x${string}`, recipient as `0x${string}`, BigInt(nft.tokenId), BigInt(amount), "0x"] });
      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: activeWallet.address as `0x${string}`, chain: baseSepolia, transport: custom(provider) });
      const txHash = await walletClient.sendTransaction({ account: activeWallet.address as `0x${string}`, to: CONTRACT_ADDRESS as `0x${string}`, data, value: 0n, chain: baseSepolia });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await new Promise(resolve => setTimeout(resolve, 1500));
      await fetchData();
      closeTransferModal();
    } catch (e: any) { console.error("Transfer failed", e); setTransferModal(prev => ({ ...prev, error: e.message || 'Transfer failed' })); setTransferringId(null); }
  };

  const openTransferModal = (nft: any) => setTransferModal({ show: true, nft, recipient: '', amount: 1, confirmText: '', error: null });
  const closeTransferModal = () => { setTransferModal({ show: false, nft: null, recipient: '', amount: 1, confirmText: '', error: null }); setTransferringId(null); };

  const currentProgression = useMemo(() => calculateEffectiveProgression(inventory), [inventory]);
  const projectedProgression = useMemo(() => { if (!transferModal.nft) return currentProgression; return calculateEffectiveProgression(inventory, transferModal.nft.tokenId, transferModal.amount); }, [inventory, transferModal.nft, transferModal.amount, currentProgression]);
  const progressionDrops = projectedProgression < currentProgression;
  const isCoreProgression = transferModal.nft ? transferModal.nft.level <= currentProgression : false;
  const requireExplicitConfirmation = progressionDrops || (isCoreProgression && transferModal.amount === transferModal.nft?.amount);

  /* ── loading ── */
  if (!ready || (authenticated && isLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-t-transparent animate-spin" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
          <p className="text-[10px] font-heading tracking-[0.25em] text-text-muted uppercase">Loading...</p>
        </div>
      </div>
    );
  }

  /* ── unauthenticated ── */
  if (!authenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] px-4 text-center pixel-grid crt-overlay">
        <div className="relative z-10">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-8" style={{ background: '#a9ddd3', boxShadow: '0 0 30px rgba(169,221,211,0.6)' }}>
            <Zap className="w-7 h-7 text-black" fill="black" />
          </div>
          <h1 className="font-heading font-black text-3xl text-white mb-3 uppercase tracking-tight">Insert Wallet</h1>
          <p className="text-text-secondary text-sm mb-8 max-w-xs font-heading tracking-wider">Connect your wallet to access your profile, rewards, and leaderboards.</p>
          <button onClick={login} className="btn-primary text-xs px-8 py-4">Connect Wallet</button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     MAIN DASHBOARD
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-7xl mx-auto px-4 py-10 w-full animate-fadeIn">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 pb-6" style={{ borderBottom: '1px solid #1f1f1f' }}>
        <div>
          <p className="text-[10px] font-heading tracking-[0.25em] uppercase mb-2" style={{ color: '#a9ddd3' }}>Player Profile</p>
          <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tight">Dashboard</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#09090c] border border-zinc-800 rounded">
              <Wallet className="w-3.5 h-3.5" style={{ color: '#a9ddd3' }} />
              <span className="font-mono text-xs text-text-secondary">
                {user?.wallet?.address ? `${user.wallet.address.slice(0, 8)}...${user.wallet.address.slice(-6)}` : (dbUser?.wallet ? `${dbUser.wallet.slice(0, 8)}...${dbUser.wallet.slice(-6)}` : 'No wallet')}
              </span>
              {(user?.wallet?.address || dbUser?.wallet) && (
                <button
                  onClick={handleCopyAddress}
                  className="p-1 text-zinc-500 hover:text-white transition-colors cursor-pointer ml-1"
                  title="Copy Wallet Address"
                >
                  {addressCopied ? <Check className="w-3.5 h-3.5 text-[#a9ddd3]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {showEmbeddedControls && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFundWallet}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading font-bold uppercase border border-zinc-800 hover:border-[#a9ddd3]/50 text-zinc-400 hover:text-white bg-[#09090c] transition-all rounded cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#a9ddd3]" />
                  Add Funds
                </button>
                <button
                  onClick={handleExportWallet}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-heading font-bold uppercase border border-zinc-800 hover:border-[#a9ddd3]/50 text-zinc-400 hover:text-white bg-[#09090c] transition-all rounded cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-[#a9ddd3]" />
                  Export Wallet
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/play" className="btn-primary text-[10px] px-5 py-3">
            <Gamepad2 className="w-3.5 h-3.5 fill-black" /> Play Game Hub
          </Link>
        </div>
      </div>

      {/* ── FTUE Onboarding Guide ──────────────────────────────────── */}
      {mounted && showFTUE && (
        <div className="mb-8 p-6 relative border border-[#a9ddd3]/20 bg-[#010101] rounded shadow-[0_0_30px_rgba(169,221,211,0.06)] overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
          
          <button 
            onClick={() => {
              localStorage.setItem('rcade_ftue_dismissed', 'true');
              setShowFTUE(false);
            }}
            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-[#a9ddd3] animate-pulse" />
              <span className="font-heading text-[10px] font-bold uppercase tracking-[0.25em] text-[#a9ddd3]">SYSTEM ONBOARDING MODULE</span>
              <span className="text-[8px] font-mono px-2 py-0.5 border border-zinc-800 text-zinc-500 uppercase">Step {ftueStep + 1} of 4</span>
            </div>

            {ftueStep === 0 && (
              <div className="space-y-2">
                <h2 className="text-lg font-heading font-black text-white uppercase tracking-tight">Agent Authentication & Secure Wallet</h2>
                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                  Welcome to the RCADE Closed Alpha. Your game account is securely synchronized with Privy credentials, backing an embedded smart contract wallet on Base Sepolia.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-zinc-950 border border-zinc-900 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-green-400" />
                    <div>
                      <div className="text-[8px] font-heading text-zinc-500 uppercase tracking-widest">Privy Auth</div>
                      <div className="text-[9px] font-mono text-green-400 font-bold uppercase">SECURED & VERIFIED</div>
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950 border border-zinc-900 flex items-center gap-3">
                    <Wallet className="w-4 h-4 text-green-400" />
                    <div>
                      <div className="text-[8px] font-heading text-zinc-500 uppercase tracking-widest">Base Sepolia Wallet</div>
                      <div className="text-[9px] font-mono text-green-400 font-bold uppercase">SYNCED & READY</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {ftueStep === 1 && (
              <div className="space-y-2">
                <h2 className="text-lg font-heading font-black text-white uppercase tracking-tight">Contiguous Progression Chains</h2>
                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                  Progression in RCADE is strictly sequential. To sustain Level 5 active status, your wallet MUST hold Level 1, 2, 3, 4, AND 5 NFTs concurrently.
                </p>
                <div className="p-2.5 bg-red-950/10 border border-red-900/30 text-red-300 text-[10px] font-mono rounded flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Progression Downgrade Penalty:</strong> If you transfer or sell any intermediate level NFT (e.g. Level 3), your chain breaks. Your active progression level will immediately drop back to Level 2!
                  </span>
                </div>
              </div>
            )}

            {ftueStep === 2 && (
              <div className="space-y-2">
                <h2 className="text-lg font-heading font-black text-white uppercase tracking-tight">Reserved Assets & Marketplace Locking</h2>
                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                  When listing an NFT for sale in the marketplace, it enters a <strong className="text-amber font-bold">RESERVED</strong> state. It is temporarily locked from your available inventory.
                </p>
                <div className="p-2.5 bg-amber-950/10 border border-amber-900/30 text-amber-300 text-[10px] font-mono rounded flex gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Important:</strong> Reserved tokens DO NOT count toward your active contiguous progression chain. Listing an intermediate NFT will trigger progression downgrades until the listing is bought or cancelled.
                  </span>
                </div>
              </div>
            )}

            {ftueStep === 3 && (
              <div className="space-y-2">
                <h2 className="text-lg font-heading font-black text-white uppercase tracking-tight">The Play-Earn-Mint Loop</h2>
                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                  Ready to ascend? Play Snake levels inside the arcade to record high scores. Reaching high score thresholds prepares pending rewards in your dashboard <strong>Reward Vault</strong>.
                </p>
                <div className="p-2.5 bg-green-950/10 border border-green-900/30 text-green-300 text-[10px] font-mono rounded flex gap-2">
                  <Zap className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Gasless Minting:</strong> All pending rewards can be minted directly as ERC1155 tokens with fully sponsored transactions on Base Sepolia. Zero gas fee barriers!
                  </span>
                </div>
              </div>
            )}

            {/* Navigation Controls */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-zinc-900">
              <button
                onClick={() => setFtueStep(s => Math.max(0, s - 1))}
                disabled={ftueStep === 0}
                className="px-3 py-1.5 text-[8px] font-heading font-bold uppercase tracking-wider border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-all cursor-pointer"
              >
                Previous
              </button>
              
              <div className="flex gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setFtueStep(i)}
                    className="w-1.5 h-1.5 rounded-full transition-all cursor-pointer"
                    style={{
                      background: ftueStep === i ? '#a9ddd3' : '#27272a',
                      boxShadow: ftueStep === i ? '0 0 8px #a9ddd3' : 'none'
                    }}
                  />
                ))}
              </div>

              {ftueStep < 3 ? (
                <button
                  onClick={() => setFtueStep(s => s + 1)}
                  className="px-4 py-1.5 text-[8px] font-heading font-bold uppercase tracking-wider text-black bg-[#a9ddd3] hover:bg-[#8accc0] transition-all flex items-center gap-1 cursor-pointer"
                >
                  Next Step <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    localStorage.setItem('rcade_ftue_dismissed', 'true');
                    setShowFTUE(false);
                  }}
                  className="px-4 py-1.5 text-[8px] font-heading font-bold uppercase tracking-widest text-black bg-green-500 hover:bg-green-600 shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all"
                >
                  Acknowledge & Play
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── XP Bar Section ────────────────────────────────── */}
      <div className="mb-8 bg-[#070707] border border-zinc-805 p-6 relative rounded shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Glow corner decorations */}
        <div className="absolute top-0 left-0 w-2 h-[1px] bg-[#a9ddd3]" />
        <div className="absolute top-0 left-0 w-[1px] h-2 bg-[#a9ddd3]" />
        <div className="absolute bottom-0 right-0 w-2 h-[1px] bg-[#a9ddd3]" />
        <div className="absolute bottom-0 right-0 w-[1px] h-2 bg-[#a9ddd3]" />

        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <div className="space-y-1">
            <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-[#a9ddd3] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#a9ddd3] animate-pulse" /> ON-CHAIN PROGRESSION XP
            </h4>
            <p className="text-[10px] font-mono text-zinc-400">
              Clear sequential Neon Snake levels to mint progression NFTs. Every contiguous NFT clears 100 XP.
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-zinc-500 uppercase tracking-widest text-[9px]">Rank Progress:</span>
            <span className="text-white font-bold">
              {((dbUser?.effectiveProgressionLevel ?? 0) * 100).toLocaleString()} <span className="text-zinc-500 font-normal">/ 1,000 XP</span>
            </span>
            <span className="text-[9px] font-heading font-black text-black px-2 py-0.5 rounded bg-[#a9ddd3] shadow-[0_0_10px_rgba(169,221,211,0.4)]">
              LEVEL {dbUser?.effectiveProgressionLevel ?? 0}
            </span>
          </div>
        </div>

        {/* The XP Bar */}
        <div className="relative h-4 bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden flex items-center p-0.5">
          <div 
            className="h-full rounded-xs transition-all duration-1000 ease-out relative"
            style={{ 
              width: `${Math.max(2, Math.min(100, ((dbUser?.effectiveProgressionLevel ?? 0) / 10) * 100))}%`,
              background: 'linear-gradient(90deg, #a9ddd3 0%, rgba(169,221,211,0.6) 100%)',
              boxShadow: '0 0 10px rgba(169,221,211,0.5)'
            }}
          >
            {/* Glossy sheen overlay on the filled bar */}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0)_100%)] animate-pulse" />
          </div>
          
          {/* Subtle notch segments representing level divisions */}
          <div className="absolute inset-0 flex justify-between pointer-events-none px-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div 
                key={i} 
                className="h-full w-[1px] bg-zinc-900/60 z-10 first:opacity-0 last:opacity-0" 
                style={{ left: `${(i + 1) * 10}%` }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center mt-3 font-mono text-[9px] text-zinc-500">
          <span>LVL 0 (RECRUIT)</span>
          <span>LVL 5 (ELITE)</span>
          <span>LVL 10 (GRANDMASTER)</span>
        </div>
      </div>

      {/* ── QA Tester Debugger Switch & Panel ─────────────────────────── */}
      {mounted && (
        <div className="mb-6 flex justify-between items-center gap-4">
          <div>
            <button 
              onClick={() => {
                setShowFTUE(true);
                setFtueStep(0);
              }}
              className="text-[9px] font-heading font-bold uppercase tracking-[0.2em] text-zinc-500 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-[#a9ddd3]" /> [ OPEN ONBOARDING GUIDE ]
            </button>
          </div>
          
          <button 
            onClick={() => {
              const next = !showQAPanel;
              setShowQAPanel(next);
              if (next) {
                fetchEthBalance();
                fetchDiagnostics();
              }
            }}
            className="text-[9px] font-heading font-bold uppercase tracking-[0.2em] px-3 py-1.5 border transition-all cursor-pointer flex items-center gap-1.5"
            style={{
              borderColor: showQAPanel ? '#22d3ee' : '#27272a',
              color: showQAPanel ? '#22d3ee' : '#71717a',
              background: showQAPanel ? 'rgba(34,211,238,0.05)' : 'transparent',
              boxShadow: showQAPanel ? '0 0 10px rgba(34,211,238,0.15)' : 'none'
            }}
          >
            <Cpu className="w-3.5 h-3.5" /> 
            {showQAPanel ? '[ ALPHA CONSOLE: ONLINE ]' : '[ ALPHA CONSOLE: OFFLINE ]'}
          </button>
        </div>
      )}

      {/* QA Retro Diagnostics Matrix */}
      {mounted && showQAPanel && (
        <div className="mb-8 border border-cyan-500/25 bg-black p-5 relative font-mono text-[9px] rounded">
          <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(0,255,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
          
          <div className="absolute top-0 left-0 w-2 h-[1px] bg-cyan-400" />
          <div className="absolute top-0 left-0 w-[1px] h-2 bg-cyan-400" />

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-3 border-b border-zinc-900 gap-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-400 font-bold uppercase tracking-wider">// ALPHA TESTER CONTROL CENTER //</span>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button 
                onClick={handleForceSyncProgression}
                disabled={isSyncingProgression}
                className="flex-1 md:flex-none px-3 py-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-black font-heading font-black text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSyncingProgression ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Force Sync & Recalc
              </button>
              <button 
                onClick={() => {
                  fetchEthBalance();
                  fetchDiagnostics();
                }}
                disabled={isFetchingDiagnostics}
                className="flex-1 md:flex-none px-3 py-1 border border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all uppercase tracking-wider text-[8px] cursor-pointer"
              >
                {isFetchingDiagnostics ? 'Polling...' : 'Run Diagnostics'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
            {/* Col 1: Wallet Diagnostics */}
            <div className="space-y-3">
              <div className="font-bold text-zinc-500 border-b border-zinc-900 pb-1 uppercase tracking-wider flex items-center gap-1">
                <Wallet className="w-3 h-3" /> [1. USER IDENTITY & WEB3 WALLET]
              </div>
              <div className="space-y-1.5 text-zinc-400">
                <div className="flex justify-between">
                  <span>Privy User ID:</span>
                  <span className="text-white select-all">{user?.id || 'NO_AUTH'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Connected Wallet:</span>
                  <span className="text-white">{wallets[0]?.connectorType || 'EMBEDDED'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Wallet Address:</span>
                  <span className="text-white font-mono text-[8px] select-all">{user?.wallet?.address || 'NONE'}</span>
                </div>
                <div className="flex justify-between">
                  <span>ETH Gas Balance:</span>
                  <span className="text-cyan-400 font-bold">{ethBalance} ETH</span>
                </div>
                <div className="flex justify-between">
                  <span>RPC Network:</span>
                  <span className="text-green-400">Base Sepolia (84532)</span>
                </div>
              </div>
            </div>

            {/* Col 2: Telemetry & Indexer Status */}
            <div className="space-y-3">
              <div className="font-bold text-zinc-500 border-b border-zinc-900 pb-1 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3" /> [2. INDEXER & DB STATS]
              </div>
              {diagnosticsData ? (
                <div className="space-y-1.5 text-zinc-400">
                  <div className="flex justify-between">
                    <span>Overall Health:</span>
                    <span className={diagnosticsData.health === 'HEALTHY' ? 'text-green-400 font-bold' : 'text-red-400 font-bold animate-pulse'}>
                      {diagnosticsData.health}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Database Client:</span>
                    <span className={diagnosticsData.database?.status === 'HEALTHY' ? 'text-green-400' : 'text-red-400'}>
                      {diagnosticsData.database?.status} {diagnosticsData.database?.latencyMs ? `(${diagnosticsData.database.latencyMs}ms)` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Indexer Mode:</span>
                    <span className={diagnosticsData.indexer?.mode === 'WEBSOCKET' ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold animate-pulse'}>
                      {diagnosticsData.indexer?.mode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>RPC blockHeight:</span>
                    <span className="text-white font-bold">{diagnosticsData.rpc?.blockNumber ?? 'UNKNOWN'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>WS Reconnects / Failures:</span>
                    <span className="text-white">
                      {diagnosticsData.indexer?.metrics?.indexerReconnectCount ?? 0} / {diagnosticsData.indexer?.metrics?.websocketFailures ?? 0}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-zinc-500 py-4 flex items-center justify-center gap-1">
                  <Loader2 className="w-3 animate-spin" /> Querying telemetry...
                </div>
              )}
            </div>

            {/* Col 3: Diagnostics Console Logs & Reconciliation Auditor */}
            <div className="space-y-3">
              <div className="font-bold text-zinc-500 border-b border-zinc-900 pb-1 uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3 h-3" /> [3. REAL-TIME AUDITOR CONSOLE]
              </div>
              <div className="space-y-2">
                {/* Reconciliation Audit Check */}
                {(() => {
                  const calculatedProgression = currentProgression;
                  const dbProgression = dbUser?.effectiveProgressionLevel ?? 0;
                  const isMismatch = calculatedProgression !== dbProgression;
                  return (
                    <div 
                      className="p-2 border flex items-center justify-between gap-1.5"
                      style={{
                        background: isMismatch ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.05)',
                        borderColor: isMismatch ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.2)'
                      }}
                    >
                      <div>
                        <div className="text-[8px] text-zinc-500 uppercase">DB vs Local State Balance:</div>
                        <div className="text-[9px] font-bold text-white font-mono">
                          DB Lvl: {dbProgression} | Inventory Lvl: {calculatedProgression}
                        </div>
                      </div>
                      {isMismatch ? (
                        <span className="text-red-400 font-bold px-1 py-0.5 border border-red-500/40 text-[7px] animate-pulse">MISMATCH</span>
                      ) : (
                        <span className="text-green-400 font-bold text-[7px]">SYNCHRONIZED</span>
                      )}
                    </div>
                  );
                })()}

                {/* Console Log Terminal */}
                <div className="bg-[#050505] border border-zinc-900 p-2.5 h-[90px] overflow-y-auto font-mono text-[8px] text-zinc-400 space-y-1 scrollbar-none rounded">
                  {qaConsoleLogs.map((log, index) => (
                    <div key={index} className="leading-relaxed border-l-2 border-cyan-500/30 pl-1.5">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border mb-8">
        {[
          { icon: Star,       label: 'Progression Level',  value: (dbUser?.effectiveProgressionLevel ?? 0) + 1, suffix: '' },
          { icon: Trophy,     label: 'High Score',          value: dbUser?.highestScore || 0, suffix: 'pts' },
          { icon: TrendingUp, label: 'Best Combo',          value: `x${dbUser?.highestCombo?.toFixed(1) || '1.0'}`, suffix: '' },
          { icon: Package,    label: 'On-Chain Assets',     value: inventory.length, suffix: '' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-bg-card px-5 py-5 flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(169,221,211,0.08)', border: '1px solid rgba(169,221,211,0.2)' }}>
                <Icon className="w-4 h-4" style={{ color: '#a9ddd3' }} />
              </div>
              <div>
                <p className="text-[9px] font-heading tracking-[0.15em] text-text-muted uppercase">{s.label}</p>
                <p className="font-heading font-black text-2xl text-white leading-tight">{s.value}<span className="text-xs text-text-muted ml-1">{s.suffix}</span></p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Section tabs ───────────────────────────────────── */}
      <div className="flex mb-6 overflow-x-auto whitespace-nowrap scrollbar-none" style={{ borderBottom: '1px solid #1f1f1f', WebkitOverflowScrolling: 'touch' }}>
        {(['vault', 'leaderboard'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveSection(tab)}
            className="px-6 py-3 text-[10px] font-heading font-bold tracking-[0.15em] uppercase transition-all flex-shrink-0 cursor-pointer"
            style={{ color: activeSection === tab ? '#a9ddd3' : '#444', borderBottom: activeSection === tab ? '2px solid #a9ddd3' : '2px solid transparent', marginBottom: '-1px' }}
          >{tab === 'vault' ? `Reward Vault (${preparedRewards.length + inventory.length})` : `Leaderboard (${leaderboards.length})`}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          VAULT SECTION
      ══════════════════════════════════════════════════════ */}
      {activeSection === 'vault' && (
        <div>
          {preparedRewards.length === 0 && inventory.length === 0 ? (
            <div className="py-20 text-center" style={{ border: '1px dashed #1f1f1f' }}>
              <Award className="w-10 h-10 text-text-muted mx-auto mb-4" />
              <p className="font-heading text-xs text-text-muted uppercase tracking-widest mb-4">No rewards yet</p>
              <Link href="/play" className="btn-primary text-[10px] px-6 py-3">Play to Earn</Link>
            </div>
          ) : (
            <div>
              {/* Claimable NFTs */}
              {preparedRewards.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1.5 h-4" style={{ background: '#a9ddd3' }} />
                    <h3 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white">Claimable NFTs</h3>
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[9px] font-heading text-text-muted">{preparedRewards.length} pending</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {preparedRewards.map(reward => {
                      const parts = reward.levelId.split('-');
                      const levelNum = parts[parts.length - 1];
                      const gameSlug = parts.slice(0, -1).join('-');
                      
                      let gameName = 'Neon Snake';
                      if (gameSlug === 'cyber-runner') gameName = 'Cyber Runner';
                      else if (gameSlug === 'void-arena') gameName = 'Void Arena';
                      else if (gameSlug === 'pixel-heist') gameName = 'Pixel Heist';
                      else if (gameSlug === 'space-impact') gameName = 'Space Impact';
                      else if (gameSlug === 'sudoku') gameName = 'Sudoku Matrix';

                      return (
                        <div key={reward.id} className="p-4 flex flex-col items-center text-center"
                          style={{ background: '#0d0d0d', border: `1px solid ${RARITY_BORDER[reward.rarity]}` }}>
                          <div className="text-2xl font-heading font-black mb-1" style={{ color: RARITY_COLOR[reward.rarity] }}>{reward.rarity.charAt(0)}</div>
                          <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest leading-none mb-1">{gameName}</div>
                          <div className="text-[9px] font-heading text-text-muted tracking-wider mb-0.5">LVL {levelNum}</div>
                          <div className="text-[8px] font-heading text-text-muted/60 mb-3 uppercase">{reward.rarity}</div>
                          <button onClick={() => handleMintNFT(reward.id)} disabled={mintingId === reward.id}
                            className="w-full py-2 text-[9px] font-heading font-bold uppercase tracking-widest flex items-center justify-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
                            style={{ background: mintingId === reward.id ? 'transparent' : '#a9ddd3', color: mintingId === reward.id ? '#a9ddd3' : '#000', border: '1px solid #a9ddd3' }}
                          >{mintingId === reward.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mint'}</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* On-chain assets — table view */}
              {inventory.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1.5 h-4" style={{ background: '#444' }} />
                    <h3 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white">On-Chain Assets</h3>
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[9px] font-heading text-text-muted">{inventory.length} items</span>
                  </div>
                  <div style={{ border: '1px solid #1f1f1f' }}>
                    {/* Table header */}
                    <div className="grid grid-cols-12 px-4 py-2.5" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                      {['Asset', 'Rarity', 'Qty', 'Status', ''].map((h, i) => (
                        <div key={`inv-header-${i}-${h}`} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${h === 'Asset' ? 'col-span-3' : h === '' ? 'col-span-3 text-right' : 'col-span-2'}`}>{h}</div>
                      ))}
                    </div>
                    {inventory.map((nft, i) => {
                      const isCore = nft.level <= (dbUser?.effectiveProgressionLevel ?? 0);
                      return (
                        <div key={nft.id} className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors"
                          style={{ borderBottom: i < inventory.length - 1 ? '1px solid #141414' : 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Asset */}
                          <div className="col-span-3 flex items-center gap-3">
                            {(() => {
                              const IconComponent = GAME_ICON_MAP[nft.gameIcon] || Zap;
                              return (
                                <div className="w-9 h-9 flex flex-col items-center justify-center border relative"
                                  style={{ 
                                    background: 'rgba(169,221,211,0.05)', 
                                    borderColor: RARITY_BORDER[nft.rarity], 
                                    color: RARITY_COLOR[nft.rarity] 
                                  }}
                                >
                                  <IconComponent className="w-4 h-4 opacity-80" />
                                  <div className="absolute bottom-0.5 right-0.5 text-[8px] font-heading font-black leading-none opacity-40">
                                    {nft.rarity.charAt(0)}
                                  </div>
                                </div>
                              );
                            })()}
                            <div>
                              <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest leading-none mb-1">
                                {nft.gameName}
                              </div>
                              <div className="font-heading text-xs font-bold text-white">Level {nft.level}</div>
                              <div className="text-[8px] font-mono text-text-muted">{nft.tokenId.toString().slice(0, 8)}...</div>
                            </div>
                          </div>
                          {/* Rarity */}
                          <div className="col-span-2">
                            <span className="text-[9px] font-heading font-bold uppercase" style={{ color: RARITY_COLOR[nft.rarity] }}>{nft.rarity}</span>
                          </div>
                          {/* Qty */}
                          <div className="col-span-2">
                            <span className="font-heading font-bold text-white text-sm">x{nft.amount}</span>
                          </div>
                          {/* Status */}
                          <div className="col-span-2 flex items-center gap-1.5">
                            {isCore
                              ? <><ShieldAlert className="w-3 h-3 text-amber" /><span className="text-[8px] font-heading text-amber uppercase">Core</span></>
                              : <span className="text-[8px] font-heading text-text-muted uppercase">Available</span>
                            }
                          </div>
                          {/* Actions */}
                          <div className="col-span-3 flex justify-end gap-2">
                            <button onClick={() => openTransferModal(nft)}
                              className="px-3 py-2 text-[9px] font-heading font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                              style={{ color: '#888', border: '1px solid #1f1f1f', background: 'transparent' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#a9ddd3'; (e.currentTarget as HTMLElement).style.color = '#a9ddd3'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1f1f1f'; (e.currentTarget as HTMLElement).style.color = '#888'; }}
                            >
                              <Send className="w-3 h-3" /> Transfer
                            </button>
                            <Link href="/marketplace" className="px-3 py-2 text-[9px] font-heading font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                              style={{ color: '#a9ddd3', border: '1px solid rgba(169,221,211,0.35)', background: 'transparent' }}>
                              Sell
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          LEADERBOARD SECTION
      ══════════════════════════════════════════════════════ */}
      {activeSection === 'leaderboard' && (
        <div style={{ border: '1px solid #1f1f1f' }}>
          {leaderboards.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase">No runs recorded yet.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 px-4 py-2.5" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                {['Rank', 'Player', 'Score'].map((h, i) => (
                  <div key={`lb-header-${i}-${h}`} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-2' : i === 1 ? 'col-span-7' : 'col-span-3 text-right'}`}>{h}</div>
                ))}
              </div>
              {leaderboards.map((lb, i) => (
                <div key={lb.id} className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors"
                  style={{ borderBottom: i < leaderboards.length - 1 ? '1px solid #141414' : 'none', background: i === 0 ? 'rgba(245,158,11,0.03)' : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                  onMouseLeave={e => (e.currentTarget.style.background = i === 0 ? 'rgba(245,158,11,0.03)' : 'transparent')}
                >
                  {/* Rank */}
                  <div className="col-span-2">
                    <span className="font-heading font-black text-base"
                      style={{ color: i === 0 ? '#f59e0b' : i === 1 ? '#d4d4d4' : i === 2 ? '#cd7c2f' : '#333' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                  </div>
                  {/* Player */}
                  <div className="col-span-7">
                    <span className="font-mono text-xs text-[#e8e3d5] opacity-80">
                      {lb.wallet ? `${lb.wallet.slice(0, 10)}...${lb.wallet.slice(-6)}` : lb.id.slice(0, 10)}
                    </span>
                    {lb.wallet?.toLowerCase() === dbUser?.wallet?.toLowerCase() && (
                      <span className="ml-2 text-[8px] font-heading uppercase tracking-wider px-1.5 py-0.5" style={{ color: '#a9ddd3', border: '1px solid rgba(169,221,211,0.3)' }}>You</span>
                    )}
                  </div>
                  {/* Score */}
                  <div className="col-span-3 text-right">
                    <span className="font-heading font-black text-base" style={{ color: i === 0 ? '#f59e0b' : '#a9ddd3' }}>{lb.highestScore}</span>
                    <span className="text-[9px] text-[#e8e3d5] opacity-60 font-heading ml-1">pts</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TRANSFER MODAL
      ══════════════════════════════════════════════════════ */}
      {transferModal.show && transferModal.nft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          <div className="max-w-md w-full p-6 relative" style={{ background: '#0d0d0d', border: '1px solid #1f1f1f', borderTop: '2px solid #a9ddd3' }}>
            <button onClick={closeTransferModal} className="absolute top-4 right-4 text-text-muted hover:text-white transition-colors"><X className="w-4 h-4" /></button>

            <h2 className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2">
              <Send className="w-4 h-4" style={{ color: '#a9ddd3' }} /> Transfer NFT
            </h2>

            {/* NFT preview */}
            <div className="flex items-center gap-3 p-3 mb-5" style={{ background: '#010101', border: '1px solid #1f1f1f' }}>
              <div className="w-10 h-10 flex items-center justify-center font-heading font-black text-lg flex-shrink-0" style={{ color: RARITY_COLOR[transferModal.nft.rarity], border: `1px solid ${RARITY_BORDER[transferModal.nft.rarity]}`, background: 'rgba(169,221,211,0.05)' }}>{transferModal.nft.rarity.charAt(0)}</div>
              <div>
                <div className="font-heading text-xs font-bold text-white">Level {transferModal.nft.level} · {transferModal.nft.rarity}</div>
                <div className="text-[9px] font-heading text-text-muted uppercase tracking-wider">Owned: x{transferModal.nft.amount}</div>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Recipient Address</label>
                <input type="text" value={transferModal.recipient} onChange={e => setTransferModal(prev => ({ ...prev, recipient: e.target.value }))} placeholder="0x..." className="w-full px-3 py-2.5 text-xs text-white font-mono focus:outline-none transition-colors" style={{ background: '#010101', border: '1px solid #1f1f1f' }}
                  onFocus={e => { e.target.style.borderColor = '#a9ddd3'; }} onBlur={e => { e.target.style.borderColor = '#1f1f1f'; }} />
              </div>
              {transferModal.nft.amount > 1 && (
                <div>
                  <label className="block text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Amount: <span style={{ color: '#a9ddd3' }}>{transferModal.amount}</span></label>
                  <input type="range" min="1" max={transferModal.nft.amount} value={transferModal.amount} onChange={e => setTransferModal(prev => ({ ...prev, amount: parseInt(e.target.value) }))} className="w-full" style={{ accentColor: '#a9ddd3' }} />
                </div>
              )}
            </div>

            {/* Progression diff */}
            <div className="p-3 mb-5" style={{ background: '#010101', border: '1px solid #1f1f1f' }}>
              <h4 className="text-[9px] font-heading uppercase tracking-[0.2em] text-text-muted mb-3">Impact Preview</h4>
              <div className="flex items-center justify-between text-xs font-mono mb-3">
                <span className="text-text-muted">Level {transferModal.nft.level}</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">x{transferModal.nft.amount}</span>
                  <ArrowRight className="w-3 h-3 text-text-muted" />
                  <span className={transferModal.amount === transferModal.nft.amount ? 'text-red-400 font-bold' : 'text-white font-bold'}>x{transferModal.nft.amount - transferModal.amount}</span>
                </div>
              </div>
              {progressionDrops ? (
                <div className="p-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="text-[9px] font-heading uppercase tracking-wider text-red-400 font-bold">Progression Collapse Warning</span>
                  </div>
                  <p className="text-[9px] text-red-300 font-mono leading-relaxed">This transfer breaks your progression chain. Higher levels will be locked.</p>
                  <div className="flex justify-between text-[9px] font-mono mt-2 pt-2" style={{ borderTop: '1px solid rgba(239,68,68,0.2)' }}>
                    <span className="text-text-muted">Current: <strong className="text-white">Lvl {currentProgression + 1}</strong></span>
                    <span className="text-red-400 font-bold">After: Lvl {projectedProgression + 1}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" style={{ boxShadow: '0 0 4px #22c55e' }} />
                  <span className="text-[9px] font-heading text-green-400 uppercase tracking-widest">No progression impact</span>
                </div>
              )}
            </div>

            {/* Safety confirmation */}
            {requireExplicitConfirmation && (
              <div className="mb-5">
                <label className="block text-[9px] font-heading tracking-[0.2em] uppercase mb-1.5" style={{ color: '#ff4500' }}>Type TRANSFER to confirm</label>
                <input type="text" value={transferModal.confirmText} onChange={e => setTransferModal(prev => ({ ...prev, confirmText: e.target.value }))} placeholder="TRANSFER" className="w-full px-3 py-2.5 text-xs font-heading tracking-widest focus:outline-none" style={{ background: '#010101', border: '1px solid rgba(255,69,0,0.4)', color: '#ff4500' }} />
              </div>
            )}

            {transferModal.error && (
              <div className="mb-4 text-[9px] font-mono text-red-400 text-center py-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>{transferModal.error}</div>
            )}

            <div className="flex gap-3">
              <button onClick={closeTransferModal} className="flex-1 py-3 text-[9px] font-heading tracking-[0.2em] uppercase transition-all" style={{ color: '#888', border: '1px solid #1f1f1f', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#fff'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1f1f1f'; (e.currentTarget as HTMLElement).style.color = '#888'; }}
              >Cancel</button>
              <button onClick={handleTransferSubmit} disabled={transferringId !== null || (requireExplicitConfirmation && transferModal.confirmText !== 'TRANSFER') || !transferModal.recipient}
                className="flex-1 py-3 text-[9px] font-heading tracking-[0.2em] uppercase flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                style={{ background: '#a9ddd3', color: '#000' }}
              >{transferringId ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Ababilpay Top Up Modal ────────────────────────────────── */}
      <AnimatePresence>
        {showTopUpModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isCreatingIntent) setShowTopUpModal(false); }}
              className="absolute inset-0 bg-black/80 backdrop-filter backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[400px] bg-[#09090c] border border-zinc-800 p-6 shadow-2xl rounded-sm z-10 overflow-hidden"
            >
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />

              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#161616]">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-[#a9ddd3]" />
                  <span className="font-heading font-black text-sm text-white uppercase tracking-wider">Top Up Wallet</span>
                </div>
                <button
                  disabled={isCreatingIntent}
                  onClick={() => setShowTopUpModal(false)}
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-colors disabled:opacity-30 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[10px] text-text-secondary leading-relaxed mb-6 font-heading tracking-wide">
                Purchase Base Sepolia testnet ETH to pay for NFT wagers, marketplace purchases, and level progression mints.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <span className="text-[9px] font-heading tracking-widest text-text-muted uppercase block mb-2">Select Amount</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { usdc: "5", eth: "0.025" },
                      { usdc: "10", eth: "0.050" },
                      { usdc: "20", eth: "0.100" }
                    ].map(preset => (
                      <button
                        key={preset.usdc}
                        type="button"
                        onClick={() => setTopUpAmount(preset.usdc)}
                        className={`py-2 px-1 text-center border font-heading font-bold rounded-sm transition-all cursor-pointer ${
                          topUpAmount === preset.usdc
                            ? 'border-[#a9ddd3] bg-[#a9ddd3]/5 text-white'
                            : 'border-[#161616] bg-[#040404] text-zinc-400 hover:border-zinc-800'
                        }`}
                      >
                        <span className="block text-xs">${preset.usdc} USDC</span>
                        <span className="text-[8px] text-zinc-500 font-mono font-medium block mt-0.5">{preset.eth} ETH</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-heading tracking-widest text-text-muted uppercase block mb-2">Custom Amount (USDC)</span>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      disabled={isCreatingIntent}
                      className="w-full bg-[#040404] border border-[#161616] focus:border-[#a9ddd3] text-white text-xs font-mono px-3 py-2 rounded-sm outline-none transition-all"
                      placeholder="Enter amount..."
                    />
                    <span className="absolute right-3 top-2.5 text-[8px] font-heading font-black text-text-muted uppercase">USDC</span>
                  </div>
                  <span className="text-[8px] text-text-muted font-heading tracking-wide mt-1 block">
                    Payout Rate: ~{(Number(topUpAmount || 0) * 0.005).toFixed(4)} Base Sepolia ETH
                  </span>
                </div>
              </div>

              <button
                onClick={handleCreateIntent}
                disabled={isCreatingIntent || !topUpAmount || Number(topUpAmount) <= 0}
                className="w-full btn-primary text-xs py-3 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isCreatingIntent ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Coins className="w-4 h-4 fill-black" />
                    Pay with Ababilpay
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Verification Loader Overlay ────────────────────────────────── */}
      {isVerifyingPayment && (
        <div className="fixed inset-0 z-[150] bg-black/95 backdrop-filter backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn">
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
          <div className="w-12 h-12 border-2 border-t-transparent animate-spin mb-4" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
          <h2 className="font-heading font-black text-lg text-white uppercase tracking-widest mb-1">Verifying Top Up</h2>
          <p className="text-zinc-500 font-mono text-[9px] uppercase tracking-wider">Settling USDC intent via Ababilpay checkouts...</p>
        </div>
      )}

    </div>
  );
}
