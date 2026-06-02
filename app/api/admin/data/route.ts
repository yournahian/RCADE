import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
    try {
        if (!verifyAdminSecret(req)) {
            return handleAdminUnauthorized();
        }

        const ownerships = await prisma.nFTOwnership.findMany({
            orderBy: { acquiredAt: 'desc' },
            take: 100
        });

        const events = await prisma.indexedEvent.findMany({
            orderBy: { processedAt: 'desc' },
            take: 50
        });

        const users = await prisma.user.findMany({
            select: {
                id: true,
                wallet: true,
                username: true,
                highestUnlockedLevel: true,
                effectiveProgressionLevel: true
            }
        });

        return NextResponse.json({ ownerships, events, users });
    } catch (error) {
        console.error("Failed to fetch admin data", error);
        return NextResponse.json({ error: 'Failed to fetch admin data' }, { status: 500 });
    }
}
