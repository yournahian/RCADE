import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { recalculateUserProgression } from '@/services/progression';
import { getGameBySlug } from '@/lib/games';
import { getGameProgression } from '@/lib/game-progression';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);
        
        const { level, gameSlug } = await req.json();
        const activeSlug = gameSlug || 'neon-snake';
        const game = getGameBySlug(activeSlug);
        if (!game) {
            return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        }

        // Validate progression
        let user = await prisma.user.findUnique({ where: { id: verifiedClaims.userId } });
        
        if (!user) {
            // Auto-create user if they skipped the dashboard sync
            let wallet = null;
            try {
                const privyUser = await privy.getUserById(verifiedClaims.userId);
                wallet = privyUser.wallet?.address || null;
            } catch (e) {
                console.warn("Could not fetch Privy user info. Proceeding without wallet address.");
            }
            
            user = await prisma.user.create({
                data: {
                    id: verifiedClaims.userId,
                    wallet,
                    highestUnlockedLevel: 1,
                    effectiveProgressionLevel: 0
                }
            });
        }

        console.log(`[GameplayLoop][Session] Initializing Session for userId: ${verifiedClaims.userId} (wallet: ${user.wallet ?? 'none'})... requesting Game: ${activeSlug}, Level: ${level}`);

        if (user.wallet) {
            try {
                const newLevel = await recalculateUserProgression(user.wallet);
                if (newLevel !== undefined && activeSlug === 'neon-snake') {
                    user.effectiveProgressionLevel = newLevel;
                }
            } catch (err) {
                console.error(`[Session] Failed to recalculate progression for ${user.wallet}:`, err);
            }
        }

        // Calculate dynamic progression for this specific game
        let progressionLevel = 0;
        if (user.wallet) {
            progressionLevel = await getGameProgression(user.wallet, game.gameId);
        }

        if (level > progressionLevel + 1) {
            return NextResponse.json({ error: 'Level locked' }, { status: 403 });
        }

        // Create session
        const session = await prisma.gameSession.create({
            data: {
                userId: user.id,
                level: level,
                status: 'ACTIVE'
            }
        });

        return NextResponse.json({ sessionId: session.id });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }
}
