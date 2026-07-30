'use client';

import Link from 'next/link';
import { usePrivy, useWallets, useExportWallet, useFundWallet } from '@privy-io/react-auth';
import { useEffect, useState, useMemo } from 'react';
import { 
  ShoppingBag, Tag, Trash2, ShieldAlert, ExternalLink, Loader2, Wallet,
  Calendar, Layers, Coins, BadgeAlert, UserCheck, TrendingUp,
  History, AlertTriangle, RefreshCw, X, CheckCircle2, Info, Zap,
  Cpu, Trophy, Gamepad2, Swords, Grid, Search, ChevronDown, ChevronUp,
  Heart, Settings, Bell, HelpCircle, ArrowLeft, ArrowRight, Filter,
  SlidersHorizontal, Copy, Check, Key, Plus
} from 'lucide-react';
import { baseSepolia } from 'viem/chains';
import { formatEther, parseEther } from 'viem';
import { ApiService } from '@/services/api';
import { syncQueue } from '@/services/sync-queue';
import { AnalyticsService } from '@/services/analytics';
import { 
  publicClient, CONTRACT_ADDRESS, MARKETPLACE_ADDRESS,
  RCADE_ERC1155_ABI, RCADE_MARKETPLACE_ABI 
} from '@/lib/web3';
import { toast } from '@/components/ui/toast-provider';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';

const GAME_ICON_MAP: Record<string, any> = {
  Zap: Zap,
  Cpu: Cpu,
  Layers: Layers,
  Trophy: Trophy,
  Gamepad2: Gamepad2,
  Swords: Swords,
  Grid: Grid
};


type TxState = 'idle' | 'signing' | 'pending' | 'success' | 'failed';

/* ─── rarity helpers ────────────────────────────────────────── */
const RARITY_COLOR: Record<string, string> = {
  Legendary: '#f59e0b', Epic: '#a9ddd3', Rare: '#fb923c', Common: '#6b6b6b',
};
const RARITY_BORDER: Record<string, string> = {
  Legendary: 'rgba(245,158,11,0.5)', Epic: 'rgba(169,221,211,0.5)',
  Rare: 'rgba(251,146,60,0.4)', Common: 'rgba(107,107,107,0.3)',
};

const FALLBACK_FEATURED: any[] = [
  {
    id: 'fallback-1',
    gameName: 'Void Arena',
    tokenId: '0x0000000000000000000000000000000000000000000000000000000000000001',
    rarity: 'Legendary',
    gameIcon: 'Zap',
    price: '1.25',
    gameSlug: 'void-arena',
    isFallback: true
  },
  {
    id: 'fallback-2',
    gameName: 'Cyber Runner',
    tokenId: '0x0000000000000000000000000000000000000000000000000000000000000002',
    rarity: 'Legendary',
    gameIcon: 'Cpu',
    price: '0.85',
    gameSlug: 'cyber-runner',
    isFallback: true
  },
  {
    id: 'fallback-3',
    gameName: 'Neon Snake',
    tokenId: '0x0000000000000000000000000000000000000000000000000000000000000003',
    rarity: 'Legendary',
    gameIcon: 'Layers',
    price: '2.10',
    gameSlug: 'neon-snake',
    isFallback: true
  }
];

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

function Marketplace() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
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
          return_path: '/marketplace'
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

  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'dashboard'>('buy');
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>('ALL');
  const [dashboardSubTab, setDashboardSubTab] = useState<'active' | 'sales' | 'purchases' | 'rewards' | 'progression' | 'reserved'>('active');
  const [listings, setListings] = useState<any[]>([]);
  const [isListingsLoading, setIsListingsLoading] = useState(false);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [ethBalance, setEthBalance] = useState<string>("0.00");
  const [selectedNft, setSelectedNft] = useState<any | null>(null);
  const [sellPrice, setSellPrice] = useState<string>("0.01");
  const [sellAmount, setSellAmount] = useState<number>(1);
  const [sellExpiryDays, setSellExpiryDays] = useState<number>(3);
  const [marketplaceFeeBps, setMarketplaceFeeBps] = useState<number>(250);
  const [isSyncing, setIsSyncing] = useState(false);
  const [preparedRewards, setPreparedRewards] = useState<any[]>([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [reservedInventory, setReservedInventory] = useState<any[]>([]);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isFetchingDiagnostics, setIsFetchingDiagnostics] = useState(false);

  // Per-listing or action transaction states
  const [listingTxStates, setListingTxStates] = useState<Record<string, TxState>>({});

  // New layout and filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('0');
  const [maxPrice, setMaxPrice] = useState<string>('10');
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['Buy Now']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [activeHeroIndex, setActiveHeroIndex] = useState<number>(0);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({
    games: true,
    categories: true,
    priceRange: true,
    rarity: true,
    status: true,
  });

  const toggleFilterSection = (section: string) => {
    setExpandedFilters(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const activeWallet = useMemo(() => wallets.find(w => w.address?.toLowerCase() === activeWalletAddress?.toLowerCase()), [wallets, activeWalletAddress]);
  
  const isNetworkMismatch = useMemo(() => { 
    if (!authenticated || !activeWallet) return false; 
    return activeWallet.chainId !== `eip155:${baseSepolia.id}`; 
  }, [authenticated, activeWallet]);

  const isWalletAccountMismatch = useMemo(() => { 
    if (!authenticated || !activeWalletAddress) return false; 
    return !activeWallet; 
  }, [authenticated, activeWallet, activeWalletAddress]);

  const isAnyTxActive = useMemo(() => {
    return Object.values(listingTxStates).some(s => s === 'signing' || s === 'pending');
  }, [listingTxStates]);

  const ensureCorrectChain = async (wallet: any) => {
    if (wallet.chainId !== `eip155:${baseSepolia.id}`) {
      toast.info('SWITCHING NETWORK', 'Requesting wallet to switch to Base Sepolia...');
      await wallet.switchChain(baseSepolia.id).catch(() => { 
        throw new Error("Please switch your wallet to Base Sepolia network to proceed."); 
      });
    }
  };

  const fetchListings = async () => {
    setIsListingsLoading(true);
    try {
      const res = await fetch('/api/marketplace/listings?status=ALL');
      if (res.ok) {
        const data = await res.json();
        const getRarity = (code: bigint) => { 
          if (code === 0n) return 'Common'; 
          if (code === 1n) return 'Rare'; 
          if (code === 2n) return 'Epic'; 
          if (code === 3n) return 'Legendary'; 
          return 'Common'; 
        };
        const formatted = data.listings.map((l: any) => {
          const tokenIdBig = BigInt(l.tokenId);
          const gameId = Number((tokenIdBig >> 224n) & 0xFFFFn) || 1; // Default to 1 (Neon Snake)
          const level = Number((tokenIdBig >> 176n) & 0xFFFFn);
          const rarityCode = (tokenIdBig >> 168n) & 0xFFn;
          const rarity = getRarity(rarityCode);

          let gameName = 'Neon Snake';
          let gameSlug = 'neon-snake';
          let gameIcon = 'Zap';

          if (gameId === 2) {
            gameName = 'Cyber Runner';
            gameSlug = 'cyber-runner';
            gameIcon = 'Cpu';
          } else if (gameId === 3) {
            gameName = 'Void Arena';
            gameSlug = 'void-arena';
            gameIcon = 'Layers';
          } else if (gameId === 4) {
            gameName = 'Pixel Heist';
            gameSlug = 'pixel-heist';
            gameIcon = 'Trophy';
          } else if (gameId === 5) {
            gameName = 'Space Impact';
            gameSlug = 'space-impact';
            gameIcon = 'Swords';
          } else if (gameId === 6) {
            gameName = 'Sudoku Matrix';
            gameSlug = 'sudoku';
            gameIcon = 'Grid';
          }

          return { 
            id: l.id, 
            listingHash: l.listingHash, 
            seller: l.seller, 
            buyer: l.buyer, 
            tokenId: l.tokenId, 
            amount: l.amount, 
            price: formatEther(BigInt(l.price)), 
            expiry: l.expiry, 
            nonce: l.nonce, 
            signature: l.signature, 
            status: l.status === 'ACTIVE' ? 'Active' : l.status === 'SOLD' ? 'Sold' : l.status === 'CANCELLED' ? 'Cancelled' : l.status === 'EXPIRED' ? 'Expired' : 'Invalid', 
            rarity, 
            level, 
            gameId,
            gameName,
            gameSlug,
            gameIcon,
            saleTxHash: l.saleTxHash, 
            createdBlockNumber: l.createdBlockNumber 
          };
        });
        setListings(formatted);
      }
    } catch (err) { 
      console.error("Failed to fetch listings:", err); 
      toast.error('QUERY FAILED', 'Could not fetch active listings from indexer.'); 
    } finally { 
      setIsListingsLoading(false); 
    }
  };

  const fetchEthBalance = async () => {
    if (!activeWalletAddress) return;
    try { 
      const balance = await publicClient.getBalance({ address: activeWalletAddress as `0x${string}` }); 
      setEthBalance(Number(formatEther(balance)).toFixed(4)); 
    } catch (err) { 
      console.error("Failed to fetch wallet balance:", err); 
    }
  };

  // Modern synchronizer utilizing Promise.all to force-update all layers simultaneously
  const forceSynchronizedRefresh = async (silent = false) => {
    if (!ready || !authenticated || !activeWalletAddress) return;
    
    return syncQueue.enqueue(async () => {
      if (!silent) setIsSyncing(true);
      
      try {
        if (!silent) {
          toast.info('REFRESHING STATE', 'Synchronizing progression, offers, and wallet balances...');
        }

        const prevLevel = dbUser?.effectiveProgressionLevel;

        await Promise.all([
          // 1. Sync backend DB with chain & retrieve usable inventory
          ApiService.fetchWithAuth('/api/marketplace/sync?force=true', { method: 'POST' }, getAccessToken)
            .then(async (res) => {
              if (res.ok) {
                const syncData = await res.json();
                if (syncData.inventory) {
                  setInventory(syncData.inventory);
                }
                if (syncData.reserved) {
                  setReservedInventory(syncData.reserved);
                }
                if (syncData.user) {
                  setDbUser(syncData.user);
                  
                  // Check if progression changed
                  if (prevLevel !== undefined && syncData.user.effectiveProgressionLevel !== prevLevel) {
                    AnalyticsService.track('PROGRESSION_CHANGED', activeWalletAddress, {
                      oldLevel: prevLevel,
                      newLevel: syncData.user.effectiveProgressionLevel
                    });
                  }
                }
              }
            }),
          // 2. Refresh native ETH balance
          fetchEthBalance(),
          // 3. Refresh off-chain active listing grid
          fetchListings(),
          // 4. Retrieve prepared rewards from Reward Vault
          ApiService.fetchWithAuth('/api/rewards/pending', {}, getAccessToken)
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                setPreparedRewards(data.rewards || []);
              }
            })
        ]);

        if (!silent) {
          toast.success('SYNCHRONIZED', 'All gaming progression and asset inventory successfully aligned.');
        }
      } catch (err: any) { 
        console.error("Synchronized refresh failed:", err); 
        if (!silent) {
          toast.error('SYNC TIMEOUT', 'Auto-recovery sequence queued on indexers.'); 
        }
      } finally { 
        setIsSyncing(false); 
      }
    });
  };

  const fetchInventoryAndConfig = async () => {
    if (!ready || !authenticated) return;
    setIsLoadingInventory(true);
    try {
      // 1. Fetch user inventory directly from fast DB endpoint first (<50ms)
      const histRes = await ApiService.fetchWithAuth('/api/rewards/history', {}, getAccessToken);
      if (histRes.ok) {
        const data = await histRes.json();
        if (data.rewards) {
          setInventory(data.rewards);
        }
      }

      if (MARKETPLACE_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        const fee = await publicClient.readContract({ 
          address: MARKETPLACE_ADDRESS as `0x${string}`, 
          abi: RCADE_MARKETPLACE_ABI, 
          functionName: 'marketplaceFeeBps' 
        });
        setMarketplaceFeeBps(Number(fee));
      }
    } catch (err) { 
      console.error("Failed to sync initial marketplace configuration:", err); 
    } finally { 
      setIsLoadingInventory(false);
      forceSynchronizedRefresh(true).catch(console.error);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  useEffect(() => { 
    if (ready && authenticated && activeWalletAddress) {
      fetchInventoryAndConfig(); 
    }
  }, [ready, authenticated, activeWalletAddress, wallets]);

  useEffect(() => {
    if (isWalletAccountMismatch && activeWalletAddress) {
      AnalyticsService.track('WALLET_MISMATCH_DETECTED', activeWalletAddress, {
        privyAddress: activeWalletAddress,
        extensionAddress: wallets[0]?.address
      });
    }
  }, [isWalletAccountMismatch, activeWalletAddress, wallets]);

  // Keep track of active tx state to recover from sudden disconnects
  useEffect(() => {
    if (authenticated && wallets.length > 0) return;
    if (isAnyTxActive) {
      setListingTxStates({});
      toast.info("Wallet disconnected mid-transaction. Restored local states.", "Cleaned pending operations.");
      forceSynchronizedRefresh(true);
    }
  }, [authenticated, wallets, isAnyTxActive]);

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
            await forceSynchronizedRefresh(true);
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

  const fetchDiagnostics = async () => {
    setIsFetchingDiagnostics(true);
    try {
      const res = await fetch('/api/admin/diagnose');
      if (res.ok) {
        const data = await res.json();
        setDiagnosticsData(data);
      }
    } catch (err) {
      console.error("Failed to fetch diagnostics:", err);
    } finally {
      setIsFetchingDiagnostics(false);
    }
  };

  useEffect(() => {
    if (showDevPanel) {
      fetchDiagnostics();
      const interval = setInterval(fetchDiagnostics, 10000); // refresh every 10s while open
      return () => clearInterval(interval);
    }
  }, [showDevPanel]);

  const buyableListings = useMemo(() => {
    return listings.filter(l => {
      const matchesStatusAndSeller = 
        (l.status === "Active" || l.status === "PendingPurchase") && 
        l.seller.toLowerCase() !== activeWalletAddress?.toLowerCase();
      if (!matchesStatusAndSeller) return false;
      if (selectedGameFilter !== 'ALL' && l.gameSlug !== selectedGameFilter) return false;
      
      // Search text filter
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesName = l.gameName.toLowerCase().includes(query);
        const matchesRarity = l.rarity.toLowerCase().includes(query);
        const matchesLevel = `level ${l.level}`.includes(query) || `lvl ${l.level}`.includes(query);
        if (!matchesName && !matchesRarity && !matchesLevel) return false;
      }
      
      // Price filters
      const priceVal = parseFloat(l.price);
      if (minPrice && priceVal < parseFloat(minPrice)) return false;
      if (maxPrice && priceVal > parseFloat(maxPrice)) return false;
      
      // Rarity filters
      if (selectedRarities.length > 0 && !selectedRarities.includes(l.rarity)) return false;

      // Status filters
      if (selectedStatus.length > 0) {
        const matchesBuyNow = selectedStatus.includes('Buy Now');
        // All active on-chain listing offers are considered "Buy Now"
        if (!matchesBuyNow) return false;
      }

      return true;
    });
  }, [listings, activeWalletAddress, selectedGameFilter, searchTerm, minPrice, maxPrice, selectedRarities, selectedStatus]);

  const featuredPool = useMemo(() => {
    if (buyableListings.length === 0) return FALLBACK_FEATURED;
    const legendary = buyableListings.filter(l => l.rarity === 'Legendary');
    return legendary.length > 0 ? legendary : buyableListings;
  }, [buyableListings]);

  const featuredListing = useMemo(() => {
    if (featuredPool.length === 0) return null;
    const index = Math.abs(activeHeroIndex) % featuredPool.length;
    return featuredPool[index];
  }, [featuredPool, activeHeroIndex]);

  // Auto-scroll featured carousel
  useEffect(() => {
    if (activeTab !== 'buy' || featuredPool.length <= 1) return;
    const interval = setInterval(() => {
      setActiveHeroIndex(prev => (prev + 1) % featuredPool.length);
    }, 6000); // cycle every 6 seconds
    return () => clearInterval(interval);
  }, [activeTab, featuredPool.length]);

  // Reset activeHeroIndex when pool changes
  useEffect(() => {
    setActiveHeroIndex(0);
  }, [featuredPool.length]);

  const traderActiveListings = useMemo(() => {
    return listings.filter(l => 
      l.seller.toLowerCase() === activeWalletAddress?.toLowerCase() && 
      (l.status === "Active" || l.status === "Syncing")
    );
  }, [listings, activeWalletAddress]);

  const traderSalesListings = useMemo(() => {
    return listings.filter(l => 
      l.seller.toLowerCase() === activeWalletAddress?.toLowerCase() && 
      l.status === "Sold"
    );
  }, [listings, activeWalletAddress]);

  const traderPurchasesListings = useMemo(() => {
    return listings.filter(l => 
      l.buyer?.toLowerCase() === activeWalletAddress?.toLowerCase() && 
      l.status === "Sold"
    );
  }, [listings, activeWalletAddress]);

  const dashboardStats = useMemo(() => ({
    activeOffers: traderActiveListings.length,
    totalVolumeEarned: traderSalesListings.reduce((sum, item) => sum + parseFloat(item.price), 0).toFixed(4),
    totalAssetsPurchased: traderPurchasesListings.length
  }), [traderActiveListings, traderSalesListings, traderPurchasesListings]);

  /* ─── CREATE LISTING ───────────────────────────────────────── */
  const handleCreateListing = async () => {
    if (!selectedNft || !activeWallet) return;
    if (isNetworkMismatch) { 
      toast.error('Wrong network.', 'Please switch to Base Sepolia.'); 
      return; 
    }
    if (isWalletAccountMismatch) { 
      toast.error('Wallet mismatch detected.', 'Please reconnect the authenticated wallet.'); 
      return; 
    }

    const tempId = `temp-sync-${Date.now()}`;
    const originalListings = listings;
    
    setListingTxStates(prev => ({ ...prev, list: 'signing' }));
    const toastId = toast.loading("Awaiting Signature", "Confirm in Wallet...");

    try {
      await ensureCorrectChain(activeWallet);
      
      const { createWalletClient, custom } = await import('viem');
      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        account: activeWallet.address as `0x${string}`, 
        chain: baseSepolia, 
        transport: custom(provider) 
      });
      
      // Parallelize contract reads for userNonces and operator approval state (<100ms)
      const [sellerNonce, isApproved] = await Promise.all([
        publicClient.readContract({ 
          address: MARKETPLACE_ADDRESS as `0x${string}`, 
          abi: RCADE_MARKETPLACE_ABI, 
          functionName: 'userNonces', 
          args: [activeWallet.address as `0x${string}`] 
        }),
        publicClient.readContract({ 
          address: CONTRACT_ADDRESS as `0x${string}`, 
          abi: RCADE_ERC1155_ABI, 
          functionName: 'isApprovedForAll', 
          args: [activeWallet.address as `0x${string}`, MARKETPLACE_ADDRESS as `0x${string}`] 
        })
      ]);
      
      const priceWei = parseEther(sellPrice);
      const expiryUnix = Math.floor(Date.now() / 1000) + (86400 * sellExpiryDays);
      const uniqueListingNonce = sellerNonce + BigInt(Math.floor(Math.random() * 1000000) + 1);

      // Audit operator approval states
      if (!isApproved) {
        toast.loading("Confirm in Wallet...", "Approving marketplace contract operator in wallet...", { id: toastId });
        const encodeData = await import('viem').then(m => m.encodeFunctionData);
        const data = encodeData({ 
          abi: RCADE_ERC1155_ABI, 
          functionName: 'setApprovalForAll', 
          args: [MARKETPLACE_ADDRESS as `0x${string}`, true] 
        });
        
        const txHash = await walletClient.sendTransaction({ 
          account: activeWallet.address as `0x${string}`, 
          to: CONTRACT_ADDRESS as `0x${string}`, 
          data, 
          value: 0n, 
          chain: baseSepolia 
        });
        
        toast.loading("Waiting for Confirmation...", "Transaction Pending... confirming operator approval on Base Sepolia", { id: toastId });
        setListingTxStates(prev => ({ ...prev, list: 'pending' }));
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        toast.success("Approved", "Marketplace authorized successfully!");
      }

      toast.loading("Awaiting Signature", "Please sign typed data payload in wallet extension...", { id: toastId });

      let signature: string;
      const typedDataString = JSON.stringify({
        domain: { 
          name: 'RCADEMarketplace', 
          version: '1', 
          chainId: baseSepolia.id, 
          verifyingContract: MARKETPLACE_ADDRESS 
        }, 
        types: { 
          EIP712Domain: [
            { name: 'name', type: 'string' }, 
            { name: 'version', type: 'string' }, 
            { name: 'chainId', type: 'uint256' }, 
            { name: 'verifyingContract', type: 'address' }
          ],
          Listing: [
            { name: 'seller', type: 'address' }, 
            { name: 'tokenId', type: 'uint256' }, 
            { name: 'amount', type: 'uint256' }, 
            { name: 'price', type: 'uint256' }, 
            { name: 'expiry', type: 'uint256' }, 
            { name: 'nonce', type: 'uint256' }
          ] 
        }, 
        primaryType: 'Listing', 
        message: { 
          seller: activeWallet.address, 
          tokenId: selectedNft.tokenId.toString(), 
          amount: sellAmount.toString(), 
          price: priceWei.toString(), 
          expiry: expiryUnix.toString(), 
          nonce: uniqueListingNonce.toString() 
        } 
      });

      try {
        signature = await provider.request({
          method: 'eth_signTypedData_v4',
          params: [activeWallet.address, typedDataString]
        });
      } catch (err: any) {
        signature = await walletClient.signTypedData({ 
          domain: { 
            name: 'RCADEMarketplace', 
            version: '1', 
            chainId: baseSepolia.id, 
            verifyingContract: MARKETPLACE_ADDRESS as `0x${string}` 
          }, 
          types: { 
            Listing: [
              { name: 'seller', type: 'address' }, 
              { name: 'tokenId', type: 'uint256' }, 
              { name: 'amount', type: 'uint256' }, 
              { name: 'price', type: 'uint256' }, 
              { name: 'expiry', type: 'uint256' }, 
              { name: 'nonce', type: 'uint256' }
            ] 
          }, 
          primaryType: 'Listing', 
          message: { 
            seller: activeWallet.address as `0x${string}`, 
            tokenId: BigInt(selectedNft.tokenId), 
            amount: BigInt(sellAmount), 
            price: priceWei, 
            expiry: BigInt(expiryUnix), 
            nonce: uniqueListingNonce 
          } 
        });
      }

      // INSTANTLY Inject optimistic listing card marked as Syncing into trader's dashboard
      const tempListing = { 
        id: tempId, 
        listingHash: 'pending', 
        seller: activeWallet.address, 
        tokenId: selectedNft.tokenId.toString(), 
        amount: sellAmount, 
        price: sellPrice, 
        expiry: expiryUnix, 
        nonce: uniqueListingNonce.toString(), 
        signature, 
        status: 'Syncing', 
        rarity: selectedNft.rarity, 
        level: selectedNft.level,
        isOptimistic: true
      };
      
      setListings(prev => [tempListing, ...prev]);
      setActiveTab('dashboard'); 
      setDashboardSubTab('active');
      setSelectedNft(null);

      toast.loading("Waiting for Confirmation...", "Syncing off-chain signatures to databases...", { id: toastId });
      setListingTxStates(prev => ({ ...prev, list: 'pending' }));

      const listPayload = { 
        listing: { 
          seller: activeWallet.address, 
          tokenId: selectedNft.tokenId.toString(), 
          amount: sellAmount.toString(), 
          price: priceWei.toString(), 
          expiry: expiryUnix.toString(), 
          nonce: uniqueListingNonce.toString() 
        }, 
        signature, 
        chainId: baseSepolia.id 
      };

      const res = await ApiService.fetchWithAuth('/api/marketplace/list', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(listPayload) 
      }, getAccessToken);

      if (!res.ok) { 
        const errData = await res.json(); 
        throw new Error(errData.error || 'Failed to publish listing to database'); 
      }

      toast.success("Listing Created", `Asset listed off-chain successfully.`);
      setListingTxStates(prev => ({ ...prev, list: 'success' }));
      AnalyticsService.track('LISTING_CREATED', activeWalletAddress, { tokenId: selectedNft.tokenId, price: sellPrice, amount: sellAmount });
      await forceSynchronizedRefresh(true);

    } catch (err: any) { 
      console.error("Listing creation failed:", err); 
      setListings(originalListings);
      toast.error('Listing Failed', err.message || 'Signature rejected or validation failed.'); 
      setListingTxStates(prev => ({ ...prev, list: 'failed' }));
      AnalyticsService.track('TRANSACTION_FAILED', activeWalletAddress, { action: 'list', error: err.message || err });
      await forceSynchronizedRefresh(true); // Self-healing
    } finally { 
      toast.dismiss(toastId);
    }
  };

  /* ─── BUY LISTING ──────────────────────────────────────────── */
  const handleBuyListing = async (listing: any) => {
    if (!activeWallet) { login(); return; }
    if (isNetworkMismatch) { 
      toast.error('Wrong network.', 'Please switch to Base Sepolia.'); 
      return; 
    }
    if (isWalletAccountMismatch) { 
      toast.error('Wallet mismatch detected.', 'Please reconnect the authenticated wallet.'); 
      return; 
    }
    if (isAnyTxActive) return; // prevent double submit

    const originalListings = listings;
    
    // Instantly fade out listing from active grid & disable interactions immediately
    setListings(prev => prev.map(l => l.id === listing.id ? { ...l, pendingPurchase: true, status: 'PendingPurchase' } : l));
    setListingTxStates(prev => ({ ...prev, [listing.id]: 'signing' }));
    
    const toastId = toast.loading("Confirm in Wallet...", "Awaiting wallet signature to purchase NFT...");

    try {
      await ensureCorrectChain(activeWallet);
      
      const { encodeFunctionData, createWalletClient, custom } = await import('viem');
      const userBalance = await publicClient.getBalance({ address: activeWallet.address as `0x${string}` });
      const priceWei = parseEther(listing.price);
      const estGas = parseEther("0.002");

      if (userBalance < (priceWei + estGas)) { 
        throw new Error(`Insufficient funds. Asset costs ${listing.price} ETH + gas.`); 
      }

      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        account: activeWallet.address as `0x${string}`, 
        chain: baseSepolia, 
        transport: custom(provider) 
      });

      const listingTuple = { 
        seller: listing.seller as `0x${string}`, 
        tokenId: BigInt(listing.tokenId), 
        amount: BigInt(listing.amount), 
        price: priceWei, 
        expiry: BigInt(listing.expiry), 
        nonce: BigInt(listing.nonce) 
      };

      toast.loading("Confirm in Wallet...", "Waiting for blockchain transaction approval in wallet extension...", { id: toastId });

      const data = encodeFunctionData({ 
        abi: RCADE_MARKETPLACE_ABI, 
        functionName: 'executeSale', 
        args: [listingTuple, listing.signature] 
      });

      const txHash = await walletClient.sendTransaction({ 
        account: activeWallet.address as `0x${string}`, 
        to: MARKETPLACE_ADDRESS as `0x${string}`, 
        data, 
        value: priceWei, 
        chain: baseSepolia 
      });

      setListingTxStates(prev => ({ ...prev, [listing.id]: 'pending' }));
      toast.loading("Waiting for Confirmation...", "Transaction broadcasted! Waiting for block confirmation...", { id: toastId });

      // Instantly remove listing from local layout Grid
      setListings(prev => prev.filter(l => l.id !== listing.id));

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      toast.success("Purchase Completed", `Successfully purchased Level ${listing.level} asset!`, 4000, txHash);
      setListingTxStates(prev => ({ ...prev, [listing.id]: 'success' }));
      AnalyticsService.track('PURCHASE_COMPLETED', activeWalletAddress, { tokenId: listing.tokenId, price: listing.price, seller: listing.seller, txHash });
      
      await forceSynchronizedRefresh(true);

    } catch (err: any) {
      console.error("Failed to buy listing:", err); 
      setListings(originalListings);
      setListingTxStates(prev => ({ ...prev, [listing.id]: 'failed' }));
      
      let errorMsg = err.message || 'Transaction rejected.';
      AnalyticsService.track('TRANSACTION_FAILED', activeWalletAddress, { action: 'buy', tokenId: listing.tokenId, error: errorMsg });

      const isRaceCondition = 
        errorMsg.toLowerCase().includes("already sold") ||
        errorMsg.toLowerCase().includes("not active") ||
        errorMsg.toLowerCase().includes("expired") ||
        errorMsg.toLowerCase().includes("revert") ||
        errorMsg.toLowerCase().includes("invalid signature") ||
        errorMsg.toLowerCase().includes("listingnotactive") ||
        errorMsg.toLowerCase().includes("listingexpired");

      if (isRaceCondition) {
        toast.error("Race Condition Detected", "This NFT was already purchased or invalidated. Refreshing marketplace...", 5000);
      } else {
        if (errorMsg.includes("Cannot buy your own listing")) {
          errorMsg = "Self-trading guard: You cannot purchase your own asset listing.";
        } else if (errorMsg.includes("user rejected") || errorMsg.includes("User rejected")) {
          errorMsg = "Transaction signature was rejected in your wallet.";
        }
        toast.error('Purchase Failed', errorMsg);
      }

      await forceSynchronizedRefresh(true);
    } finally { 
      toast.dismiss(toastId);
    }
  };

  /* ─── CANCEL LISTING ───────────────────────────────────────── */
  const handleCancelListing = async (listing: any) => {
    if (!activeWallet) return;
    if (isNetworkMismatch) { 
      toast.error('Wrong network.', 'Please switch to Base Sepolia.'); 
      return; 
    }
    if (isWalletAccountMismatch) { 
      toast.error('Wallet mismatch detected.', 'Please reconnect the authenticated wallet.'); 
      return; 
    }
    if (isAnyTxActive) return;

    const originalListings = listings;
    
    // Instantly transition listing status to CANCELLED locally & disable interactions
    setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: "Cancelled" } : l));
    setListingTxStates(prev => ({ ...prev, [listing.id]: 'signing' }));
    
    const toastId = toast.loading("Confirm in Wallet...", "Awaiting cancel transaction approval in wallet...");

    try {
      await ensureCorrectChain(activeWallet);
      
      const { encodeFunctionData, createWalletClient, custom } = await import('viem');
      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        account: activeWallet.address as `0x${string}`, 
        chain: baseSepolia, 
        transport: custom(provider) 
      });

      const listingTuple = { 
        seller: listing.seller as `0x${string}`, 
        tokenId: BigInt(listing.tokenId), 
        amount: BigInt(listing.amount), 
        price: parseEther(listing.price), 
        expiry: BigInt(listing.expiry), 
        nonce: BigInt(listing.nonce) 
      };

      toast.loading("Confirm in Wallet...", "Waiting for cancel transaction confirmation in wallet...", { id: toastId });

      const data = encodeFunctionData({ 
        abi: RCADE_MARKETPLACE_ABI, 
        functionName: 'cancelListing', 
        args: [listingTuple] 
      });

      const txHash = await walletClient.sendTransaction({ 
        account: activeWallet.address as `0x${string}`, 
        to: MARKETPLACE_ADDRESS as `0x${string}`, 
        data, 
        value: 0n, 
        chain: baseSepolia 
      });

      setListingTxStates(prev => ({ ...prev, [listing.id]: 'pending' }));
      toast.loading("Waiting for Confirmation...", "Transaction broadcasted! Waiting for block confirmation...", { id: toastId });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      const cancelRes = await ApiService.fetchWithAuth('/api/marketplace/cancel', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ listingHash: listing.listingHash }) 
      }, getAccessToken);

      if (cancelRes.ok) { 
        const cancelData = await cancelRes.json();
        if (cancelData.user) {
          setDbUser(cancelData.user);
        }
      } else { 
        console.warn("Off-chain cancel API failed. Relaying to periodic reconciler."); 
      }

      toast.success("Listing Cancelled", 'Listing nonce securely voided on-chain.');
      setListingTxStates(prev => ({ ...prev, [listing.id]: 'success' }));
      await forceSynchronizedRefresh(true);

    } catch (err: any) { 
      console.error("Cancel failed:", err); 
      setListings(originalListings); 
      setListingTxStates(prev => ({ ...prev, [listing.id]: 'failed' }));
      toast.error('Cancellation Failed', err.message || 'Transaction rejected.'); 
      await forceSynchronizedRefresh(true);
    } finally { 
      toast.dismiss(toastId);
    }
  };

  /* ─── BULK CANCEL ──────────────────────────────────────────── */
  const handleCancelAllListings = async () => {
    if (!activeWallet) return;
    if (isNetworkMismatch) { 
      toast.error('Wrong network.', 'Please switch to Base Sepolia.'); 
      return; 
    }
    if (isWalletAccountMismatch) { 
      toast.error('Wallet mismatch detected.', 'Please reconnect the authenticated wallet.'); 
      return; 
    }
    if (isAnyTxActive) return;

    const originalListings = listings;
    
    // Instantly transition listing status to CANCELLED locally & disable interactions
    setListings(prev => prev.map(l => l.seller.toLowerCase() === activeWalletAddress?.toLowerCase() ? { ...l, status: "Cancelled" } : l));
    setListingTxStates(prev => ({ ...prev, 'bulk-cancel': 'signing' }));
    
    const toastId = toast.loading("Confirm in Wallet...", "Awaiting bulk cancel approval in wallet...");

    try {
      await ensureCorrectChain(activeWallet);
      
      const { encodeFunctionData, createWalletClient, custom } = await import('viem');
      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        account: activeWallet.address as `0x${string}`, 
        chain: baseSepolia, 
        transport: custom(provider) 
      });

      toast.loading("Confirm in Wallet...", "Waiting for bulk cancel confirmation in wallet extension...", { id: toastId });

      const data = encodeFunctionData({ 
        abi: RCADE_MARKETPLACE_ABI, 
        functionName: 'cancelAllListings' 
      });

      const txHash = await walletClient.sendTransaction({ 
        account: activeWallet.address as `0x${string}`, 
        to: MARKETPLACE_ADDRESS as `0x${string}`, 
        data, 
        value: 0n, 
        chain: baseSepolia 
      });

      setListingTxStates(prev => ({ ...prev, 'bulk-cancel': 'pending' }));
      toast.loading("Waiting for Confirmation...", "Transaction broadcasted! Voiding nonces on Base Sepolia...", { id: toastId });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      toast.success("Listing Cancelled", 'Bulk cancellation succeeded! All off-chain signatures voided.');
      setListingTxStates(prev => ({ ...prev, 'bulk-cancel': 'success' }));
      await forceSynchronizedRefresh(true);

    } catch (err: any) { 
      console.error("Bulk cancel failed:", err); 
      setListings(originalListings); 
      setListingTxStates(prev => ({ ...prev, 'bulk-cancel': 'failed' }));
      toast.error('Bulk Cancel Failed', err.message || 'Transaction rejected.'); 
      await forceSynchronizedRefresh(true);
    } finally { 
      toast.dismiss(toastId);
    }
  };

  /* ─── MINT REWARD NFT ──────────────────────────────────────── */
  const handleMintReward = async (reward: any) => {
    if (!activeWallet) { login(); return; }
    if (isNetworkMismatch) { 
      toast.error('Wrong network.', 'Please switch to Base Sepolia.'); 
      return; 
    }
    if (isWalletAccountMismatch) { 
      toast.error('Wallet mismatch detected.', 'Please reconnect the authenticated wallet.'); 
      return; 
    }
    if (isAnyTxActive) return;

    // Transition reward to MINTING locally
    setPreparedRewards(prev => prev.map(r => r.id === reward.id ? { ...r, claimStatus: 'MINTING' } : r));
    setListingTxStates(prev => ({ ...prev, [reward.id]: 'signing' }));

    const toastId = toast.loading("Preparing Claim...", "Generating secure minting payload from server...");

    try {
      await ensureCorrectChain(activeWallet);

      // 1. Fetch Mint Payload from API
      const payloadRes = await ApiService.fetchWithAuth('/api/rewards/mint-payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: reward.id, userWallet: activeWalletAddress })
      }, getAccessToken);

      if (!payloadRes.ok) {
        const errData = await payloadRes.json();
        throw new Error(errData.error || 'Failed to prepare mint payload.');
      }

      const { payload } = await payloadRes.json();

      // 2. Broadcast on-chain transaction
      const { encodeFunctionData, createWalletClient, custom } = await import('viem');
      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({ 
        account: activeWallet.address as `0x${string}`, 
        chain: baseSepolia, 
        transport: custom(provider) 
      });

      toast.loading("Confirm in Wallet...", "Awaiting transaction approval in wallet extension...", { id: toastId });

      const data = encodeFunctionData({
        abi: RCADE_ERC1155_ABI,
        functionName: 'mint',
        args: [
          payload.to as `0x${string}`,
          BigInt(payload.tokenId),
          BigInt(payload.amount),
          payload.rewardId as `0x${string}`,
          payload.signature as `0x${string}`
        ]
      });

      const txHash = await walletClient.sendTransaction({
        account: activeWallet.address as `0x${string}`,
        to: CONTRACT_ADDRESS as `0x${string}`,
        data,
        value: 0n,
        chain: baseSepolia
      });

      setListingTxStates(prev => ({ ...prev, [reward.id]: 'pending' }));
      toast.loading("Waiting for Confirmation...", "Transaction broadcasted! Waiting for block confirmation...", { id: toastId });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // 3. Confirm success with backend
      toast.loading("Confirming Succeeded...", "Finalizing database progression states...", { id: toastId });

      const confirmRes = await ApiService.fetchWithAuth('/api/rewards/mint-success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: reward.id, txHash })
      }, getAccessToken);

      if (!confirmRes.ok) {
        console.warn("Mint success confirmation failed. Relaying to periodic indexer.");
      }

      toast.success("NFT Minted Successfully", `Level ${reward.levelId.split('-').pop()} NFT has been added to your vault!`, 4000, txHash);
      setListingTxStates(prev => ({ ...prev, [reward.id]: 'success' }));
      
      // Remove from prepared rewards locally
      setPreparedRewards(prev => prev.filter(r => r.id !== reward.id));

      await forceSynchronizedRefresh(true);
      
    } catch (err: any) {
      console.error("Minting failed:", err);
      // Restore reward state
      setPreparedRewards(prev => prev.map(r => r.id === reward.id ? { ...r, claimStatus: 'PREPARED' } : r));
      setListingTxStates(prev => ({ ...prev, [reward.id]: 'failed' }));
      
      toast.error('Minting Failed', err.message || 'Signature rejected or validation failed.');
      AnalyticsService.track('TRANSACTION_FAILED', activeWalletAddress, { action: 'mint', error: err.message || err });
      await forceSynchronizedRefresh(true);
    } finally {
      toast.dismiss(toastId);
    }
  };

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-t-transparent animate-spin animate-shimmer" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
          <span className="font-heading text-[10px] tracking-[0.25em] uppercase animate-pulse" style={{ color: '#a9ddd3' }}>Initializing...</span>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="w-full min-h-[calc(100vh-60px)] flex flex-col md:flex-row relative pb-16 md:pb-0">

      {/* ── FAR-LEFT MINI NAVIGATION STRIP ── */}
      <div className="hidden md:flex flex-col items-center justify-start py-6 w-16 bg-[#040404] border-r border-[#161616] flex-shrink-0 self-stretch">
        {/* Top Section */}
        <div className="flex flex-col items-center space-y-6 w-full pt-[112px]">
          <button 
            onClick={() => setActiveTab('buy')}
            className={`p-3 w-full flex justify-center transition-colors cursor-pointer relative ${activeTab === 'buy' ? 'text-[#a9ddd3] border-r-2 border-[#a9ddd3] bg-[#a9ddd3]/5' : 'text-text-muted hover:text-white'}`}
            title="Marketplace"
          >
            <Grid className="w-4 h-4" />
          </button>

          <button 
            onClick={() => { if (!authenticated) { login(); return; } setActiveTab('sell'); }}
            className={`p-3 w-full flex justify-center transition-colors cursor-pointer relative ${activeTab === 'sell' ? 'text-[#a9ddd3] border-r-2 border-[#a9ddd3] bg-[#a9ddd3]/5' : 'text-text-muted hover:text-white'}`}
            title="List Assets"
          >
            <Tag className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => { if (!authenticated) { login(); return; } setActiveTab('dashboard'); }}
            className={`p-3 w-full flex justify-center transition-colors cursor-pointer relative ${activeTab === 'dashboard' ? 'text-[#a9ddd3] border-r-2 border-[#a9ddd3] bg-[#a9ddd3]/5' : 'text-text-muted hover:text-white'}`}
            title="My Trades & Stats"
          >
            <TrendingUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── MAIN CONTAINER (Right of Nav Strip) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* ── TOP AREA (Header & Warnings & Featured Banner) ── */}
        <div className="p-6 lg:p-8 pb-0 space-y-6">
          {/* System Warnings/Banners */}
          {isWalletAccountMismatch && (
            <div className="p-4 flex items-start gap-3 rounded-sm" style={{ background: 'rgba(169,221,211,0.04)', border: '1px solid rgba(169,221,211,0.2)', borderLeft: '3px solid #a9ddd3' }}>
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#a9ddd3' }} />
              <div>
                <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white mb-1">Wallet Mismatch Detected</h4>
                <p className="text-[9px] font-mono text-[#888]">Extension shows <strong className="text-white">{wallets[0]?.address ? `${wallets[0].address.slice(0, 6)}...${wallets[0].address.slice(-4)}` : 'Unknown'}</strong>. Reconnect authenticated wallet <strong style={{ color: '#a9ddd3' }}>{activeWalletAddress?.slice(0, 6)}...{activeWalletAddress?.slice(-4)}</strong>.</p>
              </div>
            </div>
          )}
          {isNetworkMismatch && (
            <div className="p-4 flex items-center justify-between gap-4 rounded-sm" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.25)', borderLeft: '3px solid #ef4444' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 mb-1">Wrong network. Please switch to Base Sepolia.</h4>
                  <p className="text-[9px] font-mono text-text-secondary">Switch to Base Sepolia (Chain ID: 84532) to unlock marketplace operations.</p>
                </div>
              </div>
              <button onClick={() => ensureCorrectChain(activeWallet)} className="px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-wider text-black flex-shrink-0 cursor-pointer rounded-sm hover:opacity-90" style={{ background: '#ef4444' }}>Switch Network</button>
            </div>
          )}

          {/* PAGE HEADER ── */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-[#161616]">
            <div>
              <p className="text-[9px] font-heading tracking-[0.25em] mb-2 uppercase text-[#a9ddd3]">EIP-712 · ERC-1155 · Base Sepolia</p>
              <h1 className="font-heading font-black text-2xl md:text-3xl text-white uppercase tracking-tight">NFT Marketplace</h1>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
              {/* Wallet Info Display */}
              {authenticated && (
                <div className="flex items-center gap-3 px-4 py-2 bg-[#09090c] border border-[#161616] text-[10px]">
                  <div className="pr-3 border-r border-[#161616] flex items-center gap-2 group/copy">
                    <div>
                      <span className="text-[8px] font-heading tracking-widest text-text-muted uppercase block">Wallet</span>
                      <span className="font-mono text-white text-[10px]">{activeWalletAddress?.slice(0, 6)}...{activeWalletAddress?.slice(-4)}</span>
                    </div>
                    <button
                      onClick={handleCopyAddress}
                      className="p-1 text-[#444] hover:text-white transition-colors cursor-pointer"
                      title="Copy Wallet Address"
                    >
                      {addressCopied ? <Check className="w-3 h-3 text-[#a9ddd3]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="pr-2 border-r border-[#161616]">
                    <span className="text-[8px] font-heading tracking-widest text-text-muted uppercase block">Balance</span>
                    <span className="font-heading font-bold flex items-center gap-1 text-[#a9ddd3] text-[10px]"><Coins className="w-3 h-3" />{ethBalance} ETH</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-1">
                    <button onClick={() => forceSynchronizedRefresh(false)} disabled={isSyncing || isAnyTxActive} className="p-1.5 transition-all border border-[#161616] hover:border-[#a9ddd3] rounded-sm cursor-pointer disabled:opacity-30" style={{ color: isSyncing ? '#a9ddd3' : '#444' }} title="Sync">
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                    {showEmbeddedControls && (
                      <>
                        <button
                          onClick={handleFundWallet}
                          className="p-1.5 transition-all border border-[#161616] hover:border-[#a9ddd3] rounded-sm text-[#444] hover:text-[#a9ddd3] cursor-pointer"
                          title="Fund Wallet (Get Sepolia ETH)"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleExportWallet}
                          className="p-1.5 transition-all border border-[#161616] hover:border-[#a9ddd3] rounded-sm text-[#444] hover:text-[#a9ddd3] cursor-pointer"
                          title="Export Private Key / Wallet Modal"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* FEATURED BANNER */}
          {activeTab === 'buy' && (() => {
            const activeFeatured = featuredListing || {
              id: 'fallback',
              gameName: 'Void Arena',
              tokenId: '0x0000000000000000000000000000000000000000000000000000000000000001',
              rarity: 'Legendary',
              gameIcon: 'Zap',
              price: '0.00',
              isFallback: true
            };

            return (
              <div className="relative w-full rounded-md overflow-hidden bg-[#09090c] border border-[#161616] p-6 sm:p-8 flex flex-col md:flex-row items-center gap-8 justify-between">
                {/* Grid Overlay background */}
                <div className="absolute inset-0 pixel-grid opacity-10 pointer-events-none" />
                {/* Radial Glow behind featured item */}
                <div className="absolute -left-16 -top-16 w-80 h-80 bg-radial-card rounded-full opacity-25 pointer-events-none" style={{
                  background: `radial-gradient(circle, ${RARITY_COLOR[activeFeatured.rarity]} 0%, transparent 70%)`
                }} />

                {/* Featured NFT Card Preview */}
                <div className="relative z-10 w-full max-w-[220px] flex-shrink-0 bg-[#050507]/95 border border-[#222]/80 p-4 rounded-md shadow-2xl overflow-hidden group">
                  {/* Neon retro corners */}
                  <div className="absolute top-0 left-0 w-2 h-[1px] bg-[#a9ddd3]" />
                  <div className="absolute top-0 left-0 w-[1px] h-2 bg-[#a9ddd3]" />
                  <div className="absolute bottom-0 right-0 w-2 h-[1px] bg-[#a9ddd3]" />
                  <div className="absolute bottom-0 right-0 w-[1px] h-2 bg-[#a9ddd3]" />

                  <div className="aspect-square bg-black/60 border border-[#161616] flex items-center justify-center relative overflow-hidden mb-3">
                    {/* Glow circle behind card icon */}
                    <div className="absolute w-24 h-24 rounded-full opacity-35 filter blur-xl animate-pulse" style={{
                      background: `radial-gradient(circle, ${RARITY_COLOR[activeFeatured.rarity]} 0%, transparent 70%)`
                    }} />
                    {(() => {
                      const IconComponent = GAME_ICON_MAP[activeFeatured.gameIcon] || Gamepad2;
                      return <IconComponent className="w-12 h-12 relative z-10 animate-float" style={{ color: RARITY_COLOR[activeFeatured.rarity] }} />;
                    })()}
                    
                    {/* Rarity tag top-left */}
                    <div className="absolute top-2 left-2 text-[8px] font-heading font-bold uppercase px-2 py-0.5 border border-zinc-800 bg-black/80" style={{ color: RARITY_COLOR[activeFeatured.rarity], borderColor: RARITY_BORDER[activeFeatured.rarity] }}>
                      {activeFeatured.rarity}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <h4 className="font-heading font-black text-xs text-white truncate uppercase tracking-tight">{activeFeatured.gameName} #{activeFeatured.tokenId.slice(-3)}</h4>
                    <div className="flex justify-between items-center text-[9px] text-text-muted">
                      <span>{activeFeatured.gameName}</span>
                      {activeFeatured.price && (
                        <span className="font-mono text-[#a9ddd3] font-bold">{activeFeatured.price} ETH</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Banner Content */}
                <div className="relative z-10 flex-1 space-y-4 text-center md:text-left">
                  <p className="text-[9px] font-heading tracking-[0.25em] text-[#a9ddd3] uppercase">Featured Game Asset</p>
                  <h2 className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-white leading-tight tracking-tight uppercase max-w-lg">
                    Trade Legendary Game Assets
                  </h2>
                  <p className="text-xs text-text-secondary max-w-md">
                    Acquire level upgrades, tools, and custom character cards on-chain to boost your R-Cade arena performance multiplier.
                  </p>
                  <div className="pt-2">
                    {activeFeatured.isFallback ? (
                      <button 
                        onClick={() => {
                          const el = document.getElementById('trending-assets');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="btn-primary text-[9px] px-6 py-3 rounded-sm transition-all"
                      >
                        Explore Assets
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleBuyListing(activeFeatured)}
                        disabled={isAnyTxActive || isNetworkMismatch || isWalletAccountMismatch}
                        className="btn-primary text-[9px] px-6 py-3 rounded-sm transition-all"
                      >
                        {listingTxStates[activeFeatured.id] === 'signing' ? "Awaiting Signature..." : 
                         listingTxStates[activeFeatured.id] === 'pending' ? "Purchasing..." : "Buy Featured"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Carousel Navigation Indicators */}
                {featuredPool.length > 1 && (
                  <div className="hidden md:flex flex-col items-end gap-16 self-stretch justify-between relative z-10">
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => setActiveHeroIndex(prev => (prev - 1 + featuredPool.length) % featuredPool.length)}
                        className="w-6 h-6 border border-[#222] flex items-center justify-center text-text-muted hover:text-white hover:border-[#a9ddd3] transition-all cursor-pointer rounded-sm bg-black/40"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => setActiveHeroIndex(prev => (prev + 1) % featuredPool.length)}
                        className="w-6 h-6 border border-[#222] flex items-center justify-center text-text-muted hover:text-white hover:border-[#a9ddd3] transition-all cursor-pointer rounded-sm bg-black/40"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      {featuredPool.slice(0, 5).map((_, idx) => {
                        const isActive = (activeHeroIndex % featuredPool.length) === idx;
                        return (
                          <button
                            key={idx}
                            onClick={() => setActiveHeroIndex(idx)}
                            className={`h-1 transition-all rounded-full cursor-pointer ${isActive ? 'w-5 bg-[#a9ddd3]' : 'w-2.5 bg-[#1c1c1f] hover:bg-zinc-700'}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── BOTTOM Split Content Section (Filters + Tabs Content) ── */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 border-t border-[#161616]">

          {/* ── FILTER SIDEBAR (Left) ── */}
          {activeTab === 'buy' && (
            <div className="w-full lg:w-72 bg-[#080808]/90 border-r border-[#161616] flex flex-col flex-shrink-0 relative transition-all duration-300">
              {/* Mobile Header Filter Toggle */}
              <div className="p-4 flex items-center justify-between border-b border-[#161616] lg:hidden bg-black/40">
                <span className="font-heading text-[10px] font-bold uppercase tracking-wider text-[#a9ddd3] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
                </span>
                <button onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} className="p-2 text-white border border-[#161616] rounded-sm hover:border-[#a9ddd3]">
                  {isMobileSidebarOpen ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4 text-[#a9ddd3]" />}
                </button>
              </div>

              {/* Filters Scroll Panel */}
              <div className={`p-6 space-y-6 flex-1 overflow-y-auto ${isMobileSidebarOpen ? 'block bg-[#080808]' : 'hidden lg:block'}`}>
                
                {/* SEARCH BAR */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-3.5 h-3.5 text-text-muted" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Search Assets..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-[#050505] border border-[#161616] pl-9 pr-8 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#a9ddd3] transition-all rounded-sm placeholder-text-muted"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-muted hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* GAMES ACCORDION */}
                <div className="border-b border-[#161616] pb-5">
                  <button onClick={() => toggleFilterSection('games')} className="flex items-center justify-between w-full font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:text-[#a9ddd3] transition-colors py-2">
                    <span>Games</span>
                    {expandedFilters.games ? <ChevronUp className="w-3.5 h-3.5 text-[#a9ddd3]" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                  </button>
                  {expandedFilters.games && (
                    <div className="mt-3 space-y-2">
                      <select 
                        value={selectedGameFilter} 
                        onChange={e => setSelectedGameFilter(e.target.value)}
                        className="w-full bg-[#050505] border border-[#161616] text-[10px] font-heading px-3 py-2.5 text-white tracking-[0.1em] focus:outline-none focus:border-[#a9ddd3] uppercase transition-colors"
                      >
                        <option value="ALL">All Games</option>
                        <option value="neon-snake">Neon Snake</option>
                        <option value="cyber-runner">Cyber Runner</option>
                        <option value="void-arena">Void Arena</option>
                        <option value="pixel-heist">Pixel Heist</option>
                        <option value="space-impact">Space Impact</option>
                        <option value="sudoku">Sudoku Matrix</option>
                      </select>
                      
                      {/* Visual Quicklinks matching reference design */}
                      <div className="mt-3 space-y-1.5 pl-1">
                        {([
                          { id: 'ALL', name: 'All Games' },
                          { id: 'neon-snake', name: 'Neon Snake' },
                          { id: 'cyber-runner', name: 'Cyber Runner' },
                          { id: 'void-arena', name: 'Void Arena' },
                          { id: 'pixel-heist', name: 'Pixel Heist' },
                          { id: 'space-impact', name: 'Space Impact' },
                          { id: 'sudoku', name: 'Sudoku Matrix' },
                        ]).map(game => (
                          <button 
                            key={game.id} 
                            onClick={() => setSelectedGameFilter(game.id)}
                            className={`block text-[9px] font-mono tracking-wider transition-colors py-0.5 text-left w-full ${selectedGameFilter === game.id ? 'text-[#a9ddd3] font-bold' : 'text-text-muted hover:text-white'}`}
                          >
                            {selectedGameFilter === game.id ? '•' : '>'} {game.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CATEGORIES ACCORDION */}
                <div className="border-b border-[#161616] pb-5">
                  <button onClick={() => toggleFilterSection('categories')} className="flex items-center justify-between w-full font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:text-[#a9ddd3] transition-colors py-2">
                    <span>Categories</span>
                    {expandedFilters.categories ? <ChevronUp className="w-3.5 h-3.5 text-[#a9ddd3]" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                  </button>
                  {expandedFilters.categories && (
                    <div className="mt-3 space-y-2 pl-1">
                      {['Avatars', 'Weapons', 'Lands', 'Skins', 'Items'].map(cat => {
                        const isChecked = selectedCategories.includes(cat);
                        return (
                          <label key={cat} className="flex items-center gap-2.5 text-[10px] font-heading uppercase tracking-wider text-text-secondary hover:text-white cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {
                                setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
                              }}
                              className="sr-only"
                            />
                            <span className={`w-3.5 h-3.5 border flex items-center justify-center transition-all ${isChecked ? 'bg-[#a9ddd3] border-[#a9ddd3] text-black' : 'border-[#222] bg-[#050505] hover:border-text-muted'}`}>
                              {isChecked && <CheckCircle2 className="w-2.5 h-2.5 text-black stroke-[3]" />}
                            </span>
                            <span>{cat}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* PRICE RANGE ACCORDION */}
                <div className="border-b border-[#161616] pb-5">
                  <button onClick={() => toggleFilterSection('priceRange')} className="flex items-center justify-between w-full font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:text-[#a9ddd3] transition-colors py-2">
                    <span>Price Range</span>
                    {expandedFilters.priceRange ? <ChevronUp className="w-3.5 h-3.5 text-[#a9ddd3]" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                  </button>
                  {expandedFilters.priceRange && (
                    <div className="mt-3 space-y-3.5 pl-1">
                      {/* Custom glowing slider track visualization from screenshot */}
                      <div className="relative pt-4 px-1 pb-1">
                        <div className="h-1 bg-[#161616] rounded-full w-full relative">
                          <div className="absolute left-[5%] right-[25%] h-full bg-[#a9ddd3]" />
                          <div className="absolute left-[5%] -top-1.5 w-4 h-4 rounded-full bg-[#a9ddd3] border-2 border-black cursor-pointer shadow-[0_0_8px_rgba(169,221,211,0.5)]" />
                          <div className="absolute right-[25%] -top-1.5 w-4 h-4 rounded-full bg-[#a9ddd3] border-2 border-black cursor-pointer shadow-[0_0_8px_rgba(169,221,211,0.5)]" />
                        </div>
                        <div className="flex justify-between items-center text-[8px] font-mono text-text-muted mt-3">
                          <span>0 ETH</span>
                          <span>10+ ETH</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input 
                            type="text" 
                            value={minPrice} 
                            onChange={e => setMinPrice(e.target.value)} 
                            placeholder="Min" 
                            className="w-full bg-[#050505] border border-[#161616] text-[10px] font-mono p-2 pr-6 text-white focus:outline-none focus:border-[#a9ddd3] transition-colors"
                          />
                          <span className="absolute right-2 top-2.5 text-[8px] font-heading text-text-muted">ETH</span>
                        </div>
                        <span className="text-[10px] text-text-muted font-mono">-</span>
                        <div className="relative flex-1">
                          <input 
                            type="text" 
                            value={maxPrice} 
                            onChange={e => setMaxPrice(e.target.value)} 
                            placeholder="Max" 
                            className="w-full bg-[#050505] border border-[#161616] text-[10px] font-mono p-2 pr-6 text-white focus:outline-none focus:border-[#a9ddd3] transition-colors"
                          />
                          <span className="absolute right-2 top-2.5 text-[8px] font-heading text-text-muted">ETH</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* RARITY ACCORDION */}
                <div className="border-b border-[#161616] pb-5">
                  <button onClick={() => toggleFilterSection('rarity')} className="flex items-center justify-between w-full font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:text-[#a9ddd3] transition-colors py-2">
                    <span>Rarity</span>
                    {expandedFilters.rarity ? <ChevronUp className="w-3.5 h-3.5 text-[#a9ddd3]" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                  </button>
                  {expandedFilters.rarity && (
                    <div className="mt-3 space-y-2 pl-1">
                      {['Common', 'Rare', 'Epic', 'Legendary'].map(rarity => {
                        const isChecked = selectedRarities.includes(rarity);
                        return (
                          <label key={rarity} className="flex items-center gap-2.5 text-[10px] font-heading uppercase tracking-wider text-text-secondary hover:text-white cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {
                                setSelectedRarities(prev => prev.includes(rarity) ? prev.filter(r => r !== rarity) : [...prev, rarity]);
                              }}
                              className="sr-only"
                            />
                            <span className={`w-3.5 h-3.5 border flex items-center justify-center transition-all ${isChecked ? 'bg-[#a9ddd3] border-[#a9ddd3] text-black' : 'border-[#222] bg-[#050505] hover:border-text-muted'}`}>
                              {isChecked && <CheckCircle2 className="w-2.5 h-2.5 text-black stroke-[3]" />}
                            </span>
                            <span style={{ color: RARITY_COLOR[rarity] }}>{rarity}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* STATUS ACCORDION */}
                <div className="pb-2">
                  <button onClick={() => toggleFilterSection('status')} className="flex items-center justify-between w-full font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:text-[#a9ddd3] transition-colors py-2">
                    <span>Status</span>
                    {expandedFilters.status ? <ChevronUp className="w-3.5 h-3.5 text-[#a9ddd3]" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
                  </button>
                  {expandedFilters.status && (
                    <div className="mt-3 space-y-2 pl-1">
                      {['Buy Now', 'Auction', 'Live Drops'].map(status => {
                        const isChecked = selectedStatus.includes(status);
                        return (
                          <label key={status} className="flex items-center gap-2.5 text-[10px] font-heading uppercase tracking-wider text-text-secondary hover:text-white cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {
                                setSelectedStatus(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
                              }}
                              className="sr-only"
                            />
                            <span className={`w-3.5 h-3.5 border flex items-center justify-center transition-all ${isChecked ? 'bg-[#a9ddd3] border-[#a9ddd3] text-black' : 'border-[#222] bg-[#050505] hover:border-text-muted'}`}>
                              {isChecked && <CheckCircle2 className="w-2.5 h-2.5 text-black stroke-[3]" />}
                            </span>
                            <span>{status}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ── TAB CONTENT PANEL (Right) ── */}
          <div className="flex-1 flex flex-col p-6 lg:p-8 overflow-y-auto space-y-8 min-w-0 pb-24 md:pb-8">

            {/* ══════════════════════════════════════════════════════
                BUY TAB (Redesigned with Grid Cards)
            ══════════════════════════════════════════════════════ */}
            {activeTab === 'buy' && (
              <div className="space-y-8 min-h-[450px]">

                {/* GRID LAYOUT SECTION */}
                <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-[#161616]">
                <h3 className="font-heading text-xs font-black uppercase tracking-[0.2em] text-white">Trending Assets</h3>
                <div className="flex gap-1.5">
                  <button className="w-5 h-5 border border-[#222] flex items-center justify-center text-text-muted hover:text-white hover:border-white transition-colors cursor-pointer rounded-sm bg-black/20">
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                  <button className="w-5 h-5 border border-[#222] flex items-center justify-center text-text-muted hover:text-white hover:border-white transition-colors cursor-pointer rounded-sm bg-black/20">
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {isListingsLoading ? (
                /* Premium Retro Shimmer Loading Skeletons in Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  {[1, 2, 3, 4, 5].map(idx => (
                    <div key={idx} className="bg-[#09090c] border border-[#161616] p-4 rounded-md space-y-4 animate-pulse">
                      <div className="aspect-square bg-zinc-950 border border-zinc-900 rounded-sm" />
                      <div className="space-y-2">
                        <div className="w-2/3 h-3.5 bg-zinc-900" />
                        <div className="w-1/2 h-2.5 bg-zinc-900" />
                        <div className="flex justify-between pt-2">
                          <div className="w-1/3 h-3.5 bg-zinc-900" />
                          <div className="w-1/4 h-2.5 bg-zinc-900" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <div className="w-1/2 h-7 bg-zinc-900 rounded-sm" />
                        <div className="w-1/2 h-7 bg-zinc-900 rounded-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : buyableListings.length === 0 ? (
                <div className="py-24 text-center rounded-md" style={{ border: '1px dashed #1f1f1f' }}>
                  <ShoppingBag className="w-10 h-10 mx-auto mb-4 text-text-muted" />
                  <p className="font-heading text-xs text-text-muted uppercase tracking-widest mb-1">No Active Listings</p>
                  <p className="text-[9px] font-heading tracking-widest text-text-muted uppercase">Try adjusting your filters or search terms</p>
                </div>
              ) : (
                /* Dynamic Card Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  <AnimatePresence>
                    {buyableListings.map(listing => {
                      const isPending = listingTxStates[listing.id] === 'signing' || listingTxStates[listing.id] === 'pending' || listing.pendingPurchase;
                      const isFavorited = favorites[listing.id];
                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ 
                            opacity: isPending ? 0.35 : 1,
                            filter: isPending ? 'blur(1px)' : 'none'
                          }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          key={listing.id}
                          className="bg-[#09090c] border border-[#161616] hover:border-zinc-800 p-4 rounded-md flex flex-col justify-between transition-all duration-300 group relative overflow-hidden"
                        >
                          {/* Accent border highlight on hover */}
                          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#a9ddd3]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          <div>
                            {/* Visual Asset Container */}
                            <div className="aspect-square bg-[#050507] border border-[#161616] flex items-center justify-center relative rounded-sm overflow-hidden mb-3.5 group-hover:bg-[#07070b] transition-all">
                              {/* Rarity theme glow behind icon */}
                              <div className="absolute w-20 h-20 rounded-full opacity-20 filter blur-xl group-hover:opacity-35 transition-all duration-300" style={{
                                background: `radial-gradient(circle, ${RARITY_COLOR[listing.rarity]} 0%, transparent 70%)`
                              }} />

                              {(() => {
                                const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                return <IconComponent className="w-10 h-10 relative z-10 transition-transform duration-300 group-hover:scale-110" style={{ color: RARITY_COLOR[listing.rarity] }} />;
                              })()}

                              {/* Heart Favorite Button */}
                              <button 
                                onClick={(e) => toggleFavorite(listing.id, e)} 
                                className="absolute top-2.5 right-2.5 p-1.5 bg-black/60 border border-zinc-900 rounded-sm text-text-muted hover:text-red-500 hover:border-red-500/20 transition-all z-10 cursor-pointer"
                              >
                                <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
                              </button>

                              {/* Multi-quantities badge */}
                              {listing.amount > 1 && (
                                <div className="absolute bottom-2.5 right-2.5 text-[8px] font-mono font-bold bg-black/85 border border-zinc-800 px-1.5 py-0.5 text-[#a9ddd3]">
                                  x{listing.amount}
                                </div>
                              )}
                            </div>

                            {/* Asset Metadata */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="font-heading font-black text-xs text-white truncate uppercase tracking-tight">{listing.gameName} #{listing.tokenId.slice(-3)}</h4>
                                <span className="text-[8px] font-heading font-bold uppercase px-1.5 py-0.5 border flex-shrink-0" style={{
                                  color: RARITY_COLOR[listing.rarity],
                                  borderColor: RARITY_BORDER[listing.rarity],
                                  background: `${RARITY_COLOR[listing.rarity]}0c`
                                }}>
                                  {listing.rarity}
                                </span>
                              </div>
                              <p className="text-[9px] font-mono text-text-muted uppercase tracking-wider truncate">{listing.gameName} &middot; Level {listing.level}</p>
                            </div>
                          </div>

                          {/* Price details and Action buttons */}
                          <div className="mt-4 pt-3 border-t border-[#161616] space-y-3.5">
                            <div className="flex justify-between items-end">
                              <span className="text-[8px] font-heading tracking-widest text-text-muted uppercase">Price</span>
                              <div className="text-right">
                                <div className="text-xs font-heading font-bold text-[#a9ddd3]">{listing.price} ETH</div>
                                <div className="text-[8px] font-mono text-text-muted">~${(parseFloat(listing.price) * 3000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleBuyListing(listing)}
                                disabled={isAnyTxActive || isNetworkMismatch || isWalletAccountMismatch || isPending}
                                className="flex-1 py-2 text-[9px] font-heading font-black uppercase tracking-widest border border-zinc-800 hover:border-zinc-700 bg-black/40 text-white hover:bg-black/80 transition-all cursor-pointer flex items-center justify-center gap-1 rounded-sm disabled:opacity-40"
                              >
                                BUY NOW
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Bid Option", "Bidding mechanics will be enabled in the Marketplace V2 protocol update!");
                                }}
                                disabled={isAnyTxActive || isPending}
                                className="flex-1 py-2 text-[9px] font-heading font-black uppercase tracking-widest bg-[#a9ddd3] text-black hover:bg-[#b9ede3] transition-all cursor-pointer flex items-center justify-center gap-1 font-bold rounded-sm disabled:opacity-40"
                              >
                                {listingTxStates[listing.id] === 'signing' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                {listingTxStates[listing.id] === 'pending' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                {(!listingTxStates[listing.id] || listingTxStates[listing.id] === 'idle') && 'BID'}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SELL TAB (Redesigned with Grid)
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'sell' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Vault Inventory Grid */}
            <div className="lg:col-span-2 bg-[#09090c] border border-[#161616] p-6 rounded-md">
              <h3 className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2 pb-4 border-b border-[#161616]">
                <Layers className="w-4 h-4 text-[#a9ddd3]" /> Select Asset From Vault
              </h3>
              {isLoadingInventory ? (
                <div className="flex justify-center items-center py-24">
                  <div className="w-8 h-8 border-2 border-t-transparent animate-spin rounded-full" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
                </div>
              ) : inventory.length === 0 ? (
                <div className="py-24 text-center">
                  <p className="font-heading text-xs text-text-muted uppercase tracking-widest mb-4">No assets in vault</p>
                  <Link href="/play" className="btn-primary text-[9px] px-6 py-3 rounded-sm">Play to Earn NFTs</Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {inventory.map(nft => {
                    const isSelected = selectedNft?.id === nft.id;
                    return (
                      <button
                        key={nft.id || `${nft.tokenId}-${nft.gameSlug}-${nft.level}`}
                        disabled={isAnyTxActive}
                        onClick={() => { setSelectedNft(nft); setSellAmount(1); }}
                        className="relative p-4 flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-40 min-h-[120px] rounded-sm group overflow-hidden"
                        style={{
                          background: isSelected ? 'rgba(169,221,211,0.05)' : '#050507',
                          border: isSelected ? '1px solid #a9ddd3' : '1px solid #161616',
                          boxShadow: isSelected ? '0 0 16px rgba(169,221,211,0.15)' : 'none',
                        }}
                      >
                        <div className="absolute top-2 right-2 text-[9px] font-mono font-bold text-[#a9ddd3]">x{nft.amount}</div>
                        <div className="mb-2 relative">
                          <div className="absolute inset-0 w-8 h-8 rounded-full opacity-10 filter blur-md" style={{
                            background: `radial-gradient(circle, ${RARITY_COLOR[nft.rarity]} 0%, transparent 70%)`
                          }} />
                          {(() => {
                            const IconComponent = GAME_ICON_MAP[nft.gameIcon] || Gamepad2;
                            return <IconComponent className="w-6 h-6 mx-auto relative z-10 transition-transform group-hover:scale-110" style={{ color: RARITY_COLOR[nft.rarity] }} />;
                          })()}
                        </div>
                        <div className="font-heading text-[10px] font-bold text-white uppercase truncate max-w-full tracking-wide">{nft.gameName}</div>
                        <div className="text-[8px] font-mono text-text-muted uppercase tracking-wider mt-1">Lvl {nft.level} &middot; {nft.rarity}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* List Config Form */}
            <div className="bg-[#09090c] border border-[#161616] p-6 rounded-md h-fit">
              <h3 className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white mb-6 pb-4 flex items-center gap-2 border-b border-[#161616]">
                <Tag className="w-4 h-4 text-[#a9ddd3]" /> List Config
              </h3>
              {selectedNft ? (
                <div className="space-y-5">
                  {/* Selected NFT Preview Card */}
                  <div className="flex items-center gap-3.5 p-3.5 bg-[#050507] border border-[#161616] rounded-sm">
                    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-sm bg-black/40" 
                      style={{ 
                        border: `1px solid ${RARITY_BORDER[selectedNft.rarity]}`, 
                        color: RARITY_COLOR[selectedNft.rarity] 
                      }}>
                      {(() => {
                        const IconComponent = GAME_ICON_MAP[selectedNft.gameIcon] || Gamepad2;
                        return <IconComponent className="w-5 h-5 relative z-10" />;
                      })()}
                    </div>
                    <div>
                      <div className="font-heading text-xs font-bold text-white uppercase tracking-tight">{selectedNft.gameName}</div>
                      <div className="text-[8px] font-mono text-text-muted uppercase tracking-widest mt-0.5">Level {selectedNft.level} &middot; {selectedNft.rarity} &middot; x{selectedNft.amount} owned</div>
                    </div>
                  </div>

                  {/* Pricing Input */}
                  <div>
                    <label className="block text-[8px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Asking Price (ETH)</label>
                    <div className="relative">
                      <input type="number" step="0.001" min="0.0001" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                        disabled={isAnyTxActive}
                        className="w-full bg-[#050505] border border-[#161616] px-3.5 py-3 text-xs text-white font-mono focus:outline-none focus:border-[#a9ddd3] transition-colors rounded-sm"
                      />
                      <span className="absolute right-3.5 top-3 text-[9px] font-heading text-text-muted uppercase">ETH</span>
                    </div>
                  </div>

                  {/* Quantity Slider */}
                  {selectedNft.amount > 1 && (
                    <div>
                      <label className="block text-[8px] font-heading tracking-[0.2em] text-text-muted uppercase mb-2">Quantity to List: <span className="text-[#a9ddd3] font-bold">{sellAmount}</span></label>
                      <input type="range" min="1" max={selectedNft.amount} value={sellAmount} onChange={e => setSellAmount(Number(e.target.value))} disabled={isAnyTxActive} className="w-full" style={{ accentColor: '#a9ddd3' }} />
                    </div>
                  )}

                  {/* Expiry Selector */}
                  <div>
                    <label className="block text-[8px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Expiry Duration</label>
                    <select value={sellExpiryDays} onChange={e => setSellExpiryDays(Number(e.target.value))}
                      disabled={isAnyTxActive}
                      className="w-full bg-[#050505] border border-[#161616] px-3.5 py-3 text-xs text-white font-mono focus:outline-none focus:border-[#a9ddd3] transition-colors rounded-sm uppercase"
                    >
                      <option value={1}>1 Day</option>
                      <option value={3}>3 Days</option>
                      <option value={7}>7 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>

                  {/* Fee Breakdown */}
                  <div className="p-3.5 space-y-2.5 font-mono text-[9px] bg-[#050507] border border-[#161616] rounded-sm">
                    <div className="flex justify-between text-text-muted">
                      <span>Royalties (0%):</span><span>0.0000 ETH</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Protocol Fee ({marketplaceFeeBps / 100}%):</span><span className="text-red-400">-{((Number(sellPrice) * marketplaceFeeBps) / 10000).toFixed(4)} ETH</span>
                    </div>
                    <div className="flex justify-between pt-2.5 font-bold text-xs text-white border-t border-[#161616]">
                      <span>You receive:</span><span className="text-[#a9ddd3]">{(Number(sellPrice) - ((Number(sellPrice) * marketplaceFeeBps) / 10000)).toFixed(4)} ETH</span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button onClick={handleCreateListing} disabled={Number(sellPrice) <= 0 || isNetworkMismatch || isWalletAccountMismatch || isAnyTxActive}
                    className="w-full py-4 text-[9px] font-heading font-black uppercase tracking-[0.2em] disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer bg-[#a9ddd3] text-black hover:bg-[#b9ede3] rounded-sm font-bold shadow-[0_0_15px_rgba(169,221,211,0.2)]"
                  >
                    {listingTxStates.list === 'signing' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing...</> :
                     listingTxStates.list === 'pending' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing...</> :
                     "Sign & List Off-Chain"}
                  </button>
                </div>
              ) : (
                <div className="py-24 text-center text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase border border-dashed border-[#161616] rounded-sm">
                  Select an asset from the vault
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TRADER DASHBOARD TAB (Redesigned with cards)
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            
            {/* Stats Summary Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: ShoppingBag, label: 'Active Offers',     value: dashboardStats.activeOffers, unit: '' },
                { icon: TrendingUp,  label: 'Total Volume Earned',      value: dashboardStats.totalVolumeEarned, unit: 'ETH' },
                { icon: History,     label: 'Assets Purchased',  value: dashboardStats.totalAssetsPurchased, unit: '' },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-[#09090c] border border-[#161616] p-5 rounded-md flex items-center gap-4 hover:border-zinc-800 transition-colors">
                    <div className="w-10 h-10 flex items-center justify-center rounded-sm bg-[#a9ddd3]/5 border border-[#a9ddd3]/15">
                      <Icon className="w-4 h-4 text-[#a9ddd3]" />
                    </div>
                    <div>
                      <div className="text-[8px] font-heading tracking-[0.2em] text-text-muted uppercase">{s.label}</div>
                      <div className="font-heading font-black text-xl text-white mt-1">{s.value}<span className="text-[10px] ml-1 text-text-muted font-normal">{s.unit}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sub-tab navigation bar */}
            <div className="flex flex-row flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none pb-1 border-b border-[#161616] whitespace-nowrap">
              {([
                { id: 'active',      label: `Active (${traderActiveListings.length})` },
                { id: 'sales',       label: `Sales (${traderSalesListings.length})` },
                { id: 'purchases',   label: `Purchases (${traderPurchasesListings.length})` },
                { id: 'rewards',     label: `Reward Vault (${preparedRewards.length})` },
                { id: 'progression', label: `Progression Timeline` },
                { id: 'reserved',    label: `Reserved NFTs (${reservedInventory.length})` },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setDashboardSubTab(t.id)}
                  disabled={isAnyTxActive}
                  className={`px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap rounded-sm ${dashboardSubTab === t.id ? 'bg-[#a9ddd3] text-black shadow-[0_0_10px_rgba(169,221,211,0.2)]' : 'text-text-muted hover:text-white hover:bg-zinc-950/40'}`}
                >{t.label}</button>
              ))}
              
              {dashboardSubTab === 'active' && traderActiveListings.length > 0 && (
                <button onClick={handleCancelAllListings} disabled={isAnyTxActive || isNetworkMismatch}
                  className="ml-auto px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-wider transition-all flex-shrink-0 mr-0 disabled:opacity-40 cursor-pointer rounded-sm hover:bg-red-500 hover:text-black"
                  style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent' }}
                >
                  {listingTxStates['bulk-cancel'] === 'signing' ? "Signing..." : 
                   listingTxStates['bulk-cancel'] === 'pending' ? "Voiding..." : 
                   "Cancel All Listings"}
                </button>
              )}
            </div>

            {/* Sub-tab Panel Content */}
            <div className="min-h-[350px]">
              {isListingsLoading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="w-8 h-8 border-2 border-t-transparent animate-spin rounded-full" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
                </div>
              ) : (
                <>
                  {/* ACTIVE SUBTAB */}
                  {dashboardSubTab === 'active' && (
                    traderActiveListings.length === 0 ? (
                      <div className="py-16 text-center border border-dashed border-[#161616] rounded-sm">
                        <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3.5">No active offers listed</p>
                        <button onClick={() => setActiveTab('sell')} disabled={isAnyTxActive} className="btn-primary text-[9px] px-5 py-2.5 rounded-sm">Create Listing</button>
                      </div>
                    ) : (
                      <div className="border border-[#161616] rounded-sm overflow-x-auto scrollbar-none">
                        <div className="min-w-[800px]">
                          <div className="grid grid-cols-12 px-4 py-3 bg-[#050507] border-b border-[#161616]">
                            {['Asset Name', 'Rarity Tier', 'Quantity', 'Asking Price', 'Status / Expiry', ''].map((h, i) => (
                              <div key={h} className={`font-heading text-[8px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-2' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-1' : i === 3 ? 'col-span-2' : i === 4 ? 'col-span-3' : 'col-span-2 text-right'}`}>{h}</div>
                            ))}
                          </div>
                          <AnimatePresence>
                            {traderActiveListings.map((listing, i) => {
                              const isPending = listingTxStates[listing.id] === 'signing' || listingTxStates[listing.id] === 'pending';
                              const isSyncingListing = listing.status === 'Syncing';
                              return (
                                <motion.div 
                                  layout
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ 
                                    opacity: (isPending || isSyncingListing) ? 0.45 : 1,
                                    filter: (isPending || isSyncingListing) ? 'blur(0.5px)' : 'none'
                                  }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  key={listing.id} 
                                  className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors border-b border-[#111] last:border-0"
                                >
                                  <div className="col-span-2 flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 text-xs bg-black/40 border" 
                                      style={{ 
                                        borderColor: RARITY_BORDER[listing.rarity], 
                                        color: RARITY_COLOR[listing.rarity] 
                                      }}>
                                      {(() => {
                                        const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                        return <IconComponent className="w-3.5 h-3.5" />;
                                      })()}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-heading text-xs font-bold text-white truncate leading-none mb-1">{listing.gameName}</span>
                                      <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level}</span>
                                    </div>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-[8px] font-heading font-bold uppercase px-2 py-0.5 border" style={{ color: RARITY_COLOR[listing.rarity], borderColor: RARITY_BORDER[listing.rarity], background: `${RARITY_COLOR[listing.rarity]}08` }}>{listing.rarity}</span>
                                  </div>
                                  <div className="col-span-1">
                                    <span className="font-mono text-xs text-text-secondary">x{listing.amount}</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-heading font-bold text-xs text-[#a9ddd3]">{listing.price}</span>
                                    <span className="font-heading text-[8px] text-text-muted ml-1">ETH</span>
                                  </div>
                                  <div className="col-span-3">
                                    {isSyncingListing ? (
                                      <span className="text-[8px] font-heading font-bold tracking-widest animate-pulse" style={{ color: '#f59e0b' }}>[SYNCING TO NODE]</span>
                                    ) : (
                                      <span className="font-mono text-[9px] text-text-muted">Expires {new Date(listing.expiry * 1000).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                  <div className="col-span-2 flex justify-end">
                                    {!isSyncingListing && (
                                      <button 
                                        onClick={() => handleCancelListing(listing)} 
                                        disabled={isAnyTxActive || isNetworkMismatch || isPending}
                                        className="px-3 py-1.5 text-[8px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition-all cursor-pointer rounded-sm hover:bg-red-500/10"
                                        style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', background: 'transparent' }}
                                      >
                                        {listingTxStates[listing.id] === 'signing' ? <><Loader2 className="w-3 h-3 animate-spin" /> Voiding...</> :
                                         listingTxStates[listing.id] === 'pending' ? <><Loader2 className="w-3 h-3 animate-spin" /> Pending...</> :
                                         <><Trash2 className="w-3 h-3" /> Cancel</>}
                                      </button>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </div>
                    )
                  )}

                  {/* SALES SUBTAB */}
                  {dashboardSubTab === 'sales' && (
                    traderSalesListings.length === 0 ? (
                      <div className="py-16 text-center border border-dashed border-[#161616] rounded-sm">
                        <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase">No completed sales recorded yet</p>
                      </div>
                    ) : (
                      <div className="border border-[#161616] rounded-sm overflow-x-auto scrollbar-none">
                        <div className="min-w-[800px]">
                          <div className="grid grid-cols-12 px-4 py-3 bg-[#050507] border-b border-[#161616]">
                            {['Sold Asset', 'Revenue Earned', 'Buyer Address', 'Explorer Link'].map((h, i) => (
                              <div key={h} className={`font-heading text-[8px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-4' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-4' : 'col-span-2'}`}>{h}</div>
                            ))}
                          </div>
                          {traderSalesListings.map((listing, i) => (
                            <div key={listing.id} className="grid grid-cols-12 items-center px-4 py-3.5 border-b border-[#111] last:border-0"
                            >
                              <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 text-xs bg-black/40 border" 
                                  style={{ 
                                    borderColor: RARITY_BORDER[listing.rarity], 
                                    color: RARITY_COLOR[listing.rarity] 
                                  }}>
                                  {(() => {
                                    const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                    return <IconComponent className="w-3.5 h-3.5" />;
                                  })()}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-heading text-xs font-bold text-white truncate leading-none mb-1">{listing.gameName}</span>
                                  <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level} &middot; {listing.rarity}</span>
                                </div>
                              </div>
                              <div className="col-span-2 font-heading font-bold text-xs text-[#a9ddd3]">{listing.price} <span className="text-[9px] text-text-muted">ETH</span></div>
                              <div className="col-span-4 font-mono text-[10px] text-text-secondary">{listing.buyer ? `${listing.buyer.slice(0, 10)}...${listing.buyer.slice(-6)}` : 'Unknown'}</div>
                              <div className="col-span-2">
                                {listing.saleTxHash ? (
                                  <a href={`https://sepolia.basescan.org/tx/${listing.saleTxHash}`} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-heading uppercase tracking-wider text-[#a9ddd3] hover:text-white transition-colors">
                                    Scan <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : <span className="text-[9px] text-text-muted font-mono">—</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {/* PURCHASES SUBTAB */}
                  {dashboardSubTab === 'purchases' && (
                    traderPurchasesListings.length === 0 ? (
                      <div className="py-16 text-center border border-dashed border-[#161616] rounded-sm">
                        <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3.5">No assets purchased yet</p>
                        <button onClick={() => setActiveTab('buy')} className="btn-primary text-[9px] px-5 py-2.5 rounded-sm">Browse Market</button>
                      </div>
                    ) : (
                      <div className="border border-[#161616] rounded-sm overflow-x-auto scrollbar-none">
                        <div className="min-w-[800px]">
                          <div className="grid grid-cols-12 px-4 py-3 bg-[#050507] border-b border-[#161616]">
                            {['Purchased Asset', 'Acquisition Cost', 'Seller Address', 'Explorer Link'].map((h, i) => (
                              <div key={h} className={`font-heading text-[8px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-4' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-4' : 'col-span-2'}`}>{h}</div>
                            ))}
                          </div>
                          {traderPurchasesListings.map((listing, i) => (
                            <div key={listing.id} className="grid grid-cols-12 items-center px-4 py-3.5 border-b border-[#111] last:border-0"
                            >
                              <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 text-xs bg-black/40 border" 
                                  style={{ 
                                    borderColor: RARITY_BORDER[listing.rarity], 
                                    color: RARITY_COLOR[listing.rarity] 
                                  }}>
                                  {(() => {
                                    const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                    return <IconComponent className="w-3.5 h-3.5" />;
                                  })()}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-heading text-xs font-bold text-white truncate leading-none mb-1">{listing.gameName}</span>
                                  <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level} &middot; {listing.rarity}</span>
                                </div>
                              </div>
                              <div className="col-span-2 font-heading font-bold text-xs text-[#a9ddd3]">{listing.price} <span className="text-[9px] text-text-muted">ETH</span></div>
                              <div className="col-span-4 font-mono text-[10px] text-text-secondary">{listing.seller ? `${listing.seller.slice(0, 10)}...${listing.seller.slice(-6)}` : 'Unknown'}</div>
                              <div className="col-span-2">
                                {listing.saleTxHash ? (
                                  <a href={`https://sepolia.basescan.org/tx/${listing.saleTxHash}`} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-heading uppercase tracking-wider text-[#a9ddd3] hover:text-white transition-colors">
                                    Scan <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : <span className="text-[9px] text-text-muted font-mono">—</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {/* REWARDS SUBTAB */}
                  {dashboardSubTab === 'rewards' && (
                    preparedRewards.length === 0 ? (
                      <div className="py-16 text-center border border-dashed border-[#161616] rounded-sm">
                        <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3.5">No rewards pending minting inside vault</p>
                        <Link href="/play" className="btn-primary text-[9px] px-5 py-2.5 rounded-sm inline-block">Play & Unlock Levels</Link>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {preparedRewards.map(reward => {
                          const levelNum = reward.levelId.split('-').pop();
                          const isMinting = reward.claimStatus === 'MINTING' || listingTxStates[reward.id] === 'signing' || listingTxStates[reward.id] === 'pending';
                          return (
                            <div
                              key={reward.id}
                              className="p-5 relative transition-all duration-300 flex flex-col justify-between rounded-md border"
                              style={{
                                background: '#09090c',
                                borderColor: RARITY_BORDER[reward.rarity] || '#161616',
                                boxShadow: `0 0 12px ${RARITY_BORDER[reward.rarity] || 'transparent'}`
                              }}
                            >
                              <div className="absolute inset-0 pointer-events-none opacity-5 bg-radial-card" style={{
                                background: `radial-gradient(circle at 50% 20%, ${RARITY_COLOR[reward.rarity]}, transparent)`
                              }} />
                              
                              <div className="space-y-3 relative z-10">
                                <div className="flex justify-between items-start">
                                  <span className="text-[8px] font-heading font-black tracking-widest uppercase bg-black/40 px-2 py-0.5 border" style={{ color: RARITY_COLOR[reward.rarity], borderColor: RARITY_BORDER[reward.rarity] }}>
                                    {reward.rarity}
                                  </span>
                                  <span className="text-[8px] font-mono text-zinc-500">
                                    RANK #{reward.completionRank}
                                  </span>
                                </div>
                                
                                <div className="py-2">
                                  <h4 className="font-heading font-black text-2xl text-white tracking-tight uppercase">Level {levelNum}</h4>
                                  <p className="text-[9px] font-heading tracking-widest text-zinc-400 uppercase mt-0.5">{reward.season.replace('-', ' ')}</p>
                                </div>
                              </div>
                              
                              <div className="mt-4 pt-4 border-t border-[#161616] relative z-10">
                                <button
                                  onClick={() => handleMintReward(reward)}
                                  disabled={isAnyTxActive || isNetworkMismatch || isWalletAccountMismatch || isMinting}
                                  className="w-full py-2.5 text-[9px] font-heading font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm hover:shadow-[#a9ddd3]/10 rounded-sm font-bold"
                                  style={{
                                    background: isMinting ? '#222' : RARITY_COLOR[reward.rarity] || '#a9ddd3',
                                    color: isMinting ? '#555' : '#000',
                                    boxShadow: `0 0 10px ${RARITY_BORDER[reward.rarity] || 'rgba(31,31,31,0.3)'}`
                                  }}
                                >
                                  {isMinting ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>MINTING...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Zap className="w-3.5 h-3.5 fill-current" />
                                      <span>MINT NFT REWARD</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}

                  {/* PROGRESSION TIMELINE */}
                  {dashboardSubTab === 'progression' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Contiguous Effective Level', value: dbUser?.effectiveProgressionLevel ?? 0, desc: 'Highest unbroken NFT level held' },
                          { label: 'Highest Playable Level', value: dbUser?.highestUnlockedLevel ?? 1, desc: 'Max level unlocked in gameplay' },
                          { label: 'Highest Score Record', value: dbUser?.highestScore ?? 0, desc: 'All-time retro leaderboard score' },
                          { label: 'Max Combo Multiplier', value: `${(dbUser?.highestCombo ?? 1.0).toFixed(1)}x`, desc: 'Highest combo chain achieved' }
                        ].map(stat => (
                          <div key={stat.label} className="bg-[#09090c] border border-zinc-800 p-5 space-y-2 relative overflow-hidden group rounded-sm">
                            <div className="absolute top-0 left-0 w-2 h-[1px] bg-[#a9ddd3]" />
                            <div className="absolute top-0 left-0 w-[1px] h-2 bg-[#a9ddd3]" />
                            <div className="text-[8px] font-heading tracking-[0.15em] text-zinc-500 uppercase">{stat.label}</div>
                            <div className="text-3xl font-heading font-black text-white">{stat.value}</div>
                            <div className="text-[8px] font-mono text-zinc-400">{stat.desc}</div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-[#09090c] border border-[#161616] p-6 relative rounded-sm">
                        <h4 className="font-heading text-[9px] font-bold uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2">
                          <Layers className="w-4 h-4 text-[#a9ddd3]" /> ON-CHAIN PROGRESSION TIMELINE (LEVELS 1-10)
                        </h4>

                        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-4 py-4 overflow-x-auto scrollbar-none">
                          <div className="hidden md:block absolute top-[43px] left-8 right-8 h-0.5 bg-zinc-800 z-0" />
                          
                          {Array.from({ length: 10 }).map((_, idx) => {
                            const level = idx + 1;
                            const isHeld = inventory.some(item => item.level === level);
                            const isContiguous = level <= (dbUser?.effectiveProgressionLevel ?? 0);
                            
                            return (
                              <div key={level} className="relative z-10 flex md:flex-col items-center gap-4 md:gap-2 flex-1 min-w-[70px]">
                                <div 
                                  className="w-10 h-10 rounded-full flex items-center justify-center font-heading font-black text-xs transition-all duration-300 relative"
                                  style={{
                                    background: isContiguous ? 'rgba(169,221,211,0.15)' : isHeld ? 'rgba(31,31,31,0.8)' : '#000',
                                    border: isContiguous ? '2px solid #a9ddd3' : isHeld ? '1px solid rgba(169,221,211,0.4)' : '1px solid #27272a',
                                    color: isContiguous ? '#a9ddd3' : isHeld ? '#f59e0b' : '#3f3f46',
                                    boxShadow: isContiguous ? '0 0 15px rgba(169,221,211,0.3)' : 'none'
                                  }}
                                >
                                  {isContiguous && <div className="absolute inset-1 rounded-full border border-[#a9ddd3]/20 animate-ping" />}
                                  {level}
                                </div>

                                <div className="flex flex-col md:items-center text-left md:text-center space-y-0.5">
                                  <span className="text-[8px] font-heading font-black uppercase tracking-wider">
                                    LVL {level}
                                  </span>
                                  <span 
                                    className="text-[7px] font-mono uppercase tracking-widest font-black"
                                    style={{ color: isContiguous ? '#a9ddd3' : isHeld ? '#f59e0b' : '#3f3f46' }}
                                  >
                                    {isContiguous ? 'ACTIVE' : isHeld ? 'HELD' : 'LOCKED'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-[#111] text-[8px] font-mono text-zinc-500">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full border border-[#a9ddd3] bg-[#a9ddd3]/10" />
                            <span>ACTIVE (Contiguous Chain Level)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full border border-[#a9ddd3]/40 bg-zinc-900" />
                            <span>HELD (Owned but chain broken)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full border border-zinc-800 bg-black" />
                            <span>LOCKED (Not owned)</span>
                          </div>
                        </div>
                      </div>

                      {/* Developer Diagnostics Panel Toggle */}
                      <div className="mt-6">
                        <button 
                          onClick={() => setShowDevPanel(!showDevPanel)}
                          className="text-[8px] font-heading font-black tracking-[0.25em] uppercase px-4 py-2 border transition-all cursor-pointer rounded-sm"
                          style={{
                            borderColor: showDevPanel ? '#a9ddd3' : '#27272a',
                            color: showDevPanel ? '#a9ddd3' : '#52525b',
                            background: showDevPanel ? 'rgba(169,221,211,0.05)' : 'transparent'
                          }}
                        >
                          {showDevPanel ? '[ CLOSE DEVELOPER DIAGNOSTICS ]' : '[ OPEN DEVELOPER DIAGNOSTICS ]'}
                        </button>

                        <AnimatePresence>
                          {showDevPanel && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden mt-4"
                            >
                              <div className="p-5 font-mono text-[9px] bg-black border border-zinc-800 space-y-4 relative rounded-sm">
                                <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
                                
                                <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                                  <span className="text-[#a9ddd3] font-bold uppercase tracking-wider">// SYSTEM RUNTIME METRICS</span>
                                  <button 
                                    onClick={fetchDiagnostics} 
                                    disabled={isFetchingDiagnostics}
                                    className="px-2 py-0.5 border border-zinc-800 text-[8px] text-zinc-400 hover:text-white transition-colors uppercase disabled:opacity-40 cursor-pointer rounded-sm bg-black/40"
                                  >
                                    {isFetchingDiagnostics ? 'Diagnosing...' : 'Force Run'}
                                  </button>
                                </div>

                                {diagnosticsData ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-zinc-900">
                                    <div className="space-y-2">
                                      <div className="font-bold text-white uppercase tracking-wider text-[8px] text-zinc-500">// ENVIRONMENT & HARDWARE</div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Status:</span>
                                        <span className={diagnosticsData.health === 'HEALTHY' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{diagnosticsData.health}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Database Connection:</span>
                                        <span className={diagnosticsData.database?.status === 'HEALTHY' ? 'text-green-400' : 'text-red-400'}>
                                          {diagnosticsData.database?.status} {diagnosticsData.database?.latencyMs ? `(${diagnosticsData.database.latencyMs}ms)` : ''}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Required Environment:</span>
                                        <span className={diagnosticsData.environment?.status === 'HEALTHY' ? 'text-green-400' : 'text-yellow-400'}>
                                          {diagnosticsData.environment?.status} {diagnosticsData.environment?.missing?.length > 0 ? `(Missing: ${diagnosticsData.environment.missing.join(', ')})` : ''}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Indexer Connection:</span>
                                        <span className={diagnosticsData.indexer?.mode === 'WEBSOCKET' ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold animate-pulse'}>
                                          {diagnosticsData.indexer?.mode}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="space-y-2 pt-4 md:pt-0 md:pl-4">
                                      <div className="font-bold text-white uppercase tracking-wider text-[8px] text-zinc-500">// RPC & SYNCHRONIZATION INFRASTRUCTURE</div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">RPC Sepolia Node:</span>
                                        <span className={diagnosticsData.rpc?.status === 'HEALTHY' ? 'text-green-400' : 'text-red-400'}>
                                          {diagnosticsData.rpc?.status} {diagnosticsData.rpc?.latencyMs ? `(${diagnosticsData.rpc.latencyMs}ms)` : ''}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Base Sepolia blockHeight:</span>
                                        <span className="text-white font-bold">{diagnosticsData.rpc?.blockNumber ?? 'UNKNOWN'}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">WS Reconnects Count:</span>
                                        <span className="text-white">{diagnosticsData.indexer?.metrics?.indexerReconnectCount ?? 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">WS Total Drops / Failures:</span>
                                        <span className={diagnosticsData.indexer?.metrics?.websocketFailures > 0 ? 'text-yellow-500' : 'text-white'}>
                                          {diagnosticsData.indexer?.metrics?.websocketFailures ?? 0}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Last Synced Loop Timing:</span>
                                        <span className="text-white">{diagnosticsData.indexer?.metrics?.lastSyncDurationMs ?? 0} ms</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-zinc-500">Last Progression Loop:</span>
                                        <span className="text-white">{diagnosticsData.indexer?.metrics?.lastProgressionDurationMs ?? 0} ms</span>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-zinc-500 py-4 justify-center">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Establishing secure diagnostic connection...</span>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* RESERVED SUBTAB */}
                  {dashboardSubTab === 'reserved' && (
                    reservedInventory.length === 0 ? (
                      <div className="py-16 text-center border border-dashed border-[#161616] rounded-sm">
                        <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase">No assets currently reserved in escrow</p>
                      </div>
                    ) : (
                      <div className="border border-[#161616] rounded-sm overflow-x-auto scrollbar-none">
                        <div className="min-w-[800px]">
                          <div className="grid grid-cols-12 px-4 py-3 bg-[#050507] border-b border-[#161616]">
                            {['Reserved Asset', 'Rarity', 'Locked Price', 'Quantity', 'Expiry / Lockout', 'Locked Date', ''].map((h, i) => (
                              <div key={h} className={`font-heading text-[8px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-2' : i === 2 ? 'col-span-2' : i === 4 ? 'col-span-2' : i === 5 ? 'col-span-2' : i === 6 ? 'col-span-2 text-right' : 'col-span-1'}`}>{h}</div>
                            ))}
                          </div>
                          <AnimatePresence>
                            {reservedInventory.map((item, i) => {
                              const isPending = listingTxStates[item.id] === 'signing' || listingTxStates[item.id] === 'pending';
                              const priceEth = formatEther(BigInt(item.price));
                              const listingToCancel = {
                                id: item.id,
                                listingHash: item.listingHash,
                                seller: activeWalletAddress,
                                tokenId: item.tokenId,
                                amount: item.amount,
                                price: priceEth,
                                expiry: item.expiry,
                                nonce: item.nonce
                              };

                              return (
                                <motion.div
                                  layout
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ 
                                    opacity: isPending ? 0.45 : 1,
                                    filter: isPending ? 'blur(0.5px)' : 'none'
                                  }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  key={item.id}
                                  className="grid grid-cols-12 items-center px-4 py-3.5 border-b border-[#111] last:border-0"
                                  style={{
                                    background: 'rgba(239,68,68,0.01)',
                                    pointerEvents: isAnyTxActive ? 'none' : 'auto'
                                  }}
                                >
                                  <div className="col-span-2 flex items-center gap-2.5">
                                    <div className="w-7 h-7 flex items-center justify-center rounded-sm bg-[#ef4444]/5 border border-[#ef4444]/25 text-xs text-[#ef4444]">
                                      🔒
                                    </div>
                                    <span className="font-heading text-xs font-bold text-white">Lvl {item.level}</span>
                                  </div>
                                  <div className="col-span-1">
                                    <span className="text-[8px] font-heading font-bold uppercase px-1.5 py-0.5 border" style={{ color: RARITY_COLOR[item.rarity], borderColor: RARITY_BORDER[item.rarity], background: `${RARITY_COLOR[item.rarity]}08` }}>{item.rarity}</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-heading font-bold text-xs text-white">{priceEth}</span>
                                    <span className="font-heading text-[8px] text-text-muted ml-1">ETH</span>
                                  </div>
                                  <div className="col-span-1">
                                    <span className="font-mono text-xs text-text-secondary">x{item.amount}</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-mono text-[9px] text-text-muted">Expires {new Date(item.expiry * 1000).toLocaleDateString()}</span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="font-mono text-[9px] text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
                                  </div>
                                  <div className="col-span-2 flex justify-end">
                                    <button
                                      onClick={() => handleCancelListing(listingToCancel)}
                                      disabled={isAnyTxActive || isNetworkMismatch || isPending}
                                      className="px-3 py-1.5 text-[8px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition-all cursor-pointer rounded-sm hover:bg-red-500/10"
                                      style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', background: 'transparent' }}
                                    >
                                      {listingTxStates[item.id] === 'signing' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Voiding...</> :
                                       listingTxStates[item.id] === 'pending' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pending...</> :
                                       <><Trash2 className="w-3 h-3" /> Cancel</>}
                                    </button>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
          </div>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAVIGATION TAB BAR ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#040404] border-t border-[#161616] flex items-center justify-around z-50">
        <button 
          onClick={() => setActiveTab('buy')}
          className={`p-3 flex flex-col items-center justify-center transition-colors ${activeTab === 'buy' ? 'text-[#a9ddd3]' : 'text-text-muted'}`}
        >
          <Grid className="w-4 h-4" />
          <span className="text-[7px] font-heading font-bold uppercase mt-1">Market</span>
        </button>
        <button 
          onClick={() => { if (!authenticated) { login(); return; } setActiveTab('sell'); }}
          className={`p-3 flex flex-col items-center justify-center transition-colors ${activeTab === 'sell' ? 'text-[#a9ddd3]' : 'text-text-muted'}`}
        >
          <Tag className="w-4 h-4" />
          <span className="text-[7px] font-heading font-bold uppercase mt-1">List</span>
        </button>
        <button 
          onClick={() => { if (!authenticated) { login(); return; } setActiveTab('dashboard'); }}
          className={`p-3 flex flex-col items-center justify-center transition-colors ${activeTab === 'dashboard' ? 'text-[#a9ddd3]' : 'text-text-muted'}`}
        >
          <TrendingUp className="w-4 h-4" />
          <span className="text-[7px] font-heading font-bold uppercase mt-1">Trades</span>
        </button>
        <button 
          onClick={() => { setActiveTab('dashboard'); setDashboardSubTab('progression'); setShowDevPanel(!showDevPanel); }}
          className={`p-3 flex flex-col items-center justify-center transition-colors ${showDevPanel ? 'text-[#a9ddd3]' : 'text-text-muted'}`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[7px] font-heading font-bold uppercase mt-1">Dev</span>
        </button>
      </div>

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

export default function MarketplaceWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Marketplace />
    </ErrorBoundary>
  );
}
