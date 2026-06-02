import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publicClient, MARKETPLACE_ADDRESS, RCADE_MARKETPLACE_ABI } from '@/lib/web3';

export async function POST(req: Request) {
    try {
        const { listingHash } = await req.json();
        if (!listingHash) {
            return NextResponse.json({ error: 'Missing listingHash parameter' }, { status: 400 });
        }

        // 1. Fetch listing details from database
        const listing = await prisma.marketplaceListing.findUnique({
            where: { listingHash }
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found in database' }, { status: 404 });
        }

        // 2. Perform canonical on-chain view query
        const listingTuple = {
            seller: listing.seller as `0x${string}`,
            tokenId: BigInt(listing.tokenId),
            amount: BigInt(listing.amount),
            price: BigInt(listing.price), // Stored as raw wei string in DB
            expiry: BigInt(listing.expiry),
            nonce: BigInt(listing.nonce)
        };

        const status = await publicClient.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: RCADE_MARKETPLACE_ABI,
            functionName: 'validateListing',
            args: [listingTuple, listing.signature as `0x${string}`]
        });

        // 3. Map on-chain status to database statuses
        // 0 = Valid, 1 = Expired, other non-zero = Invalid (cancelled, invalid nonce, insufficient balance, etc.)
        let dbStatus: 'ACTIVE' | 'EXPIRED' | 'INVALID' = 'ACTIVE';
        if (status === 0) {
            dbStatus = 'ACTIVE';
        } else if (status === 1) {
            dbStatus = 'EXPIRED';
        } else {
            dbStatus = 'INVALID';
        }

        // 4. Update and return updated record
        const updatedListing = await prisma.marketplaceListing.update({
            where: { listingHash },
            data: { status: dbStatus }
        });

        const statusMap = [
            "Valid",
            "Listing expired",
            "Listing already used or cancelled",
            "Listing nonce invalidated",
            "Invalid signature",
            "Insufficient NFT balance",
            "Marketplace not approved"
        ];

        return NextResponse.json({
            success: true,
            status: dbStatus,
            contractStatusCode: status,
            contractStatusMessage: statusMap[status] || "Unknown status",
            listing: {
                ...updatedListing,
                createdBlockNumber: updatedListing.createdBlockNumber?.toString() || null
            }
        });

    } catch (error: any) {
        console.error("Failed to validate listing:", error);
        return NextResponse.json({ error: error.message || 'Failed to validate listing' }, { status: 500 });
    }
}
