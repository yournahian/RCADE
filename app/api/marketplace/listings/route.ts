import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const statusParam = searchParams.get('status') || 'ACTIVE';
        const sellerParam = searchParams.get('seller');
        const tokenIdParam = searchParams.get('tokenId');
        const chainIdParam = searchParams.get('chainId');

        const whereClause: any = {};

        // Filter by status if specified, or default to ACTIVE listings
        if (statusParam && statusParam !== 'ALL') {
            whereClause.status = statusParam;
        }

        if (sellerParam) {
            const lowerSeller = sellerParam.toLowerCase();
            whereClause.OR = [
                { seller: lowerSeller },
                { seller: sellerParam }
            ];
        }

        if (tokenIdParam) {
            whereClause.tokenId = tokenIdParam;
        }

        if (chainIdParam) {
            whereClause.chainId = Number(chainIdParam);
        }

        // Fetch listings ordered by creation block/time descending
        const listings = await prisma.marketplaceListing.findMany({
            where: whereClause,
            orderBy: [
                { createdBlockNumber: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        // Serialize BigInt createdBlockNumber values to strings for JSON safety
        const serializedListings = listings.map(listing => ({
            ...listing,
            createdBlockNumber: listing.createdBlockNumber?.toString() || null
        }));

        return NextResponse.json({ listings: serializedListings });

    } catch (error: any) {
        console.error("Failed to query marketplace listings:", error);
        return NextResponse.json({ error: error.message || 'Failed to query listings' }, { status: 500 });
    }
}
