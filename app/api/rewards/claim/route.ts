import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';

/**
 * Legacy claim route: transitions old PENDING rewards to PREPARED state.
 * New rewards are created directly as PREPARED, so this route is only needed
 * for backward-compatibility with any PENDING rows that already exist in the database.
 *
 * If the reward is already PREPARED, returns it as-is (idempotent).
 */
export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const { rewardId } = await req.json();

        const reward = await prisma.reward.findUnique({
            where: { id: rewardId }
        });

        if (!reward) {
            return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
        }

        if (reward.userId !== verifiedClaims.userId) {
            return NextResponse.json({ error: 'Unauthorized claim attempt' }, { status: 403 });
        }

        // Already PREPARED — return as-is (idempotent)
        if (reward.claimStatus === 'PREPARED') {
            return NextResponse.json({ success: true, reward });
        }

        // Legacy PENDING → PREPARED transition
        if (reward.claimStatus !== 'PENDING') {
            return NextResponse.json({ error: 'Reward is not in a claimable state' }, { status: 400 });
        }

        const preparedReward = await prisma.reward.update({
            where: { id: rewardId },
            data: {
                claimStatus: 'PREPARED',
                claimedAt: new Date()
            }
        });

        return NextResponse.json({ success: true, reward: preparedReward });
    } catch (error) {
        console.error("Failed to prepare claim", error);
        return NextResponse.json({ error: 'Failed to prepare claim' }, { status: 500 });
    }
}
