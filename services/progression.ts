import { prisma } from '@/lib/prisma';
import { getUsableInventory } from '@/services/inventory';
import { recordProgressionDuration } from '@/lib/diagnostics';

export async function recalculateUserProgression(wallet: string) {
    if (!wallet) return;

    const label = `[GameplayLoop][Progression] ${wallet}`;
    console.time(label);
    const startTime = Date.now();

    try {
        console.log(`[GameplayLoop][Progression] Recalculating progression for wallet ${wallet}...`);

        // 1. Fetch user by wallet
        const user = await prisma.user.findFirst({
            where: {
                wallet: {
                    equals: wallet,
                    mode: 'insensitive'
                }
            }
        });

        if (!user) {
            console.warn(`[GameplayLoop][Progression] No user found for wallet ${wallet}`);
            console.timeEnd(label);
            return;
        }

        // 2. Fetch usable inventory from the centralized resolver
        const usableInventory = await getUsableInventory(wallet);

        // 3. Extract progression levels using usable inventory only
        const ownedLevels = new Set<number>();
        for (const item of usableInventory) {
            ownedLevels.add(item.level);
        }

        // 4. Calculate contiguous chain
        let effectiveProgression = 0;

        while (ownedLevels.has(effectiveProgression + 1)) {
            effectiveProgression++;
        }

        console.log(`[GameplayLoop][Progression] Owned Levels for ${wallet}:`, [...ownedLevels]);
        console.log(`[GameplayLoop][Progression] Usable NFTs found: ${usableInventory.length} | Effective progression computed as level: ${effectiveProgression}`);

        // 5. Update user progression
        await prisma.user.update({
            where: { id: user.id },
            data: {
                effectiveProgressionLevel: effectiveProgression,
                // Do NOT overwrite highestUnlockedLevel as it's historical
            }
        });

        const duration = Date.now() - startTime;
        recordProgressionDuration(duration);

        console.log(`[GameplayLoop][Progression] Completed for ${user.username || wallet} in ${duration}ms: Effective Level ${effectiveProgression}`);
        console.timeEnd(label);
        
        return effectiveProgression;
    } catch (error) {
        console.error(`[GameplayLoop][Progression] Error recalculating for ${wallet}:`, error);
        console.timeEnd(label);
        throw error;
    }
}

