import { publicClient, CONTRACT_ADDRESS, RCADE_ERC1155_ABI, MARKETPLACE_ADDRESS, RCADE_MARKETPLACE_ABI } from '../lib/web3';
import { prisma } from '../lib/prisma';
import { decodeEventLog, parseAbiItem, Log } from 'viem';
import { recalculateUserProgression } from './progression';
import {
    recordRPCFailure,
    recordIndexerReconnect,
    recordWebsocketFailure,
    setPollingFallbackActive,
    recordSyncDuration
} from '../lib/diagnostics';

const CONFIRMATION_DEPTH = Number(process.env.CONFIRMATION_DEPTH ?? 10);
const MAX_QUEUE_SIZE = 1000;

// Free tier limits — do NOT increase these without upgrading the Alchemy plan
const CHUNK_SIZE_BLOCKS = 9n;          // Free tier max is 10 blocks per getLogs
const INTER_CHUNK_DELAY_MS = 1000;     // 1 second between chunks
const MAX_BACKFILL_BLOCKS = 50n;       // Never look back more than 50 blocks on startup
const POLLING_INTERVAL_MS = 60000;     // Poll every 60 seconds (not 15s)

// Pre-computed topic hashes for all monitored events
// Using raw topic hashes lets us combine ALL contracts into a single getLogs call per chunk
const EVENT_TOPICS = {
    TRANSFER_SINGLE: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
    SALE_EXECUTED: "0x83e9c509887f696d4f04bbf1d3621b0eb01002ce5865e05ffd189962cb5589db",
    LISTING_CANCELLED: "0x19f8a9c41bc9d7c7e0afd6a01e8f00f3de8bda7eed3dbfe5d8e64eb46af4c40f",
    ALL_LISTINGS_CANCELLED: "0xb7e1a3a04f12c5c437b18d4e9acd40e23e34e0efcf0f07b4c6451efba1e2e2f9"
} as const;

const globalForIndexer = global as unknown as {
    indexerActive?: boolean;
    eventQueue?: any[];
    queueTimer?: NodeJS.Timeout;
    unwatchNFT?: () => void;
    unwatchMarketplace?: () => void;
    reconnectTimer?: NodeJS.Timeout;
    consecutiveWatcherFailures?: number;
    isPollingFallback?: boolean;
    pollingTimer?: NodeJS.Timeout;
};

export async function startIndexer() {
    if (globalForIndexer.indexerActive) {
        console.log("[Indexer] Already running, skipping startup");
        return;
    }

    globalForIndexer.indexerActive = true;
    globalForIndexer.eventQueue = [];
    console.log(`[Indexer] Booting Sequence Initiated (Depth: ${CONFIRMATION_DEPTH})...`);

    try {
        // --- 1. Startup Backfill (capped to MAX_BACKFILL_BLOCKS) ---
        await runBackfill();

        // --- 2. Live Watchers Setup ---
        startWatchers();

        // --- 3. Queue Processor Loop ---
        if (!globalForIndexer.queueTimer) {
            globalForIndexer.queueTimer = setInterval(async () => {
                await processQueue();
            }, 10000); // Check every 10s
        }

    } catch (e) {
        console.error("[Indexer] Failed to start:", e);
        globalForIndexer.indexerActive = false;
    }
}

function startWatchers() {
    if (globalForIndexer.isPollingFallback) {
        console.log("[Indexer][StartWatchers] In polling fallback mode, skipping websocket watch binding");
        return;
    }

    // Clean up any existing watchers first to prevent duplicate connections/listeners
    if (globalForIndexer.unwatchNFT) {
        try { globalForIndexer.unwatchNFT(); } catch { }
        globalForIndexer.unwatchNFT = undefined;
    }
    if (globalForIndexer.unwatchMarketplace) {
        try { globalForIndexer.unwatchMarketplace(); } catch { }
        globalForIndexer.unwatchMarketplace = undefined;
    }

    console.log(`[Indexer][Started] Watching contract ${CONTRACT_ADDRESS} for live TransferSingle events.`);

    try {
        globalForIndexer.unwatchNFT = publicClient.watchContractEvent({
            address: CONTRACT_ADDRESS as `0x${string}`,
            abi: RCADE_ERC1155_ABI,
            eventName: 'TransferSingle',
            onLogs: (logs) => {
                queueLogs(logs);
            },
            onError: (error) => {
                console.error("[Indexer][Disconnected] ERC1155 WebSocket watcher failed:", error);
                triggerWatcherReconnect();
            }
        });
    } catch (err: any) {
        console.error("[Indexer] Failed to bind NFT watcher:", err.message);
        triggerWatcherReconnect();
    }

    // Watch Marketplace contract if active
    if (MARKETPLACE_ADDRESS && MARKETPLACE_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        console.log(`[Indexer][Started] Watching Marketplace ${MARKETPLACE_ADDRESS} for live trade events.`);
        try {
            globalForIndexer.unwatchMarketplace = publicClient.watchContractEvent({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: RCADE_MARKETPLACE_ABI,
                onLogs: (logs) => {
                    queueLogs(logs);
                },
                onError: (error) => {
                    console.error("[Indexer][Disconnected] Marketplace WebSocket watcher failed:", error);
                    triggerWatcherReconnect();
                }
            });
        } catch (err: any) {
            console.error("[Indexer] Failed to bind Marketplace watcher:", err.message);
            triggerWatcherReconnect();
        }
    }
}

function startPollingFallback() {
    if (globalForIndexer.pollingTimer) return;

    globalForIndexer.isPollingFallback = true;
    setPollingFallbackActive(true);

    // Clean up reconnect timers & active watchers
    if (globalForIndexer.reconnectTimer) {
        clearTimeout(globalForIndexer.reconnectTimer);
        globalForIndexer.reconnectTimer = undefined;
    }
    if (globalForIndexer.unwatchNFT) {
        try { globalForIndexer.unwatchNFT(); } catch { }
        globalForIndexer.unwatchNFT = undefined;
    }
    if (globalForIndexer.unwatchMarketplace) {
        try { globalForIndexer.unwatchMarketplace(); } catch { }
        globalForIndexer.unwatchMarketplace = undefined;
    }

    console.log(`[Indexer][Fallback] Transitioning into Graceful Polling Fallback mode (Interval: ${POLLING_INTERVAL_MS / 1000}s).`);
    globalForIndexer.pollingTimer = setInterval(async () => {
        await runPollingSync();
    }, POLLING_INTERVAL_MS);
}

function attemptWebSocketRecovery() {
    console.log("[Indexer][AutoRecovery] Polling is stable. Attempting to recover and re-bind WebSocket watchers silently...");

    globalForIndexer.consecutiveWatcherFailures = 0;
    globalForIndexer.isPollingFallback = false;
    setPollingFallbackActive(false);

    if (globalForIndexer.pollingTimer) {
        clearInterval(globalForIndexer.pollingTimer);
        globalForIndexer.pollingTimer = undefined;
    }

    startWatchers();
}

/**
 * Fetches a single chunk of logs using ONE batched getLogs call (multi-address + multi-topic).
 * This is the critical optimization: instead of 4 separate calls per chunk, we make 1.
 */
async function fetchChunkLogs(fromBlock: bigint, toBlock: bigint): Promise<any[]> {
    const addresses: `0x${string}`[] = [CONTRACT_ADDRESS as `0x${string}`];
    if (MARKETPLACE_ADDRESS && MARKETPLACE_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        addresses.push(MARKETPLACE_ADDRESS as `0x${string}`);
    }

    let retries = 0;
    while (retries <= 3) {
        try {
            const logs = await publicClient.getLogs({
                address: addresses,
                topics: [[
                    EVENT_TOPICS.TRANSFER_SINGLE,
                    EVENT_TOPICS.SALE_EXECUTED,
                    EVENT_TOPICS.LISTING_CANCELLED,
                    EVENT_TOPICS.ALL_LISTINGS_CANCELLED
                ]],
                fromBlock,
                toBlock
            } as any);
            return logs;
        } catch (err: any) {
            retries++;
            const is429 = err?.status === 429 || err?.message?.includes('429') || (err?.details || '').includes('Too Many');
            if (is429 && retries <= 3) {
                const backoffMs = 2000 * retries; // 2s, 4s, 6s
                console.warn(`[Indexer] 429 rate-limit hit. Backoff ${backoffMs}ms (retry ${retries}/3)...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            } else {
                recordRPCFailure();
                console.error(`[Indexer] getLogs failed (block ${fromBlock}–${toBlock}):`, err.message);
                return [];
            }
        }
    }
    return [];
}

async function runPollingSync() {
    const startTime = Date.now();
    try {
        const lastEvent = await prisma.indexedEvent.findFirst({
            orderBy: { blockNumber: 'desc' }
        });
        const currentBlock = await publicClient.getBlockNumber();

        let startBlock = lastEvent ? BigInt(lastEvent.blockNumber) + 1n : currentBlock - CHUNK_SIZE_BLOCKS;
        const endBlock = currentBlock;

        if (startBlock > endBlock) {
            return;
        }

        let isFirstChunk = true;
        while (startBlock <= endBlock) {
            let nextEndBlock = startBlock + CHUNK_SIZE_BLOCKS;
            if (nextEndBlock > endBlock) nextEndBlock = endBlock;

            // Throttle: pause between chunks (skip delay on the first chunk)
            if (!isFirstChunk) {
                await new Promise(resolve => setTimeout(resolve, INTER_CHUNK_DELAY_MS));
            }
            isFirstChunk = false;

            console.log(`[Indexer][Polling] Fetching logs in range [${startBlock.toString()} - ${nextEndBlock.toString()}]`);

            // Single batched call for all contracts and events
            const logs = await fetchChunkLogs(startBlock, nextEndBlock);

            if (logs.length > 0) {
                logs.sort((a, b) => {
                    if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber) - Number(b.blockNumber);
                    return Number(a.logIndex) - Number(b.logIndex);
                });
                await processLogs(logs);
            }

            startBlock = nextEndBlock + 1n;
        }

        recordSyncDuration(Date.now() - startTime);

        // Occasionally attempt to recover WebSocket watchers after stable polling runs
        if (Math.random() < 0.1) {
            attemptWebSocketRecovery();
        }

    } catch (err: any) {
        recordRPCFailure();
        console.error("[Indexer][Polling][Error] Polling loop failed:", err.message);
    }
}

function triggerWatcherReconnect() {
    if (globalForIndexer.isPollingFallback) return;
    if (globalForIndexer.reconnectTimer) return;

    recordWebsocketFailure();
    const failures = globalForIndexer.consecutiveWatcherFailures || 0;
    const newFailures = failures + 1;
    globalForIndexer.consecutiveWatcherFailures = newFailures;

    recordIndexerReconnect();

    if (newFailures >= 3) {
        startPollingFallback();
        return;
    }

    const delay = Math.min(5000 * Math.pow(2, failures), 60000);
    console.log(`[Indexer][Reconnect] WebSocket watcher failed. Retrying reconnect #${newFailures} in ${delay / 1000} seconds...`);

    globalForIndexer.reconnectTimer = setTimeout(() => {
        globalForIndexer.reconnectTimer = undefined;
        startWatchers();
    }, delay);
}

function queueLogs(logs: Log[]) {
    globalForIndexer.consecutiveWatcherFailures = 0; // Reset consecutive failures on successful live events
    const queue = globalForIndexer.eventQueue || [];

    // Memory Protection
    if (queue.length + logs.length > MAX_QUEUE_SIZE) {
        console.error(`[Indexer][Critical] MAX_QUEUE_SIZE (${MAX_QUEUE_SIZE}) exceeded! Wiping queue and triggering emergency backfill.`);
        globalForIndexer.eventQueue = []; // Safely clear unconfirmed logs
        runBackfill().catch(console.error);
        return;
    }

    for (const log of logs) {
        // Deduplicate in queue
        const exists = queue.some(q => q.transactionHash === log.transactionHash && q.logIndex === log.logIndex);
        if (!exists) {
            queue.push(log);
            console.log(`[Indexer][Queued] address: ${log.address} | txHash: ${log.transactionHash} | block: ${log.blockNumber}`);
        }
    }

    globalForIndexer.eventQueue = queue;
}

async function runBackfill() {
    console.log("[Indexer][Backfill] Starting backfill sequence...");
    const lastEvent = await prisma.indexedEvent.findFirst({
        orderBy: { blockNumber: 'desc' }
    });

    const currentBlock = await publicClient.getBlockNumber();

    // Cap backfill to MAX_BACKFILL_BLOCKS regardless of how far behind the DB is.
    // In dev, there are rarely meaningful on-chain events further back.
    const absoluteFloor = currentBlock > MAX_BACKFILL_BLOCKS
        ? currentBlock - MAX_BACKFILL_BLOCKS
        : 0n;

    const rawStart = lastEvent ? BigInt(lastEvent.blockNumber) + 1n : absoluteFloor;
    const clampedStart = rawStart < absoluteFloor ? absoluteFloor : rawStart;
    const targetBlock = currentBlock - BigInt(CONFIRMATION_DEPTH);

    if (clampedStart > targetBlock) {
        console.log(`[Indexer][Backfill] Already up to date (start=${clampedStart}, target=${targetBlock}). Skipping.`);
        return;
    }

    const totalBlocks = targetBlock - clampedStart;
    console.log(`[Indexer][Backfill] Scanning ${totalBlocks} blocks (${clampedStart} → ${targetBlock}, cap=${MAX_BACKFILL_BLOCKS})`);

    let cursor = clampedStart;
    const allLogs: any[] = [];

    try {
        while (cursor <= targetBlock) {
            const chunkEnd = cursor + CHUNK_SIZE_BLOCKS > targetBlock ? targetBlock : cursor + CHUNK_SIZE_BLOCKS;

            // Single batched call for all contracts and events
            const chunkLogs = await fetchChunkLogs(cursor, chunkEnd);
            allLogs.push(...chunkLogs);

            cursor = chunkEnd + 1n;

            // Throttle between chunks
            if (cursor <= targetBlock) {
                await new Promise(resolve => setTimeout(resolve, INTER_CHUNK_DELAY_MS));
            }
        }

        if (allLogs.length > 0) {
            console.log(`[Indexer][Backfill] Found ${allLogs.length} missed events. Processing...`);
            allLogs.sort((a, b) => {
                if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber) - Number(b.blockNumber);
                return Number(a.logIndex) - Number(b.logIndex);
            });
            await processLogs(allLogs);
            console.log("[Indexer][Backfill] Complete.");
        } else {
            console.log("[Indexer][Backfill] No missed events found.");
        }
    } catch (e) {
        console.error("[Indexer][Backfill] Failed:", e);
    }
}

let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue) return;
    const queue = globalForIndexer.eventQueue || [];
    if (queue.length === 0) return;

    isProcessingQueue = true;
    try {
        const currentBlock = await publicClient.getBlockNumber();
        const safeBlockLimit = currentBlock - BigInt(CONFIRMATION_DEPTH);

        // Sort queue: blockNumber ASC, logIndex ASC
        queue.sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) {
                return Number(a.blockNumber) - Number(b.blockNumber);
            }
            return Number(a.logIndex) - Number(b.logIndex);
        });

        const confirmedLogs = [];
        const remainingQueue = [];

        for (const log of queue) {
            const blockNum = BigInt(log.blockNumber);
            const confirmations = currentBlock - blockNum;

            if (blockNum <= safeBlockLimit) {
                console.log(`[Indexer][Confirmed] txHash: ${log.transactionHash} | block: ${log.blockNumber} | confirmations: ${confirmations}`);
                confirmedLogs.push(log);
            } else {
                console.log(`[Indexer][Deferred] txHash: ${log.transactionHash} | block: ${log.blockNumber} | confirmations: ${confirmations} (Needs ${CONFIRMATION_DEPTH})`);
                remainingQueue.push(log);
            }
        }

        if (confirmedLogs.length > 0) {
            await processLogs(confirmedLogs);
        }

        globalForIndexer.eventQueue = remainingQueue;
    } catch (e) {
        console.error("[Indexer][QueueProcessor] Error processing queue:", e);
    } finally {
        isProcessingQueue = false;
    }
}

async function processLogs(logs: Log[] | any[]) {
    for (const log of logs) {
        try {
            const { address, transactionHash, logIndex, blockNumber } = log;
            const isTokenEvent = address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
            const isMarketplaceEvent = MARKETPLACE_ADDRESS && address.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase();

            // 1. Idempotency Check
            const exists = await prisma.indexedEvent.findUnique({
                where: {
                    transactionHash_logIndex: {
                        transactionHash: transactionHash!,
                        logIndex: logIndex!
                    }
                }
            });

            if (exists) {
                console.log(`[Indexer][DuplicateIgnored] Event ${transactionHash}-${logIndex} already processed.`);
                continue;
            }

            // 2. Decode Log
            let decoded: any;
            if (isTokenEvent) {
                decoded = decodeEventLog({
                    abi: RCADE_ERC1155_ABI,
                    data: log.data,
                    topics: log.topics
                });
            } else if (isMarketplaceEvent) {
                decoded = decodeEventLog({
                    abi: RCADE_MARKETPLACE_ABI,
                    data: log.data,
                    topics: log.topics
                });
            } else {
                console.warn(`[Indexer] Unknown contract address log ignored: ${address}`);
                continue;
            }

            const { eventName, args } = decoded;
            const decodedArgs = args as any;

            // 3. Process Events
            if (eventName === 'TransferSingle') {
                const fromLower = decodedArgs.from.toLowerCase();
                const toLower = decodedArgs.to.toLowerCase();
                const id = decodedArgs.id.toString();
                const value = Number(decodedArgs.value);

                const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
                const isMint = fromLower === ZERO_ADDRESS;
                const isBurn = toLower === ZERO_ADDRESS;

                if (fromLower === toLower) {
                    console.log("[Indexer] Ignoring self-transfer");
                    continue;
                }

                await prisma.$transaction(async (tx) => {
                    await tx.indexedEvent.create({
                        data: {
                            eventName: 'TransferSingle',
                            transactionHash: transactionHash!,
                            logIndex: logIndex!,
                            blockNumber: Number(blockNumber)
                        }
                    });

                    // Decrement from wallet
                    if (!isMint) {
                        const fromOwnership = await tx.nFTOwnership.findUnique({
                            where: { wallet_tokenId: { wallet: fromLower, tokenId: id } }
                        });

                        if (!fromOwnership || fromOwnership.amount < value) {
                            console.error(`[Indexer][CriticalError] Underflow protection triggered! Wallet ${fromLower} owning ${fromOwnership?.amount || 0} tried transferring ${value}`);
                            throw new Error("Underflow protection triggered");
                        }

                        const updatedFrom = await tx.nFTOwnership.update({
                            where: { wallet_tokenId: { wallet: fromLower, tokenId: id } },
                            data: { amount: { decrement: value } }
                        });

                        await tx.nFTOwnership.update({
                            where: { wallet_tokenId: { wallet: fromLower, tokenId: id } },
                            data: { isActive: updatedFrom.amount > 0 }
                        });
                    }

                    // Increment to wallet
                    if (!isBurn) {
                        await tx.nFTOwnership.upsert({
                            where: { wallet_tokenId: { wallet: toLower, tokenId: id } },
                            update: {
                                amount: { increment: value },
                                isActive: true
                            },
                            create: {
                                wallet: toLower,
                                tokenId: id,
                                amount: value,
                                isActive: true
                            }
                        });
                    }
                });

                if (!isMint) recalculateUserProgression(fromLower).catch(console.error);
                if (!isBurn) recalculateUserProgression(toLower).catch(console.error);
                console.log(`[Indexer] Successfully Processed TransferSingle: ${value} of ${id} from ${fromLower} to ${toLower}`);

            } else if (eventName === 'SaleExecuted') {
                const sellerLower = decodedArgs.seller.toLowerCase();
                const buyerLower = decodedArgs.buyer.toLowerCase();
                const tokenId = decodedArgs.tokenId.toString();
                const amount = Number(decodedArgs.amount);
                const priceWei = decodedArgs.price.toString();

                await prisma.$transaction(async (tx) => {
                    await tx.indexedEvent.create({
                        data: {
                            eventName: 'SaleExecuted',
                            transactionHash: transactionHash!,
                            logIndex: logIndex!,
                            blockNumber: Number(blockNumber)
                        }
                    });

                    // Match ACTIVE listing in DB with the raw parameters
                    const matchingListing = await tx.marketplaceListing.findFirst({
                        where: {
                            seller: sellerLower,
                            tokenId,
                            amount,
                            price: priceWei,
                            status: 'ACTIVE'
                        },
                        orderBy: { createdAt: 'asc' }
                    });

                    if (matchingListing) {
                        await tx.marketplaceListing.update({
                            where: { id: matchingListing.id },
                            data: {
                                status: 'SOLD',
                                buyer: buyerLower,
                                saleTxHash: transactionHash
                            }
                        });
                        console.log(`[Indexer][Sale] MarketplaceListing ${matchingListing.id} marked as SOLD. Buyer: ${buyerLower}`);
                    } else {
                        console.warn(`[Indexer][Sale] SaleExecuted observed but no matching ACTIVE listing found in DB: Seller ${sellerLower}, TokenId ${tokenId}, Amount ${amount}`);
                    }
                });

            } else if (eventName === 'ListingCancelled') {
                const listingHash = decodedArgs.listingHash.toLowerCase();

                // Look up seller before the transaction to fire progression recalculation
                const existingListing = await prisma.marketplaceListing.findFirst({
                    where: { listingHash }
                });

                await prisma.$transaction(async (tx) => {
                    await tx.indexedEvent.create({
                        data: {
                            eventName: 'ListingCancelled',
                            transactionHash: transactionHash!,
                            logIndex: logIndex!,
                            blockNumber: Number(blockNumber)
                        }
                    });

                    await tx.marketplaceListing.updateMany({
                        where: {
                            listingHash,
                            status: 'ACTIVE'
                        },
                        data: { status: 'CANCELLED' }
                    });
                    console.log(`[Indexer][Cancel] Listing ${listingHash} marked as CANCELLED in DB.`);
                });

                // Restore seller's usable inventory in progression immediately
                if (existingListing?.seller) {
                    recalculateUserProgression(existingListing.seller).catch(console.error);
                }

            } else if (eventName === 'AllListingsCancelled') {
                const sellerLower = decodedArgs.seller.toLowerCase();
                const newNonce = decodedArgs.newNonce.toString();

                await prisma.$transaction(async (tx) => {
                    await tx.indexedEvent.create({
                        data: {
                            eventName: 'AllListingsCancelled',
                            transactionHash: transactionHash!,
                            logIndex: logIndex!,
                            blockNumber: Number(blockNumber)
                        }
                    });

                    const activeListings = await tx.marketplaceListing.findMany({
                        where: {
                            seller: sellerLower,
                            status: 'ACTIVE'
                        }
                    });

                    for (const listing of activeListings) {
                        if (BigInt(listing.nonce) < BigInt(newNonce)) {
                            await tx.marketplaceListing.update({
                                where: { id: listing.id },
                                data: { status: 'CANCELLED' }
                            });
                            console.log(`[Indexer][BulkCancel] Listing ${listing.id} invalidated (nonce ${listing.nonce} < ${newNonce})`);
                        }
                    }
                });

                // Restore seller's usable inventory across all cancelled listings
                recalculateUserProgression(sellerLower).catch(console.error);
            }

        } catch (error) {
            console.error(`[Indexer] Error processing log ${log.transactionHash}:`, error);
        }
    }
}
