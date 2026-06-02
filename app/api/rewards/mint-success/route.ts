import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { publicClient } from '@/lib/web3';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const { rewardId, txHash } = await req.json();

        // 1. Find the Reward
        const reward = await prisma.reward.findUnique({
            where: { id: rewardId }
        });

        if (!reward) return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
        if (reward.userId !== verifiedClaims.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

        // 2. Verify Transaction Receipt
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
        if (!receipt) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        if (receipt.status !== 'success') return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });

        // 3. Update Reward Status
        const updatedReward = await prisma.reward.update({
            where: { id: rewardId },
            data: {
                claimStatus: 'MINTED',
                txHash
            }
        });

        return NextResponse.json({ success: true, reward: updatedReward });
    } catch (error) {
        console.error("Failed to verify mint success", error);
        return NextResponse.json({ error: 'Failed to verify mint success' }, { status: 500 });
    }
}
