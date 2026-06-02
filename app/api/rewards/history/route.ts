import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { getUsableInventory } from '@/services/inventory';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const user = await prisma.user.findUnique({
            where: { id: verifiedClaims.userId }
        });

        if (!user || !user.wallet) {
             return NextResponse.json({ rewards: [] });
        }

        // Query usable inventory from canonical resolver
        const usableInventory = await getUsableInventory(user.wallet);

        return NextResponse.json({ rewards: usableInventory });


    } catch (error) {
        console.error("Failed to fetch inventory", error);
        return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
    }
}
