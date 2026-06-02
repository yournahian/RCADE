import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { recalculateUserProgression } from '@/services/progression';

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

        // 2. Parse request payload
        const { listingHash } = await req.json();
        if (!listingHash) {
            return NextResponse.json({ error: 'Missing listingHash parameter' }, { status: 400 });
        }

        // 3. Find and check ownership of the listing
        const dbListing = await prisma.marketplaceListing.findUnique({
            where: { listingHash }
        });

        if (!dbListing) {
            return NextResponse.json({ error: 'Listing not found in database' }, { status: 404 });
        }

        // Enforce ownership: only the listing owner can cancel the listing
        if (dbListing.seller.toLowerCase() !== user.wallet.toLowerCase()) {
            return NextResponse.json({ error: 'Authenticated wallet does not match seller address' }, { status: 403 });
        }

        // 4. Update status to CANCELLED
        const updatedListing = await prisma.marketplaceListing.update({
            where: { listingHash },
            data: { status: 'CANCELLED' }
        });

        console.log(`[GameplayLoop][Marketplace] Listing hash: ${listingHash} voided and marked as CANCELLED by seller: ${user.wallet}`);

        // Instantly restore seller's usable inventory by recalculating progression
        recalculateUserProgression(user.wallet!).catch((err) => {
            console.error('[Cancel] Background progression recalculation failed:', err);
        });

        return NextResponse.json({ 
            success: true, 
            listing: {
                ...updatedListing,
                createdBlockNumber: updatedListing.createdBlockNumber?.toString() || null
            }
        });

    } catch (error: any) {
        console.error("Failed to cancel listing:", error);
        return NextResponse.json({ error: error.message || 'Failed to cancel listing' }, { status: 500 });
    }
}
