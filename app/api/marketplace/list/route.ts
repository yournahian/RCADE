import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { publicClient, MARKETPLACE_ADDRESS, RCADE_MARKETPLACE_ABI } from '@/lib/web3';
import { recalculateUserProgression } from '@/services/progression';
import { getUsableInventory } from '@/services/inventory';

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

        // 2. Parse payload
        const { listing, signature, chainId } = await req.json();
        if (!listing || !signature || !chainId) {
            return NextResponse.json({ error: 'Malformed request payload' }, { status: 400 });
        }

        // Enforce that the seller wallet matches the authenticated user's wallet
        if (listing.seller.toLowerCase() !== user.wallet.toLowerCase()) {
            return NextResponse.json({ error: 'Authenticated wallet does not match seller address' }, { status: 403 });
        }

        const tokenId = listing.tokenId.toString();
        const amount = Number(listing.amount);
        const expiry = Number(listing.expiry);

        if (amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
        if (BigInt(listing.price) <= 0n) return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
        if (expiry <= Math.floor(Date.now() / 1000)) return NextResponse.json({ error: 'Listing has already expired' }, { status: 400 });

        // 3. ERC1155 Overlisting Prevention using Centralized Resolver
        const usableInventory = await getUsableInventory(user.wallet);
        const targetTokenId = listing.tokenId.toString();
        
        let available = 0;
        try {
            const targetBig = BigInt(targetTokenId);
            const usableItem = usableInventory.find(item => {
                try {
                    return BigInt(item.tokenId) === targetBig;
                } catch {
                    return item.tokenId === targetTokenId;
                }
            });
            available = usableItem?.amount ?? 0;
        } catch {
            const usableItem = usableInventory.find(item => item.tokenId === targetTokenId);
            available = usableItem?.amount ?? 0;
        }

        if (amount > available) {
            return NextResponse.json({
                error: `Insufficient available balance. Available to list: ${available}.`
            }, { status: 400 });
        }

        // 3. Canonical On-Chain Validation Check
        const listingTuple = {
            seller: listing.seller as `0x${string}`,
            tokenId: BigInt(listing.tokenId),
            amount: BigInt(listing.amount),
            price: BigInt(listing.price), // Raw Wei string parsed into BigInt
            expiry: BigInt(listing.expiry),
            nonce: BigInt(listing.nonce)
        };

        const status = await publicClient.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: RCADE_MARKETPLACE_ABI,
            functionName: 'validateListing',
            args: [listingTuple, signature as `0x${string}`]
        });

        if (status !== 0) {
            const statusMap: Record<number, string> = {
                1: "Listing has expired.",
                2: "Listing signature has already been used or cancelled.",
                3: "Listing nonce is invalid.",
                4: "Invalid EIP-712 wallet signature.",
                5: "Insufficient on-chain NFT balance. If this is a newly earned reward, please click 'Mint' in your Vault first so it exists on Base Sepolia before listing.",
                6: "Marketplace contract operator is not approved."
            };
            const reason = statusMap[status] || `Contract validation error code ${status}`;
            return NextResponse.json({ error: reason }, { status: 400 });
        }

        // 4. Compute correct EIP-712 hash on-chain to prevent duplicate logic/bugs
        const listingHash = await publicClient.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: RCADE_MARKETPLACE_ABI,
            functionName: 'hashListing',
            args: [
                listingTuple.seller,
                listingTuple.tokenId,
                listingTuple.amount,
                listingTuple.price,
                listingTuple.expiry,
                listingTuple.nonce
            ]
        });

        console.log(`[GameplayLoop][Marketplace] EIP-712 listing validation completed on-chain. ListingHash: ${listingHash}. Writing ACTIVE list entry for seller: ${listing.seller.toLowerCase()}`);

        // 5. Fetch current block number
        const currentBlock = await publicClient.getBlockNumber();

        // 6. Upsert the Active Listing in database
        const dbListing = await prisma.marketplaceListing.upsert({
            where: { listingHash },
            update: {
                seller: listing.seller.toLowerCase(),
                tokenId,
                amount,
                price: listing.price.toString(), // Wei stored as raw string
                expiry,
                nonce: listing.nonce.toString(),
                signature,
                status: 'ACTIVE',
                chainId: Number(chainId),
                createdBlockNumber: currentBlock
            },
            create: {
                listingHash,
                seller: listing.seller.toLowerCase(),
                tokenId,
                amount,
                price: listing.price.toString(), // Wei stored as raw string
                expiry,
                nonce: listing.nonce.toString(),
                signature,
                status: 'ACTIVE',
                chainId: Number(chainId),
                createdBlockNumber: currentBlock
            }
        });

        // Instantly recalculate user progression to reflect newly reserved asset
        const updatedProgressionLevel = await recalculateUserProgression(user.wallet!);

        const updatedUser = await prisma.user.findUnique({
            where: { id: user.id }
        });

        return NextResponse.json({ 
            success: true, 
            user: updatedUser,
            effectiveProgressionLevel: updatedProgressionLevel ?? 0,
            listing: {
                ...dbListing,
                createdBlockNumber: dbListing.createdBlockNumber?.toString() || null
            } 
        });

    } catch (error: any) {
        console.error("Failed to list item off-chain:", error);
        return NextResponse.json({ error: error.message || 'Failed to list asset' }, { status: 500 });
    }
}
