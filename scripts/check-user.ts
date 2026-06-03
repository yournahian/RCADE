import { prisma } from '../lib/prisma';

async function main() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log("USERS:", users);

    const sessions = await prisma.gameSession.findMany({
        orderBy: { validFrom: 'desc' },
        take: 10
    });
    console.log("LATEST SESSIONS:", sessions.map(s => ({
        id: s.id,
        userId: s.userId,
        level: s.level,
        status: s.status,
        validFrom: s.validFrom
    })));

    const runs = await prisma.gameRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log("LATEST RUNS:", runs);

    const rewards = await prisma.reward.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log("LATEST REWARDS:", rewards);
}

main().catch(console.error);
