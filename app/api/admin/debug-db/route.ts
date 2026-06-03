import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const userId = "did:privy:cmp4eylfc008r0cl8rwkqq4p1";
        
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        const sessions = await prisma.gameSession.findMany({
            where: { userId },
            orderBy: { validFrom: 'desc' },
            take: 20
        });

        const runs = await prisma.gameRun.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        const rewards = await prisma.reward.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        const wallet = user?.wallet;
        const nftOwnerships = wallet ? await prisma.nFTOwnership.findMany({
            where: { wallet: { equals: wallet, mode: 'insensitive' } }
        }) : [];

        return NextResponse.json({
            user,
            sessions: sessions.map(s => ({
                id: s.id,
                userId: s.userId,
                level: s.level,
                status: s.status,
                validFrom: s.validFrom
            })),
            runs,
            rewards,
            nftOwnerships
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
