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

        // Check if explicit forced on-chain resync requested
        const { searchParams } = new URL(req.url);
        const isForce = searchParams.get('force') === 'true';

        if (isForce) {
            // 2. Scan and Gather all candidate Token IDs to check on-chain
            const tokensToScan = new Set<string>();

            const dbOwnerships = await prisma.nFTOwnership.findMany({
                where: { OR: [{ wallet: wallet }, { wallet: user.wallet }] }
            });
            dbOwnerships.forEach(o => tokensToScan.add(o.tokenId));

            const activeListings = await prisma.marketplaceListing.findMany({
                where: {
                    OR: [
                        { seller: { equals: wallet, mode: 'insensitive' } },
                        { buyer: { equals: wallet, mode: 'insensitive' } }
                    ]
                }
            });
            activeListings.forEach(l => tokensToScan.add(l.tokenId.toString()));

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

            const tokenList = Array.from(tokensToScan);
            console.log(`[Sync] Forced multicall scanning ${tokenList.length} candidate token balances for ${wallet}...`);

            const calls = tokenList.map(tokenId => ({
                address: CONTRACT_ADDRESS as `0x${string}`,
                abi: RCADE_ERC1155_ABI,
                functionName: 'balanceOf' as const,
                args: [user.wallet as `0x${string}`, BigInt(tokenId)] as const,
            }));

            const results = await publicClient.multicall({
                contracts: calls,
                allowFailure: true
            }).catch(() => []);

            if (results.length > 0) {
                const balances = tokenList.map((tokenId, idx) => {
                    const res = results[idx];
                    return { tokenId, balance: (res && res.status === 'success' && res.result !== undefined) ? Number(res.result) : null };
                });

                await prisma.$transaction(
                    balances.map((item) => {
                        if (item.balance === null) return prisma.$executeRaw`SELECT 1;`;
                        return prisma.nFTOwnership.upsert({
                            where: { wallet_tokenId: { wallet: wallet, tokenId: item.tokenId } },
                            update: { amount: item.balance, isActive: item.balance > 0 },
                            create: { wallet: wallet, tokenId: item.tokenId, amount: item.balance, isActive: item.balance > 0 }
                        });
                    })
                ).catch(console.error);
            }

            await recalculateUserProgression(user.wallet).catch(console.error);
            await reconcileMarketplaceListings(true).catch(console.error);
        }

        // Fetch user state directly from DB (instant <30ms response)
        const updatedUser = await prisma.user.findUnique({
            where: { id: user.id }
        });

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
            effectiveProgressionLevel: updatedUser?.effectiveProgressionLevel ?? 0,
            inventory,
            reserved
        });

    } catch (error: any) {
        console.error("Failed to synchronize marketplace states:", error);
        return NextResponse.json({ error: error.message || 'Failed to sync states' }, { status: 500 });
    }
}
