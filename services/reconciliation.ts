import { prisma } from '@/lib/prisma';
import { publicClient, CONTRACT_ADDRESS, RCADE_ERC1155_ABI, MARKETPLACE_ADDRESS, RCADE_MARKETPLACE_ABI } from '@/lib/web3';
import { recalculateUserProgression } from '@/services/progression';

const globalForRecon = global as unknown as {
    reconInterval?: NodeJS.Timeout;
    reconRunning?: boolean;
    marketplaceReconRunning?: boolean;
};

export async function reconcileOwnerships(autoRepair = false) {
    if (globalForRecon.reconRunning) {
        console.log("[Reconciliation] Skipped cycle: previous ownership reconciliation is still running.");
        return { status: 'skipped' };
    }

    globalForRecon.reconRunning = true;

    try {
        const allOwnerships = await prisma.nFTOwnership.findMany();
        const mismatches = [];
        const matches = [];
        let repairedCount = 0;

        // ── Multicall batching ────────────────────────────────────────────────
        // Instead of 1 RPC call per NFT (N calls), we batch in chunks of 500.
        // Each chunk is a single eth_call to the Multicall3 contract.
        const CHUNK_SIZE = 500;
        for (let i = 0; i < allOwnerships.length; i += CHUNK_SIZE) {
            const chunk = allOwnerships.slice(i, i + CHUNK_SIZE);

            // Build multicall contracts array
            const calls = chunk.map(o => ({
                address: CONTRACT_ADDRESS as `0x${string}`,
                abi: RCADE_ERC1155_ABI,
                functionName: 'balanceOf' as const,
                args: [o.wallet as `0x${string}`, BigInt(o.tokenId)] as const,
            }));

            let results: { status: 'success' | 'failure'; result?: bigint; error?: Error }[] = [];
            try {
                results = await publicClient.multicall({
                    contracts: calls,
                    allowFailure: true,
                });
            } catch (batchErr: any) {
                console.error(`[Reconciliation] Multicall batch ${Math.floor(i / CHUNK_SIZE) + 1} failed:`, batchErr.message);
                // Mark all in this chunk as errors and continue
                for (const o of chunk) {
                    mismatches.push({ id: o.id, wallet: o.wallet, tokenId: o.tokenId, dbAmount: o.amount, chainAmount: 'BATCH_ERROR', error: batchErr.message });
                }
                continue;
            }

            // Process batch results
            for (let j = 0; j < chunk.length; j++) {
                const o = chunk[j];
                const result = results[j];

                if (result.status === 'failure' || result.result === undefined) {
                    mismatches.push({ id: o.id, wallet: o.wallet, tokenId: o.tokenId, dbAmount: o.amount, chainAmount: 'ERROR', error: result.error?.message });
                    continue;
                }

                const dbAmount = o.amount;
                const chainAmount = Number(result.result);

                if (dbAmount !== chainAmount) {
                    mismatches.push({ id: o.id, wallet: o.wallet, tokenId: o.tokenId, dbAmount, chainAmount, mismatch: Math.abs(dbAmount - chainAmount) });

                    if (autoRepair) {
                        await prisma.nFTOwnership.update({
                            where: { id: o.id },
                            data: { amount: chainAmount, isActive: chainAmount > 0 }
                        });
                        repairedCount++;
                        console.log(`[Reconciliation][Repair] Repaired wallet ${o.wallet} token ${o.tokenId}: DB(${dbAmount}) -> Chain(${chainAmount})`);
                        recalculateUserProgression(o.wallet).catch(e =>
                            console.error(`[Reconciliation] Progression recalc failed for ${o.wallet}:`, e)
                        );
                    }
                } else {
                    matches.push({ wallet: o.wallet, tokenId: o.tokenId, dbAmount, chainAmount });
                }
            }

            // Brief pause between chunks to avoid rate-limit bursts on free-tier RPCs
            if (i + CHUNK_SIZE < allOwnerships.length) {
                await new Promise(res => setTimeout(res, 200));
            }
        }

        console.log(`[Reconciliation] Done. Analyzed: ${allOwnerships.length}, Matches: ${matches.length}, Mismatches: ${mismatches.length}, Repaired: ${repairedCount}`);
        return {
            status: 'completed',
            totalAnalyzed: allOwnerships.length,
            totalMatches: matches.length,
            totalMismatches: mismatches.length,
            repairedCount,
            mismatches,
            matches
        };
    } finally {
        globalForRecon.reconRunning = false;
    }
}


export async function reconcileMarketplaceListings(autoRepair = false) {
    if (globalForRecon.marketplaceReconRunning) {
        console.log("[Reconciliation] Skipped cycle: previous marketplace reconciliation is still running.");
        return { status: 'skipped' };
    }

    if (!MARKETPLACE_ADDRESS || MARKETPLACE_ADDRESS === "0x0000000000000000000000000000000000000000") {
        console.log("[Reconciliation] Marketplace address is not set. Skipping.");
        return { status: 'skipped_no_address' };
    }

    globalForRecon.marketplaceReconRunning = true;

    try {
        const activeListings = await prisma.marketplaceListing.findMany({
            where: { status: 'ACTIVE' }
        });

        const mismatches = [];
        let repairedCount = 0;

        for (const listing of activeListings) {
            try {
                const listingTuple = {
                    seller: listing.seller as `0x${string}`,
                    tokenId: BigInt(listing.tokenId),
                    amount: BigInt(listing.amount),
                    price: BigInt(listing.price),
                    expiry: BigInt(listing.expiry),
                    nonce: BigInt(listing.nonce)
                };

                const status = await publicClient.readContract({
                    address: MARKETPLACE_ADDRESS as `0x${string}`,
                    abi: RCADE_MARKETPLACE_ABI,
                    functionName: 'validateListing',
                    args: [listingTuple, listing.signature as `0x${string}`]
                });

                // 0 = Valid, 1 = Expired, others = Invalid
                let dbStatus: 'ACTIVE' | 'EXPIRED' | 'INVALID' = 'ACTIVE';
                if (status === 0) {
                    dbStatus = 'ACTIVE';
                } else if (status === 1) {
                    dbStatus = 'EXPIRED';
                } else {
                    dbStatus = 'INVALID';
                }

                if (dbStatus !== 'ACTIVE') {
                    mismatches.push({
                        id: listing.id,
                        listingHash: listing.listingHash,
                        currentStatus: 'ACTIVE',
                        reconciledStatus: dbStatus,
                        contractStatusCode: status
                    });

                    if (autoRepair) {
                        await prisma.marketplaceListing.update({
                            where: { id: listing.id },
                            data: { status: dbStatus }
                        });
                        repairedCount++;
                        console.log(`[Reconciliation][Marketplace][Repair] Pruned listing ${listing.listingHash} to ${dbStatus} (Contract status code: ${status})`);
                        // Restore seller's usable inventory now that a reserved asset has been freed
                        recalculateUserProgression(listing.seller).catch(e =>
                            console.error(`[Reconciliation][Marketplace] Progression recalc failed for ${listing.seller}:`, e)
                        );
                    }
                }
            } catch (e: any) {
                console.error(`[Reconciliation][Marketplace] Failed to validate listing ${listing.listingHash}:`, e.message);
            }
        }

        return {
            status: 'completed',
            totalActiveAnalyzed: activeListings.length,
            totalMismatches: mismatches.length,
            repairedCount,
            mismatches
        };
    } finally {
        globalForRecon.marketplaceReconRunning = false;
    }
}

export function startPeriodicReconciliation() {
    if (globalForRecon.reconInterval) {
        console.log("[Reconciliation] Periodic loop already active.");
        return;
    }

    console.log("[Reconciliation] Starting periodic 120s heartbeat for ownership and marketplace listings.");
    
    globalForRecon.reconInterval = setInterval(() => {
        reconcileOwnerships(true).catch(e => console.error("[Reconciliation][Error]", e));
        reconcileMarketplaceListings(true).catch(e => console.error("[Reconciliation][Marketplace][Error]", e));
    }, 120000);
}

