import { prisma } from '@/lib/prisma';
import { InventoryState } from '@/lib/inventory-state';

export interface UsableInventoryItem {
  id: string;
  tokenId: string;
  gameId: number;
  gameName: string;
  gameSlug: string;
  gameIcon: string;
  level: number;
  rarity: string;
  amount: number;
  txHash: string | null;
  isMinted?: boolean;
}

export interface ReservedInventoryItem {
  id: string;
  tokenId: string;
  gameId: number;
  gameName: string;
  gameSlug: string;
  gameIcon: string;
  level: number;
  rarity: string;
  amount: number;
  listingHash: string;
  price: string;
  expiry: number;
  nonce: string;
  createdAt: Date;
}

export interface InventoryStateItem {
  tokenId: string;
  gameId: number;
  gameName: string;
  gameSlug: string;
  gameIcon: string;
  level: number;
  rarity: string;
  amount: number;
  state: InventoryState;
  listingHash?: string | null;
  price?: string | null;
  txHash?: string | null;
  timestamp?: Date;
}

/**
 * Standard utility to parse level and rarity from a packed EIP-1155 tokenId.
 * Bits 224-239: Game ID (16 bits)
 * Bits 176-191: Level (16 bits)
 * Bits 168-175: Rarity Code (8 bits)
 */
export function parseTokenId(tokenId: string) {
  const tokenIdBig = BigInt(tokenId);
  const gameId = Number((tokenIdBig >> 224n) & 0xFFFFn);
  const level = Number((tokenIdBig >> 176n) & 0xFFFFn);
  const rarityCode = (tokenIdBig >> 168n) & 0xFFn;

  const getRarity = (code: bigint) => {
    if (code === 0n) return 'Common';
    if (code === 1n) return 'Rare';
    if (code === 2n) return 'Epic';
    if (code === 3n) return 'Legendary';
    return 'Common';
  };

  // Mapped identities based on canonical registry
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
    gameId: gameId || 1, // Default to 1 (Neon Snake) if gameId is 0 (or unpopulated)
    gameName,
    gameSlug,
    gameIcon,
    level,
    rarity: getRarity(rarityCode)
  };
}

/**
 * Retrieves usable inventory where amount = ownedAmount - listedAmount.
 * Fully listed/reserved assets are excluded.
 */
export async function getUsableInventory(wallet: string): Promise<UsableInventoryItem[]> {
  if (!wallet) return [];

  const lowerWallet = wallet.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { wallet: lowerWallet },
        { wallet: wallet }
      ]
    }
  });

  const ownerships = await prisma.nFTOwnership.findMany({
    where: {
      OR: [
        { wallet: lowerWallet },
        { wallet: wallet }
      ],
      isActive: true,
      amount: { gt: 0 }
    },
    orderBy: { acquiredAt: 'desc' }
  });

  const mintedRewards = user ? await prisma.reward.findMany({
    where: {
      userId: user.id,
      claimStatus: 'MINTED',
      tokenId: { not: null }
    }
  }) : [];

  const activeListings = await prisma.marketplaceListing.findMany({
    where: {
      OR: [
        { seller: lowerWallet },
        { seller: wallet }
      ],
      status: 'ACTIVE'
    }
  });

  const normalizeTokenId = (tid: string | bigint) => {
    try {
      return BigInt(tid).toString();
    } catch {
      return String(tid);
    }
  };

  // Track listed amounts per normalized tokenId so active listings deduct correctly
  const listedCountMap = new Map<string, number>();
  for (const listing of activeListings) {
    const key = normalizeTokenId(listing.tokenId);
    listedCountMap.set(key, (listedCountMap.get(key) ?? 0) + listing.amount);
  }

  const result: UsableInventoryItem[] = [];
  const processedTokenIds = new Set<string>();

  for (const o of ownerships) {
    const normId = normalizeTokenId(o.tokenId);
    processedTokenIds.add(normId);
    const currentlyListed = listedCountMap.get(normId) ?? 0;
    
    // Deduct active listings from available copies
    if (currentlyListed >= o.amount) {
      listedCountMap.set(normId, currentlyListed - o.amount);
      continue; // This ownership row is fully listed
    }

    const availableAmount = o.amount - currentlyListed;
    listedCountMap.set(normId, 0);

    const { gameId, gameName, gameSlug, gameIcon, level, rarity } = parseTokenId(o.tokenId);

    result.push({
      id: o.id,
      tokenId: o.tokenId,
      gameId,
      gameName,
      gameSlug,
      gameIcon,
      level,
      rarity,
      amount: availableAmount,
      txHash: null,
      isMinted: true
    });
  }

  // Include any MINTED reward tokens that were not yet in nFTOwnership table
  for (const r of mintedRewards) {
    if (!r.tokenId) continue;
    const normId = normalizeTokenId(r.tokenId);
    if (processedTokenIds.has(normId)) continue;

    const currentlyListed = listedCountMap.get(normId) ?? 0;
    if (currentlyListed >= 1) {
      listedCountMap.set(normId, currentlyListed - 1);
      continue;
    }

    const { gameId, gameName, gameSlug, gameIcon, level, rarity } = parseTokenId(r.tokenId);
    result.push({
      id: r.id,
      tokenId: r.tokenId,
      gameId,
      gameName,
      gameSlug,
      gameIcon,
      level,
      rarity,
      amount: 1,
      txHash: r.txHash,
      isMinted: Boolean(r.txHash)
    });
    processedTokenIds.add(normId);
  }

  return result;
}

/**
 * Retrieves reserved inventory representing assets listed on the marketplace.
 */
export async function getReservedInventory(wallet: string): Promise<ReservedInventoryItem[]> {
  if (!wallet) return [];

  const activeListings = await prisma.marketplaceListing.findMany({
    where: {
      seller: { equals: wallet, mode: 'insensitive' },
      status: 'ACTIVE'
    },
    orderBy: { createdAt: 'desc' }
  });

  return activeListings.map(l => {
    const { gameId, gameName, gameSlug, gameIcon, level, rarity } = parseTokenId(l.tokenId);

    return {
      id: l.id,
      tokenId: l.tokenId,
      gameId,
      gameName,
      gameSlug,
      gameIcon,
      level,
      rarity,
      amount: l.amount,
      listingHash: l.listingHash,
      price: l.price,
      expiry: l.expiry,
      nonce: l.nonce,
      createdAt: l.createdAt
    };
  });
}

/**
 * Retrieves comprehensive states for all owned assets.
 * Splits owned quantities into AVAILABLE and LISTED components.
 */
export async function getInventoryState(wallet: string): Promise<InventoryStateItem[]> {
  if (!wallet) return [];

  const ownerships = await prisma.nFTOwnership.findMany({
    where: {
      wallet: { equals: wallet, mode: 'insensitive' },
      isActive: true,
      amount: { gt: 0 }
    }
  });

  const activeListings = await prisma.marketplaceListing.findMany({
    where: {
      seller: { equals: wallet, mode: 'insensitive' },
      status: 'ACTIVE'
    }
  });

  const listedAmountMap = new Map<string, number>();
  for (const listing of activeListings) {
    const key = listing.tokenId.toString();
    listedAmountMap.set(key, (listedAmountMap.get(key) ?? 0) + listing.amount);
  }

  const states: InventoryStateItem[] = [];

  for (const o of ownerships) {
    const { gameId, gameName, gameSlug, gameIcon, level, rarity } = parseTokenId(o.tokenId);
    const totalListed = listedAmountMap.get(o.tokenId) ?? 0;
    const usableAmount = o.amount - totalListed;

    if (usableAmount > 0) {
      states.push({
        tokenId: o.tokenId,
        gameId,
        gameName,
        gameSlug,
        gameIcon,
        level,
        rarity,
        amount: usableAmount,
        state: InventoryState.AVAILABLE,
        timestamp: o.acquiredAt
      });
    }

    if (totalListed > 0) {
      const listingsForToken = activeListings.filter(l => l.tokenId === o.tokenId);
      for (const l of listingsForToken) {
        states.push({
          tokenId: o.tokenId,
          gameId,
          gameName,
          gameSlug,
          gameIcon,
          level,
          rarity,
          amount: l.amount,
          state: InventoryState.LISTED,
          listingHash: l.listingHash,
          price: l.price,
          timestamp: l.createdAt
        });
      }
    }
  }

  return states;
}
