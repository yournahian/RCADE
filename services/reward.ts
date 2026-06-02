import { prisma } from '@/lib/prisma';
import { getUsableInventory } from '@/services/inventory';

export class RewardService {

    static getRarity(rank: number): string {
        if (rank <= 3) return 'Legendary';
        if (rank <= 18) return 'Epic';    // 3 + 15
        if (rank <= 68) return 'Rare';    // 18 + 50
        return 'Common';
    }

    /**
     * Extract the numeric level from a levelId string.
     * e.g. "neon-snake-3" → 3
     */
    static extractLevelFromLevelId(levelId: string): number {
        const parts = levelId.split('-');
        return parseInt(parts[parts.length - 1], 10) || 1;
    }

    /**
     * Extract the game slug from a levelId string.
     * e.g. "neon-snake-3" → "neon-snake"
     */
    static extractGameSlugFromLevelId(levelId: string): string {
        const parts = levelId.split('-');
        return parts.slice(0, -1).join('-');
    }

    static async walletOwnsLevelNFT(wallet: string, gameSlug: string, level: number): Promise<boolean> {
        const usableInventory = await getUsableInventory(wallet);
        return usableInventory.some(item => item.level === level && item.gameSlug === gameSlug);
    }

    /**
     * MODEL B — Replay Recovery with Strict Web3 Progression Gating.
     *
     * Decision tree (in order):
     *   1. Player actively owns the Level NFT on-chain → skip (already has it)
     *   2. Player has an existing PREPARED reward for this level → skip (dedup)
     *   3. Neither → create a new PREPARED reward
     *
     * PREPARED rewards appear in Reward Vault and allow minting.
     * PREPARED does NOT unlock progression — only confirmed on-chain mints do.
     */
    static async checkAndGenerateReward(
        userId: string,
        levelId: string,
        sessionId: string,
        season: string = "season-1",
        wallet: string | null = null
    ) {
        const gameSlug = this.extractGameSlugFromLevelId(levelId);
        const level = this.extractLevelFromLevelId(levelId);
        console.log(`[GameplayLoop][Reward] checkAndGenerateReward — userId: ${userId}, levelId: ${levelId}, wallet: ${wallet ?? 'none'}`);

        // STEP 1 — Check active on-chain NFT ownership for this level.
        console.log(`[GameplayLoop][Reward] STEP 1 (On-Chain Balance Check) for Game ${gameSlug} Level ${level}...`);
        if (wallet) {
            const alreadyOwned = await this.walletOwnsLevelNFT(wallet, gameSlug, level);
            if (alreadyOwned) {
                console.log(`[GameplayLoop][Reward] STEP 1 BLOCKED — Wallet ${wallet} actively owns Game ${gameSlug} Level ${level} NFT on-chain. No reward generated.`);
                return null;
            }
            console.log(`[GameplayLoop][Reward] STEP 1 PASSED — No active on-chain ownership of Game ${gameSlug} Level ${level} found.`);
        } else {
            console.log(`[GameplayLoop][Reward] STEP 1 SKIPPED — No wallet provided; cannot check NFTOwnership.`);
        }

        // STEP 2 — Check for an existing PREPARED reward (prevent duplicate spam).
        console.log(`[GameplayLoop][Reward] STEP 2 (Existing Prepared Check) for Level ${level}...`);
        const existingPrepared = await prisma.reward.findFirst({
            where: {
                userId,
                levelId,
                season,
                claimStatus: 'PREPARED'
            }
        });

        if (existingPrepared) {
            console.log(`[GameplayLoop][Reward] STEP 2 BLOCKED — Existing PREPARED reward (id: ${existingPrepared.id}) for Level ${level}. No duplicate created.`);
            return null;
        }
        console.log(`[GameplayLoop][Reward] STEP 2 PASSED — No existing PREPARED reward for Level ${level}.`);

        // STEP 3 — Generate a new PREPARED reward.
        console.log(`[GameplayLoop][Reward] STEP 3 (Prepared Generation Success) - Creating new PREPARED reward for Level ${level}...`);
        const reward = await prisma.$transaction(async (tx) => {
            // Count all existing rewards for this level to determine rank
            const count = await tx.reward.count({ where: { levelId, season } });
            const rank = count + 1;
            const rarity = this.getRarity(rank);

            return await tx.reward.create({
                data: {
                    userId,
                    levelId,
                    season,
                    rarity,
                    completionRank: rank,
                    originalOwner: userId,
                    claimStatus: 'PREPARED',
                    sessionId
                }
            });
        });

        console.log(`[GameplayLoop][Reward] STEP 3 SUCCESS — Generated PREPARED reward (id: ${reward.id}) for Level ${level}, rank #${reward.completionRank}, rarity: ${reward.rarity}`);
        return reward;
    }
}
