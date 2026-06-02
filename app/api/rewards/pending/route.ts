import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';

/**
 * Returns the user's PREPARED rewards — NFTs they have earned but not yet minted.
 * These are shown in Reward Vault with a direct "MINT NFT" button.
 * PREPARED status does NOT represent on-chain ownership and does NOT unlock progression.
 */
export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const preparedRewards = await prisma.reward.findMany({
            where: {
                userId: verifiedClaims.userId,
                claimStatus: 'PREPARED'
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({ rewards: preparedRewards });
    } catch (error) {
        console.error("Failed to fetch prepared rewards", error);
        return NextResponse.json({ error: 'Failed to fetch rewards' }, { status: 500 });
    }
}
