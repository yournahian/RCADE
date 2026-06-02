import { getUsableInventory } from '@/services/inventory';

/**
 * Calculates the player's active contiguous progression level specifically for a gameId.
 * For example, if they own Levels 1, 2, 3, and 5 for a game, the active contiguous chain is 3.
 */
export async function getGameProgression(wallet: string, gameId: number): Promise<number> {
    if (!wallet) return 0;
    
    try {
        const usableInventory = await getUsableInventory(wallet);
        
        // Gather levels owned for this specific game
        const ownedLevels = new Set<number>();
        for (const item of usableInventory) {
            // Unpacked items will expose gameId
            if (item.gameId === gameId) {
                ownedLevels.add(item.level);
            }
        }

        let effectiveProgression = 0;
        while (ownedLevels.has(effectiveProgression + 1)) {
            effectiveProgression++;
        }

        return effectiveProgression;
    } catch (err) {
        console.error(`[ProgressionIsolation] Failed to calculate isolated progression for ${wallet} (Game ${gameId}):`, err);
        return 0;
    }
}

/**
 * Resolves the next allowed level the user can play for a specific gameId.
 * Standard sequential progression allows playing up to (effectiveContiguousLevel + 1).
 */
export async function getHighestUnlockedLevel(wallet: string, gameId: number): Promise<number> {
    if (!wallet) return 1;
    const progression = await getGameProgression(wallet, gameId);
    return progression + 1;
}
