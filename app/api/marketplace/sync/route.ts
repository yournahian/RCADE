import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { publicClient, CONTRACT_ADDRESS, RCADE_ERC1155_ABI } from '@/lib/web3';
import { recalculateUserProgression } from '@/services/progression';
import { reconcileMarketplaceListings } from '@/services/reconciliation';
import { getUsableInventory, getReservedInventory } from '@/services/inventory';
import { GAMES } from '@/lib/games';

export async function POST(req: Request) {
    try {
        // 1. Authenticate Privy Token
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const user = await prisma.user.findUnique({
            where: { id: verifiedClaims.userId }
        });

        if (!user || !user.wallet) {
            return NextResponse.json({ error: 'User wallet not connected' }, { status: 400 });
        }

        const wallet = user.wallet.toLowerCase();

        // 2. Scan and Gather all candidate Token IDs to check on-chain
        const tokensToScan = new Set<string>();

        // Gather existing ownership tokens
        const dbOwnerships = await prisma.nFTOwnership.findMany({
            where: { wallet: { equals: wallet, mode: 'insensitive' } }
        });
        dbOwnerships.forEach(o => tokensToScan.add(o.tokenId));

        // Gather tokens from user listings
        const activeListings = await prisma.marketplaceListing.findMany({
            where: {
                OR: [
                    { seller: { equals: wallet, mode: 'insensitive' } },
                    { buyer: { equals: wallet, mode: 'insensitive' } }
                ]
            }
        });
        activeListings.forEach(l => tokensToScan.add(l.tokenId.toString()));

        // Gather standard progression tokens (Levels 1 to 10, Rarities 0 to 3) for ALL games (using gameIdCode based on GAMES registry)
        const seasonCode = 1n;
        const categoryCode = 0n;
        const maxGameId = BigInt(Math.max(...GAMES.map(g => g.gameId), 1));
        for (let gameIdCode = 1n; gameIdCode <= maxGameId; gameIdCode++) {
            for (let lvl = 1n; lvl <= 10n; lvl++) {
                for (let rar = 0n; rar <= 3n; rar++) {
                    const tid = (
                        (gameIdCode << 224n) |
                        (seasonCode << 208n) |
                        (categoryCode << 192n) |
                        (lvl << 176n) |
                        (rar << 168n)
                    ).toString();
                    tokensToScan.add(tid);
                }
            }
        }

        // 3. Chunked sequential balanceOf queries to avoid Alchemy 429 rate-limit
        // Process 10 tokens per batch with a 200ms pause between batches
        const tokenList = Array.from(tokensToScan);
        console.log(`[Sync] Scanning ${tokenList.length} candidate token balances for ${wallet} (10 per batch)...`);

        const CHUNK_SIZE = 10;
        const CHUNK_DELAY_MS = 200;
        const balances: { tokenId: string; balance: number | null }[] = [];

        for (let i = 0; i < tokenList.length; i += CHUNK_SIZE) {
            const chunk = tokenList.slice(i, i + CHUNK_SIZE);

            const chunkResults = await Promise.all(
                chunk.map(async (tokenId) => {
                    try {
                        const balance = await publicClient.readContract({
                            address: CONTRACT_ADDRESS as `0x${string}`,
                            abi: RCADE_ERC1155_ABI,
                            functionName: 'balanceOf',
                            args: [user.wallet as `0x${string}`, BigInt(tokenId)]
                        });
                        return { tokenId, balance: Number(balance) };
                    } catch (err: any) {
                        if (err?.status === 429 || err?.message?.includes('429')) {
                            console.warn(`[Sync] Rate-limited on token ${tokenId}. Skipping.`);
                        } else {
                            console.error(`[Sync] Failed to read balance for token ${tokenId}:`, err.message);
                        }
                        return { tokenId, balance: null };
                    }
                })
            );

            balances.push(...chunkResults);

            // Throttle: wait between batches (skip delay after the last batch)
            if (i + CHUNK_SIZE < tokenList.length) {
                await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
            }
        }

        // 4. Update Database NFTOwnership states
        await prisma.$transaction(
            balances.map((item) => {
                if (item.balance === null) return prisma.$executeRaw`SELECT 1;`; // Skip on error

                return prisma.nFTOwnership.upsert({
                    where: {
                        wallet_tokenId: {
                            wallet: wallet,
                            tokenId: item.tokenId
                        }
                    },
                    update: {
                        amount: item.balance,
                        isActive: item.balance > 0
                    },
                    create: {
                        wallet: wallet,
                        tokenId: item.tokenId,
                        amount: item.balance,
                        isActive: item.balance > 0
                    }
                });
            })
        );

        // 5. Recalculate Effective Progression Level
        const newLevel = await recalculateUserProgression(user.wallet);

        // 6. Prune and reconcile active listings
        await reconcileMarketplaceListings(true).catch((err) => {
            console.error("[Sync] Active listing pruning failed:", err);
        });

        // 7. Fetch the updated state to return to client
        const updatedUser = await prisma.user.findUnique({
            where: { id: user.id }
        });

        // Get aggregated inventory using centralized inventory resolver
        const inventory = await getUsableInventory(wallet);
        const reserved = await getReservedInventory(wallet);

        inventory.sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            const rarityOrder: Record<string, number> = { 'Common': 0, 'Rare': 1, 'Epic': 2, 'Legendary': 3 };
            return rarityOrder[b.rarity] - rarityOrder[a.rarity];
        });

        reserved.sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            const rarityOrder: Record<string, number> = { 'Common': 0, 'Rare': 1, 'Epic': 2, 'Legendary': 3 };
            return rarityOrder[b.rarity] - rarityOrder[a.rarity];
        });

        return NextResponse.json({
            success: true,
            user: updatedUser,
            effectiveProgressionLevel: newLevel,
            inventory,
            reserved
        });

    } catch (error: any) {
        console.error("Failed to synchronize marketplace states:", error);
        return NextResponse.json({ error: error.message || 'Failed to sync states' }, { status: 500 });
    }
}
