'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useState, useMemo } from 'react';
import { 
  ShoppingBag, Tag, Trash2, ShieldAlert, ExternalLink, Loader2,
  Calendar, Layers, Coins, BadgeAlert, UserCheck, TrendingUp,
  History, AlertTriangle, RefreshCw, X, CheckCircle2, Info, Zap,
  Cpu, Trophy, Gamepad2, Swords, Grid
} from 'lucide-react';
import Link from 'next/link';
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

function Marketplace() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

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
  const [dbUser, setDbUser] = useState<any>(null);
  const [preparedRewards, setPreparedRewards] = useState<any[]>([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [reservedInventory, setReservedInventory] = useState<any[]>([]);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isFetchingDiagnostics, setIsFetchingDiagnostics] = useState(false);

  // Per-listing or action transaction states
  const [listingTxStates, setListingTxStates] = useState<Record<string, TxState>>({});

  const activeWalletAddress = user?.wallet?.address;
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
          ApiService.fetchWithAuth('/api/marketplace/sync', { method: 'POST' }, getAccessToken)
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
      // Execute silent full sync to align db and on-chain state
      await forceSynchronizedRefresh(true);
      
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
    }
  };

  useEffect(() => { 
    fetchListings(); 
    fetchInventoryAndConfig(); 
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
      return true;
    });
  }, [listings, activeWalletAddress, selectedGameFilter]);

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
      
      const sellerNonce = await publicClient.readContract({ 
        address: MARKETPLACE_ADDRESS as `0x${string}`, 
        abi: RCADE_MARKETPLACE_ABI, 
        functionName: 'userNonces', 
        args: [activeWallet.address as `0x${string}`] 
      });
      
      const priceWei = parseEther(sellPrice);
      const expiryUnix = Math.floor(Date.now() / 1000) + (86400 * sellExpiryDays);
      const uniqueListingNonce = sellerNonce + BigInt(Math.floor(Math.random() * 1000000) + 1);

      toast.loading("Awaiting Signature", "Please sign typed data payload in wallet extension...", { id: toastId });

      const signature = await walletClient.signTypedData({ 
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

      // Audit operator approval states
      toast.loading("Awaiting Signature", "Checking marketplace operator approval...", { id: toastId });
      const isApproved = await publicClient.readContract({ 
        address: CONTRACT_ADDRESS as `0x${string}`, 
        abi: RCADE_ERC1155_ABI, 
        functionName: 'isApprovedForAll', 
        args: [activeWallet.address as `0x${string}`, MARKETPLACE_ADDRESS as `0x${string}`] 
      });

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
        
        toast.loading("Waiting for Confirmation...", "Transaction Pending... voiding approvals in base sepolia", { id: toastId });
        setListingTxStates(prev => ({ ...prev, list: 'pending' }));
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        toast.success("Approved", "Marketplace authorized successfully!");
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

      if (!cancelRes.ok) { 
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

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-7xl mx-auto px-4 py-10 w-full relative">

      {/* ── BANNERS ─────────────────────────────────────────── */}
      {isWalletAccountMismatch && (
        <div className="mb-6 p-4 flex items-start gap-3" style={{ background: 'rgba(169,221,211,0.05)', border: '1px solid rgba(169,221,211,0.3)', borderLeft: '3px solid #a9ddd3' }}>
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#a9ddd3' }} />
          <div>
            <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white mb-1">Wallet Mismatch Detected</h4>
            <p className="text-[9px] font-mono" style={{ color: '#888' }}>Extension shows <strong className="text-white">{wallets[0]?.address ? `${wallets[0].address.slice(0, 6)}...${wallets[0].address.slice(-4)}` : 'Unknown'}</strong>, please reconnect the authenticated wallet <strong style={{ color: '#a9ddd3' }}>{activeWalletAddress?.slice(0, 6)}...{activeWalletAddress?.slice(-4)}</strong>.</p>
          </div>
        </div>
      )}
      {isNetworkMismatch && (
        <div className="mb-6 p-4 flex items-center justify-between gap-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.35)', borderLeft: '3px solid #ef4444' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 mb-1">Wrong network. Please switch to Base Sepolia.</h4>
              <p className="text-[9px] font-mono text-text-secondary">Switch to Base Sepolia (Chain ID: 84532) to unlock marketplace operations.</p>
            </div>
          </div>
          <button onClick={() => ensureCorrectChain(activeWallet)} className="px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-wider text-black flex-shrink-0 cursor-pointer" style={{ background: '#ef4444' }}>Switch Network</button>
        </div>
      )}

      {/* ── PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 pb-6" style={{ borderBottom: '1px solid #1f1f1f' }}>
        <div>
          <p className="text-[10px] font-heading tracking-[0.25em] mb-2 uppercase" style={{ color: '#a9ddd3' }}>EIP-712 · ERC-1155 · Base Sepolia</p>
          <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tight">NFT Marketplace</h1>
        </div>
        {authenticated && (
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#0d0d0d', border: '1px solid #1f1f1f' }}>
            <div>
              <span className="text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase block">Wallet</span>
              <span className="text-xs font-mono text-white">{activeWalletAddress?.slice(0, 6)}...{activeWalletAddress?.slice(-4)}</span>
            </div>
            <div style={{ borderLeft: '1px solid #1f1f1f', paddingLeft: '12px' }}>
              <span className="text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase block">Balance</span>
              <span className="text-xs font-heading font-bold flex items-center gap-1" style={{ color: '#a9ddd3' }}><Coins className="w-3 h-3" />{ethBalance} ETH</span>
            </div>
            <button onClick={() => forceSynchronizedRefresh(false)} disabled={isSyncing || isAnyTxActive} className="p-2 transition-colors border border-border hover:border-orange ml-1 cursor-pointer disabled:opacity-30" style={{ color: isSyncing ? '#a9ddd3' : '#444' }} title="Sync">
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* ── TAB NAV (Optimized for Mobile scroll & layout alignment) ── */}
      <div className="flex flex-row flex-nowrap mb-8 overflow-x-auto scrollbar-none pb-1" style={{ borderBottom: '1px solid #1f1f1f', WebkitOverflowScrolling: 'touch' }}>
        {([
          { id: 'buy',       label: `Buy  (${buyableListings.length})` },
          { id: 'sell',      label: 'Sell Assets',      auth: true },
          { id: 'dashboard', label: 'My Trades',        auth: true },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => { 
              if ((tab as any).auth && !authenticated) { 
                login(); 
                return; 
              } 
              setActiveTab(tab.id); 
            }}
            disabled={isAnyTxActive}
            className="px-6 py-3.5 text-[10px] font-heading font-bold tracking-[0.15em] uppercase transition-all whitespace-nowrap cursor-pointer disabled:opacity-40"
            style={{
              color: activeTab === tab.id ? '#a9ddd3' : '#444',
              borderBottom: activeTab === tab.id ? '2px solid #a9ddd3' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          BUY TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'buy' && (
        <div className="min-h-[450px]">
          {/* Game Filters sub-navigation */}
          <div className="flex flex-row flex-wrap items-center gap-2 mb-6 pb-3" style={{ borderBottom: '1px solid #141414' }}>
            {([
              { id: 'ALL',          label: 'All Games',    icon: Gamepad2, color: '#a9ddd3' },
              { id: 'neon-snake',   label: 'Neon Snake',   icon: Zap,      color: '#a9ddd3' },
              { id: 'cyber-runner', label: 'Cyber Runner', icon: Cpu,      color: '#22d3ee' },
              { id: 'void-arena',   label: 'Void Arena',   icon: Layers,   color: '#a855f7' },
              { id: 'pixel-heist',  label: 'Pixel Heist',  icon: Trophy,   color: '#22c55e' },
              { id: 'space-impact', label: 'Space Impact', icon: Swords,   color: '#ec4899' },
              { id: 'sudoku',       label: 'Sudoku Matrix', icon: Grid,     color: '#fbbf24' }
            ] as const).map(filter => {
              const Icon = filter.icon;
              const isSelected = selectedGameFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setSelectedGameFilter(filter.id)}
                  disabled={isAnyTxActive}
                  className="px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  style={{
                    background: isSelected ? `rgba(${filter.id === 'cyber-runner' ? '34,211,238' : filter.id === 'void-arena' ? '168,85,247' : filter.id === 'pixel-heist' ? '34,197,94' : filter.id === 'space-impact' ? '236,72,153' : filter.id === 'sudoku' ? '251,191,36' : '169,221,211'}, 0.08)` : '#0c0c0c',
                    border: isSelected ? `1px solid ${filter.color}` : '1px solid #1f1f1f',
                    color: isSelected ? filter.color : '#888',
                    boxShadow: isSelected ? `0 0 10px rgba(${filter.id === 'cyber-runner' ? '34,211,238' : filter.id === 'void-arena' ? '168,85,247' : filter.id === 'pixel-heist' ? '34,197,94' : filter.id === 'space-impact' ? '236,72,153' : filter.id === 'sudoku' ? '251,191,36' : '169,221,211'}, 0.15)` : 'none'
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {filter.label}
                </button>
              );
            })}
          </div>

          {isListingsLoading ? (
            /* Premium Retro Shimmer Loading Skeletons */
            <div style={{ border: '1px solid #1f1f1f' }} className="divide-y divide-zinc-900">
              <div className="grid grid-cols-12 px-4 py-3" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                {['Asset', 'Rarity', 'Level', 'Qty', 'Price', 'Expires', 'Seller', ''].map(h => (
                  <div key={h} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${h === '' ? 'col-span-2 text-right' : h === 'Asset' ? 'col-span-2' : 'col-span-1'}`}>{h}</div>
                ))}
              </div>
              {[1, 2, 3, 4].map(idx => (
                <div key={idx} className="grid grid-cols-12 items-center px-4 py-4"
                  style={{
                    background: 'linear-gradient(90deg, #0d0d0d 25%, #141414 50%, #0d0d0d 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2.5s linear infinite'
                  }}
                >
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="w-8 h-8 bg-zinc-950 border border-zinc-900 flex-shrink-0 animate-pulse" />
                    <div className="w-16 h-3 bg-zinc-900 animate-pulse" />
                  </div>
                  <div className="col-span-1"><div className="w-12 h-3 bg-zinc-900 animate-pulse" /></div>
                  <div className="col-span-1"><div className="w-6 h-3 bg-zinc-900 animate-pulse" /></div>
                  <div className="col-span-1"><div className="w-6 h-3 bg-zinc-900 animate-pulse" /></div>
                  <div className="col-span-2"><div className="w-16 h-3 bg-zinc-900 animate-pulse" /></div>
                  <div className="col-span-2"><div className="w-16 h-3 bg-zinc-900 animate-pulse" /></div>
                  <div className="col-span-1"><div className="w-10 h-3 bg-zinc-900 animate-pulse" /></div>
                  <div className="col-span-2 flex justify-end"><div className="w-16 h-7 bg-zinc-900 animate-pulse" /></div>
                </div>
              ))}
            </div>
          ) : buyableListings.length === 0 ? (
            <div className="py-24 text-center" style={{ border: '1px dashed #1f1f1f' }}>
              <ShoppingBag className="w-10 h-10 mx-auto mb-4 text-text-muted" />
              <p className="font-heading text-xs text-text-muted uppercase tracking-widest mb-1">No active listings</p>
              <p className="text-[9px] font-heading tracking-widest text-text-muted uppercase">Awaiting off-chain transmissions</p>
            </div>
          ) : (
            /* ── Listing table view ── */
            <div style={{ border: '1px solid #1f1f1f' }} className="overflow-x-auto scrollbar-none">
              <div className="min-w-[800px]">
                {/* Table header */}
                <div className="grid grid-cols-12 px-4 py-3" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                  {['Asset', 'Rarity', 'Level', 'Qty', 'Price', 'Expires', 'Seller', ''].map(h => (
                    <div key={h} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${h === '' ? 'col-span-2 text-right' : h === 'Asset' ? 'col-span-2' : 'col-span-1'}`}>{h}</div>
                  ))}
                </div>
                {/* Rows with custom Framer Motion transitions */}
                <AnimatePresence>
                  {buyableListings.map((listing, i) => {
                    const isPending = listingTxStates[listing.id] === 'signing' || listingTxStates[listing.id] === 'pending' || listing.pendingPurchase;
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ 
                          opacity: isPending ? 0.35 : 1,
                          filter: isPending ? 'blur(1px)' : 'none'
                        }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.25 }}
                        key={listing.id}
                        className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors group relative"
                        style={{ 
                          borderBottom: i < buyableListings.length - 1 ? '1px solid #141414' : 'none', 
                          background: 'transparent',
                          pointerEvents: isAnyTxActive ? 'none' : 'auto'
                        }}
                      >
                        {/* Asset name */}
                        <div className="col-span-2 flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 flex items-center justify-center font-heading font-black text-sm flex-shrink-0"
                            style={{ 
                              background: 'rgba(169,221,211,0.08)', 
                              border: `1px solid ${RARITY_BORDER[listing.rarity]}`, 
                              color: RARITY_COLOR[listing.rarity] 
                            }}>
                            {(() => {
                              const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                              return <IconComponent className="w-4 h-4" />;
                            })()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-heading text-xs font-bold text-white truncate leading-tight">{listing.gameName}</span>
                            <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level}</span>
                          </div>
                        </div>
                        {/* Rarity */}
                        <div className="col-span-1">
                          <span className="text-[9px] font-heading font-bold uppercase" style={{ color: RARITY_COLOR[listing.rarity] }}>{listing.rarity}</span>
                        </div>
                        {/* Level */}
                        <div className="col-span-1">
                          <span className="font-heading text-xs text-white font-bold">{listing.level}</span>
                        </div>
                        {/* Qty */}
                        <div className="col-span-1">
                          <span className="font-mono text-xs text-text-secondary">x{listing.amount}</span>
                        </div>
                        {/* Price */}
                        <div className="col-span-2">
                          <span className="font-heading font-bold text-sm" style={{ color: '#a9ddd3' }}>{listing.price}</span>
                          <span className="font-heading text-[9px] text-text-muted ml-1">ETH</span>
                        </div>
                        {/* Expires */}
                        <div className="col-span-2">
                          <span className="font-mono text-[9px] text-text-muted">{new Date(listing.expiry * 1000).toLocaleDateString()}</span>
                        </div>
                        {/* Seller */}
                        <div className="col-span-1">
                          <span className="font-mono text-[9px] text-text-muted">{listing.seller.slice(0, 6)}...</span>
                        </div>
                        {/* Buy button */}
                        <div className="col-span-2 flex justify-end">
                          <button
                            onClick={() => handleBuyListing(listing)}
                            disabled={isAnyTxActive || isNetworkMismatch || isWalletAccountMismatch || isPending}
                            className="px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-widest disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer relative overflow-hidden"
                            style={{ background: '#a9ddd3', color: '#000' }}
                          >
                            {listingTxStates[listing.id] === 'signing' && <><Loader2 className="w-3 h-3 animate-spin" /> Sign...</>}
                            {listingTxStates[listing.id] === 'pending' && <><Loader2 className="w-3 h-3 animate-spin" /> Wait...</>}
                            {(!listingTxStates[listing.id] || listingTxStates[listing.id] === 'idle') && 'Buy'}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SELL TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'sell' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border">
          {/* ── NFT vault grid ── */}
          <div className="lg:col-span-2 bg-bg-void p-6">
            <h3 className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2 pb-4" style={{ borderBottom: '1px solid #1f1f1f' }}>
              <Layers className="w-4 h-4" style={{ color: '#a9ddd3' }} /> Select Asset From Vault
            </h3>
            {isLoadingInventory ? (
              <div className="flex justify-center items-center py-16">
                <div className="w-8 h-8 border-2 border-t-transparent animate-spin" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
              </div>
            ) : inventory.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-heading text-xs text-text-muted uppercase tracking-widest mb-4">No assets in vault</p>
                <Link href="/play" className="btn-primary text-[10px] px-6 py-2.5">Play to Earn NFTs</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {inventory.map(nft => {
                  const isSelected = selectedNft?.tokenId === nft.tokenId;
                  return (
                    <button
                      key={nft.tokenId}
                      disabled={isAnyTxActive}
                      onClick={() => { setSelectedNft(nft); setSellAmount(1); }}
                      className="relative p-4 flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-40 min-h-[110px]"
                      style={{
                        background: isSelected ? 'rgba(169,221,211,0.08)' : '#0d0d0d',
                        border: isSelected ? '1px solid #a9ddd3' : '1px solid #1f1f1f',
                        boxShadow: isSelected ? '0 0 20px rgba(169,221,211,0.2)' : 'none',
                      }}
                    >
                      <div className="absolute top-2 right-2 text-[9px] font-heading font-bold" style={{ color: '#a9ddd3' }}>x{nft.amount}</div>
                      <div className="mb-2" style={{ color: RARITY_COLOR[nft.rarity] }}>
                        {(() => {
                          const IconComponent = GAME_ICON_MAP[nft.gameIcon] || Gamepad2;
                          return <IconComponent className="w-5 h-5 mx-auto" style={{ color: RARITY_COLOR[nft.rarity] }} />;
                        })()}
                      </div>
                      <div className="font-heading text-[10px] font-bold text-white uppercase truncate max-w-full">{nft.gameName}</div>
                      <div className="text-[8px] font-mono text-text-muted uppercase tracking-wider mt-0.5">Lvl {nft.level} · {nft.rarity}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sell form ── */}
          <div className="bg-bg-card p-6">
            <h3 className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white mb-6 pb-4 flex items-center gap-2" style={{ borderBottom: '1px solid #1f1f1f' }}>
              <Tag className="w-4 h-4" style={{ color: '#a9ddd3' }} /> List Config
            </h3>
            {selectedNft ? (
              <div className="space-y-5">
                {/* Selected NFT preview */}
                <div className="flex items-center gap-3 p-3" style={{ background: '#0d0d0d', border: '1px solid #1f1f1f' }}>
                  <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" 
                    style={{ 
                      background: 'rgba(169,221,211,0.08)', 
                      border: `1px solid ${RARITY_BORDER[selectedNft.rarity]}`, 
                      color: RARITY_COLOR[selectedNft.rarity] 
                    }}>
                    {(() => {
                      const IconComponent = GAME_ICON_MAP[selectedNft.gameIcon] || Gamepad2;
                      return <IconComponent className="w-5 h-5" />;
                    })()}
                  </div>
                  <div>
                    <div className="font-heading text-xs font-bold text-white">{selectedNft.gameName}</div>
                    <div className="text-[9px] font-heading text-text-muted uppercase">Level {selectedNft.level} · {selectedNft.rarity} · x{selectedNft.amount} owned</div>
                  </div>
                </div>

                {/* Price */}
                <div>
                  <label className="block text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Asking Price (ETH)</label>
                  <input type="number" step="0.001" min="0.0001" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                    disabled={isAnyTxActive}
                    className="w-full px-3 py-2.5 text-xs text-white font-mono focus:outline-none transition-colors disabled:opacity-40"
                    style={{ background: '#0d0d0d', border: '1px solid #1f1f1f' }}
                    onFocus={e => { e.target.style.borderColor = '#a9ddd3'; }}
                    onBlur={e => { e.target.style.borderColor = '#1f1f1f'; }}
                  />
                </div>

                {/* Quantity */}
                {selectedNft.amount > 1 && (
                  <div>
                    <label className="block text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Quantity: <span style={{ color: '#a9ddd3' }}>{sellAmount}</span></label>
                    <input type="range" min="1" max={selectedNft.amount} value={sellAmount} onChange={e => setSellAmount(Number(e.target.value))} disabled={isAnyTxActive} className="w-full" style={{ accentColor: '#a9ddd3' }} />
                  </div>
                )}

                {/* Expiry */}
                <div>
                  <label className="block text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase mb-1.5">Expiry</label>
                  <select value={sellExpiryDays} onChange={e => setSellExpiryDays(Number(e.target.value))}
                    disabled={isAnyTxActive}
                    className="w-full px-3 py-2.5 text-xs text-white font-mono focus:outline-none disabled:opacity-40"
                    style={{ background: '#0d0d0d', border: '1px solid #1f1f1f' }}
                  >
                    <option value={1}>1 Day</option>
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </div>

                {/* Fee breakdown */}
                <div className="p-3 space-y-2 font-mono text-[9px]" style={{ background: '#0d0d0d', border: '1px solid #1f1f1f' }}>
                  <div className="flex justify-between text-text-muted">
                    <span>Royalties (0%):</span><span>0.0000 ETH</span>
                  </div>
                  <div className="flex justify-between text-text-muted">
                    <span>Protocol ({marketplaceFeeBps / 100}%):</span><span className="text-red-400">-{((Number(sellPrice) * marketplaceFeeBps) / 10000).toFixed(4)} ETH</span>
                  </div>
                  <div className="flex justify-between pt-2 font-bold text-xs text-white" style={{ borderTop: '1px solid #1f1f1f' }}>
                    <span>You receive:</span><span style={{ color: '#a9ddd3' }}>{(Number(sellPrice) - ((Number(sellPrice) * marketplaceFeeBps) / 10000)).toFixed(4)} ETH</span>
                  </div>
                </div>

                <button onClick={handleCreateListing} disabled={Number(sellPrice) <= 0 || isNetworkMismatch || isWalletAccountMismatch || isAnyTxActive}
                  className="w-full py-3.5 text-[10px] font-heading font-bold uppercase tracking-[0.2em] disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  style={{ background: '#a9ddd3', color: '#000' }}
                >
                  {listingTxStates.list === 'signing' ? <><Loader2 className="w-3 h-3 animate-spin" /> Signing...</> :
                   listingTxStates.list === 'pending' ? <><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</> :
                   "Sign & List Off-Chain"}
                </button>
              </div>
            ) : (
              <div className="py-16 text-center text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase" style={{ border: '1px dashed #1f1f1f' }}>
                Select an asset from vault
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TRADER DASHBOARD TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stat row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
            {[
              { icon: ShoppingBag, label: 'Active Offers',     value: dashboardStats.activeOffers, unit: '' },
              { icon: TrendingUp,  label: 'Total Earned',      value: dashboardStats.totalVolumeEarned, unit: 'ETH' },
              { icon: History,     label: 'Assets Purchased',  value: dashboardStats.totalAssetsPurchased, unit: '' },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-bg-card px-6 py-5 flex items-center gap-4">
                  <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(169,221,211,0.08)', border: '1px solid rgba(169,221,211,0.2)' }}>
                    <Icon className="w-4 h-4" style={{ color: '#a9ddd3' }} />
                  </div>
                  <div>
                    <div className="text-[9px] font-heading tracking-[0.2em] text-text-muted uppercase">{s.label}</div>
                    <div className="font-heading font-black text-2xl text-white mt-0.5">{s.value}<span className="text-xs ml-1 text-text-muted">{s.unit}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sub-tab nav (Horizontal scroll support) */}
          <div className="flex flex-row flex-nowrap items-center gap-0 overflow-x-auto scrollbar-none pb-1" style={{ borderBottom: '1px solid #1f1f1f', WebkitOverflowScrolling: 'touch' }}>
            {([
              { id: 'active',      label: `Active (${traderActiveListings.length})` },
              { id: 'sales',       label: `Sales (${traderSalesListings.length})` },
              { id: 'purchases',   label: `Purchases (${traderPurchasesListings.length})` },
              { id: 'rewards',     label: `Reward Vault (${preparedRewards.length})` },
              { id: 'progression', label: `Progression Status` },
              { id: 'reserved',    label: `Reserved NFTs (${reservedInventory.length})` },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setDashboardSubTab(t.id)}
                disabled={isAnyTxActive}
                className="px-5 py-3 text-[9px] font-heading font-bold tracking-[0.15em] uppercase transition-all whitespace-nowrap cursor-pointer disabled:opacity-40"
                style={{ color: dashboardSubTab === t.id ? '#a9ddd3' : '#444', borderBottom: dashboardSubTab === t.id ? '2px solid #a9ddd3' : '2px solid transparent', marginBottom: '-1px' }}
              >{t.label}</button>
            ))}
            {dashboardSubTab === 'active' && traderActiveListings.length > 0 && (
              <button onClick={handleCancelAllListings} disabled={isAnyTxActive || isNetworkMismatch}
                className="ml-auto px-4 py-2 text-[9px] font-heading font-bold uppercase tracking-wider transition-all flex-shrink-0 mr-0 disabled:opacity-40 cursor-pointer"
                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent' }}
              >
                {listingTxStates['bulk-cancel'] === 'signing' ? "Signing..." : 
                 listingTxStates['bulk-cancel'] === 'pending' ? "Voiding..." : 
                 "Cancel All"}
              </button>
            )}
          </div>

          {/* Sub-tab content */}
          <div className="min-h-[350px]">
            {isListingsLoading ? (
              <div className="flex justify-center items-center py-16">
                <div className="w-6 h-6 border-2 border-t-transparent animate-spin animate-shimmer" style={{ borderColor: '#a9ddd3', borderTopColor: 'transparent' }} />
              </div>
            ) : (
              <>
                {/* ACTIVE SUBTAB */}
                {dashboardSubTab === 'active' && (
                  traderActiveListings.length === 0 ? (
                    <div className="py-12 text-center" style={{ border: '1px dashed #1f1f1f' }}>
                      <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3">No active listings</p>
                      <button onClick={() => setActiveTab('sell')} disabled={isAnyTxActive} className="btn-primary text-[9px] px-5 py-2 cursor-pointer disabled:opacity-40">Create Listing</button>
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #1f1f1f' }} className="overflow-x-auto scrollbar-none">
                      <div className="min-w-[800px]">
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
                                className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors"
                                style={{ 
                                  borderBottom: i < traderActiveListings.length - 1 ? '1px solid #141414' : 'none', 
                                  background: 'transparent',
                                  pointerEvents: isAnyTxActive ? 'none' : 'auto'
                                }}
                              >
                                <div className="col-span-2 flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 flex items-center justify-center font-heading font-black text-sm flex-shrink-0" 
                                    style={{ 
                                      background: 'rgba(169,221,211,0.08)', 
                                      border: `1px solid ${RARITY_BORDER[listing.rarity]}`, 
                                      color: RARITY_COLOR[listing.rarity] 
                                    }}>
                                    {(() => {
                                      const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                      return <IconComponent className="w-4 h-4" />;
                                    })()}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-heading text-xs font-bold text-white truncate leading-tight">{listing.gameName}</span>
                                    <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level}</span>
                                  </div>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-[9px] font-heading font-bold uppercase" style={{ color: RARITY_COLOR[listing.rarity] }}>{listing.rarity}</span>
                                </div>
                                <div className="col-span-1">
                                  <span className="font-mono text-xs text-text-secondary">x{listing.amount}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="font-heading font-bold text-sm" style={{ color: '#a9ddd3' }}>{listing.price}</span>
                                  <span className="font-heading text-[9px] text-text-muted ml-1">ETH</span>
                                </div>
                                <div className="col-span-3">
                                  {isSyncingListing ? (
                                    <span className="text-[9px] font-heading font-bold tracking-widest animate-pulse" style={{ color: '#f59e0b' }}>[SYNCING...]</span>
                                  ) : (
                                    <span className="font-mono text-[9px] text-text-muted">Expires {new Date(listing.expiry * 1000).toLocaleDateString()}</span>
                                  )}
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  {!isSyncingListing && (
                                    <button 
                                      onClick={() => handleCancelListing(listing)} 
                                      disabled={isAnyTxActive || isNetworkMismatch || isPending}
                                      className="px-3 py-2 text-[9px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition-all cursor-pointer"
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
                    <div className="py-12 text-center" style={{ border: '1px dashed #1f1f1f' }}>
                      <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase">No completed sales yet</p>
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #1f1f1f' }} className="overflow-x-auto scrollbar-none">
                      <div className="min-w-[800px]">
                        <div className="grid grid-cols-12 px-4 py-2.5" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                          {['Asset', 'Price', 'Buyer', 'Explorer'].map((h, i) => (
                            <div key={h} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-4' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-4' : 'col-span-2'}`}>{h}</div>
                          ))}
                        </div>
                        {traderSalesListings.map((listing, i) => (
                          <div key={listing.id} className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors"
                            style={{ borderBottom: i < traderSalesListings.length - 1 ? '1px solid #141414' : 'none' }}
                          >
                            <div className="col-span-4 flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" 
                                style={{ 
                                  background: 'rgba(169,221,211,0.06)', 
                                  border: `1px solid ${RARITY_BORDER[listing.rarity]}`, 
                                  color: RARITY_COLOR[listing.rarity] 
                                }}>
                                {(() => {
                                  const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                  return <IconComponent className="w-3.5 h-3.5" />;
                                })()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-heading text-xs font-bold text-white truncate leading-none mb-0.5">{listing.gameName}</span>
                                <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level} · {listing.rarity}</span>
                              </div>
                            </div>
                            <div className="col-span-2 font-heading font-bold text-sm" style={{ color: '#a9ddd3' }}>{listing.price} <span className="text-[9px] text-text-muted">ETH</span></div>
                            <div className="col-span-4 font-mono text-[9px] text-text-secondary">{listing.buyer ? `${listing.buyer.slice(0, 10)}...${listing.buyer.slice(-6)}` : 'Unknown'}</div>
                            <div className="col-span-2">
                              {listing.saleTxHash ? (
                                <a href={`https://sepolia.basescan.org/tx/${listing.saleTxHash}`} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-[9px] font-heading uppercase tracking-wider transition-colors hover:text-white" style={{ color: '#a9ddd3' }}>
                                  View <ExternalLink className="w-3 h-3" />
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
                    <div className="py-12 text-center" style={{ border: '1px dashed #1f1f1f' }}>
                      <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3">No purchases yet</p>
                      <button onClick={() => setActiveTab('buy')} className="btn-primary text-[9px] px-5 py-2 cursor-pointer">Browse Market</button>
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #1f1f1f' }} className="overflow-x-auto scrollbar-none">
                      <div className="min-w-[800px]">
                        <div className="grid grid-cols-12 px-4 py-2.5" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                          {['Asset', 'Price', 'Seller', 'Explorer'].map((h, i) => (
                            <div key={h} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-4' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-4' : 'col-span-2'}`}>{h}</div>
                          ))}
                        </div>
                        {traderPurchasesListings.map((listing, i) => (
                          <div key={listing.id} className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors"
                            style={{ borderBottom: i < traderPurchasesListings.length - 1 ? '1px solid #141414' : 'none' }}
                          >
                            <div className="col-span-4 flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" 
                                style={{ 
                                  background: 'rgba(169,221,211,0.06)', 
                                  border: `1px solid ${RARITY_BORDER[listing.rarity]}`, 
                                  color: RARITY_COLOR[listing.rarity] 
                                }}>
                                {(() => {
                                  const IconComponent = GAME_ICON_MAP[listing.gameIcon] || Gamepad2;
                                  return <IconComponent className="w-3.5 h-3.5" />;
                                })()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-heading text-xs font-bold text-white truncate leading-none mb-0.5">{listing.gameName}</span>
                                <span className="text-[8px] font-mono text-text-muted uppercase tracking-wider">Level {listing.level} · {listing.rarity}</span>
                              </div>
                            </div>
                            <div className="col-span-2 font-heading font-bold text-sm" style={{ color: '#a9ddd3' }}>{listing.price} <span className="text-[9px] text-text-muted">ETH</span></div>
                            <div className="col-span-4 font-mono text-[9px] text-text-secondary">{listing.seller ? `${listing.seller.slice(0, 10)}...${listing.seller.slice(-6)}` : 'Unknown'}</div>
                            <div className="col-span-2">
                              {listing.saleTxHash ? (
                                <a href={`https://sepolia.basescan.org/tx/${listing.saleTxHash}`} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-[9px] font-heading uppercase tracking-wider hover:text-white transition-colors" style={{ color: '#a9ddd3' }}>
                                  View <ExternalLink className="w-3 h-3" />
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
                    <div className="py-12 text-center" style={{ border: '1px dashed #1f1f1f' }}>
                      <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3">No rewards available inside vault</p>
                      <Link href="/play" className="btn-primary text-[9px] px-5 py-2 cursor-pointer inline-block">Play & Unlock Levels</Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {preparedRewards.map(reward => {
                        const levelNum = reward.levelId.split('-').pop();
                        const isMinting = reward.claimStatus === 'MINTING' || listingTxStates[reward.id] === 'signing' || listingTxStates[reward.id] === 'pending';
                        return (
                          <div
                            key={reward.id}
                            className="p-5 relative transition-all duration-300 flex flex-col justify-between"
                            style={{
                              background: 'rgba(15,15,15,0.95)',
                              border: `1px solid ${RARITY_BORDER[reward.rarity] || 'rgba(31,31,31,0.5)'}`,
                              boxShadow: `0 0 15px ${RARITY_BORDER[reward.rarity] || 'rgba(31,31,31,0.3)'}`,
                            }}
                          >
                            <div className="absolute inset-0 pointer-events-none opacity-5 bg-radial-card" style={{
                              background: `radial-gradient(circle at 50% 20%, ${RARITY_COLOR[reward.rarity]}, transparent)`
                            }} />
                            
                            <div className="space-y-3 relative z-10">
                              <div className="flex justify-between items-start">
                                <span className="text-[8px] font-heading font-black tracking-widest uppercase bg-black/40 px-2 py-0.5 border border-zinc-800" style={{ color: RARITY_COLOR[reward.rarity] }}>
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
                            
                            <div className="mt-4 pt-4 border-t border-zinc-900/60 relative z-10">
                              <button
                                onClick={() => handleMintReward(reward)}
                                disabled={isAnyTxActive || isNetworkMismatch || isWalletAccountMismatch || isMinting}
                                className="w-full py-2.5 text-[9px] font-heading font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm hover:shadow-[#a9ddd3]/10"
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

                {/* PROGRESSION SUBTAB */}
                {dashboardSubTab === 'progression' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Contiguous Effective Level', value: dbUser?.effectiveProgressionLevel ?? 0, desc: 'Highest unbroken NFT level held' },
                        { label: 'Highest Playable Level', value: dbUser?.highestUnlockedLevel ?? 1, desc: 'Max level unlocked in gameplay' },
                        { label: 'Highest Score Record', value: dbUser?.highestScore ?? 0, desc: 'All-time retro leaderboard score' },
                        { label: 'Max Combo Multiplier', value: `${(dbUser?.highestCombo ?? 1.0).toFixed(1)}x`, desc: 'Highest combo chain achieved' }
                      ].map(stat => (
                        <div key={stat.label} className="bg-black/80 border border-zinc-800 p-5 space-y-2 relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-2 h-[1px] bg-[#a9ddd3]" />
                          <div className="absolute top-0 left-0 w-[1px] h-2 bg-[#a9ddd3]" />
                          <div className="text-[9px] font-heading tracking-[0.15em] text-zinc-500 uppercase">{stat.label}</div>
                          <div className="text-3xl font-heading font-black text-white">{stat.value}</div>
                          <div className="text-[8px] font-mono text-zinc-400">{stat.desc}</div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-black/90 border border-zinc-800/80 p-6 relative">
                      <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2">
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

                      <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-zinc-900 text-[8px] font-mono text-zinc-500">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full border-2 border-[#a9ddd3] bg-[#a9ddd3]/10" />
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
                        className="text-[8px] font-heading font-black tracking-[0.25em] uppercase px-4 py-2 border transition-all cursor-pointer"
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
                            <div className="p-5 font-mono text-[9px] bg-black border border-zinc-800 space-y-4 relative">
                              <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
                              
                              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                                <span className="text-[#a9ddd3] font-bold uppercase tracking-wider">// SYSTEM RUNTIME METRICS</span>
                                <button 
                                  onClick={fetchDiagnostics} 
                                  disabled={isFetchingDiagnostics}
                                  className="px-2 py-0.5 border border-zinc-800 text-[8px] text-zinc-400 hover:text-white transition-colors uppercase disabled:opacity-40 cursor-pointer"
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
                    <div className="py-12 text-center" style={{ border: '1px dashed #1f1f1f' }}>
                      <p className="font-heading text-[9px] tracking-[0.2em] text-text-muted uppercase mb-3">No assets currently reserved</p>
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #1f1f1f' }} className="overflow-x-auto scrollbar-none">
                      <div className="min-w-[800px]">
                        <div className="grid grid-cols-12 px-4 py-3" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
                          {['Reserved Asset', 'Rarity', 'Price', 'Locked Qty', 'Expiry', 'Timestamp', ''].map((h, i) => (
                            <div key={h} className={`font-heading text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted ${i === 0 ? 'col-span-2' : i === 2 ? 'col-span-2' : i === 5 ? 'col-span-2' : i === 6 ? 'col-span-2 text-right' : 'col-span-1'}`}>{h}</div>
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
                                className="grid grid-cols-12 items-center px-4 py-3.5 transition-colors"
                                style={{
                                  borderBottom: i < reservedInventory.length - 1 ? '1px solid #141414' : 'none',
                                  background: 'rgba(239,68,68,0.01)',
                                  pointerEvents: isAnyTxActive ? 'none' : 'auto'
                                }}
                              >
                                <div className="col-span-2 flex items-center gap-2">
                                  <div className="w-8 h-8 flex items-center justify-center font-heading font-black text-sm flex-shrink-0" style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`, color: '#ef4444' }}>
                                    🔒
                                  </div>
                                  <span className="font-heading text-xs font-bold text-white">Lvl {item.level}</span>
                                </div>
                                <div className="col-span-1">
                                  <span className="text-[9px] font-heading font-bold uppercase" style={{ color: RARITY_COLOR[item.rarity] }}>{item.rarity}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="font-heading font-bold text-sm text-white">{priceEth}</span>
                                  <span className="font-heading text-[9px] text-text-muted ml-1">ETH</span>
                                </div>
                                <div className="col-span-1">
                                  <span className="font-mono text-xs text-text-secondary">x{item.amount}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="font-mono text-[9px] text-text-muted">Expires {new Date(item.expiry * 1000).toLocaleDateString()}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="font-mono text-[9px] text-text-muted">{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString()}</span>
                                </div>
                                <div className="col-span-2 flex justify-end">
                                  <button
                                    onClick={() => handleCancelListing(listingToCancel)}
                                    disabled={isAnyTxActive || isNetworkMismatch || isPending}
                                    className="px-3 py-2 text-[9px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition-all cursor-pointer"
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
  );
}

export default function MarketplaceWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Marketplace />
    </ErrorBoundary>
  );
}
