import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const level = searchParams.get('level');

        let leaderboards;

        if (level) {
            // Level specific leaderboard based on GameRun aggregate max score
            const aggregated = await prisma.gameRun.groupBy({
                by: ['userId'],
                where: { level: parseInt(level), completed: true },
                _max: { score: true, combo: true },
                orderBy: { _max: { score: 'desc' } },
                take: 10
            });
            
            // To get usernames, we need to join manually since groupBy doesn't support relation fetching directly
            const userIds = aggregated.map(l => l.userId);
            const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, wallet: true } });
            
            leaderboards = aggregated.map(l => ({
                userId: l.userId,
                score: l._max.score,
                combo: l._max.combo,
                user: users.find(u => u.id === l.userId)
            }));
            
        } else {
            // Global leaderboard (Top overall users)
            leaderboards = await prisma.user.findMany({
                orderBy: { highestScore: 'desc' },
                take: 10,
                select: { id: true, username: true, wallet: true, highestScore: true, highestCombo: true, highestUnlockedLevel: true }
            });
        }

        return NextResponse.json({ leaderboards });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch leaderboards' }, { status: 500 });
    }
}
