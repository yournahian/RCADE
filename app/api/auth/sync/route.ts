import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { recalculateUserProgression } from '@/services/progression';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);
        const privyUserId = verifiedClaims.userId;
        
        let dbUser = await prisma.user.findUnique({
            where: { id: privyUserId },
            include: { levelProgress: true }
        });

        let wallet = dbUser?.wallet || null;
        if (!wallet) {
            try {
                const privyUser = await privy.getUserById(privyUserId);
                wallet = privyUser.wallet?.address || null;
            } catch (e) {
                console.warn("Could not fetch Privy user info. Proceeding without wallet address.");
            }
        }

        dbUser = await prisma.user.upsert({
            where: { id: privyUserId },
            update: { wallet: wallet ? wallet : undefined },
            create: {
                id: privyUserId,
                wallet,
                highestUnlockedLevel: 1,
                effectiveProgressionLevel: 0
            },
            include: { levelProgress: true }
        });

        if (wallet) {
            recalculateUserProgression(wallet).catch((err) => {
                console.error(`[Sync] Background progression recalculation failed for ${wallet}:`, err);
            });
        }

        return NextResponse.json({ user: dbUser });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Auth sync failed' }, { status: 401 });
    }
}
