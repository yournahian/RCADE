import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { getGameBySlug } from '@/lib/games';
import { getGameProgression } from '@/lib/game-progression';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const { searchParams } = new URL(req.url);
        const gameSlug = searchParams.get('gameSlug');

        if (!gameSlug) {
            return NextResponse.json({ error: 'Missing gameSlug parameter' }, { status: 400 });
        }

        const game = getGameBySlug(gameSlug);
        if (!game) {
            return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        }

        const user = await prisma.user.findUnique({
            where: { id: verifiedClaims.userId }
        });

        if (!user || !user.wallet) {
            return NextResponse.json({ effectiveProgressionLevel: 0 });
        }

        const progressionLevel = await getGameProgression(user.wallet, game.gameId);

        return NextResponse.json({ 
            success: true, 
            gameSlug,
            gameId: game.gameId,
            effectiveProgressionLevel: progressionLevel 
        });

    } catch (error: any) {
        console.error("[ProgressionAPI] Error fetching game progression:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
