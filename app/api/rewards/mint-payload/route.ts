import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { createWalletClient, http, toHex, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { publicClient, CONTRACT_ADDRESS, CHAIN_ID, RCADE_ERC1155_ABI } from '@/lib/web3';
import { getGameBySlug } from '@/lib/games';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);

        const { rewardId, userWallet } = await req.json();
        if (!userWallet) return NextResponse.json({ error: 'User wallet required' }, { status: 400 });

        // 1. Validate Reward
        const reward = await prisma.reward.findUnique({
            where: { id: rewardId }
        });

        if (!reward) return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
        if (reward.userId !== verifiedClaims.userId) return NextResponse.json({ error: 'Unauthorized claim attempt' }, { status: 403 });
        if (reward.claimStatus !== 'PREPARED') return NextResponse.json({ error: 'Reward is not PREPARED' }, { status: 400 });

        // 2. Generate scalable deterministic tokenId using bitwise packing
        // Schema: [16b reserved][16b gameId][16b season][16b category][16b level][8b rarity][reserved]
        const rarityMap: Record<string, number> = { 'Common': 0, 'Rare': 1, 'Epic': 2, 'Legendary': 3 };
        const rarityCode = BigInt(rarityMap[reward.rarity] ?? 0);
        
        // Extract numeric level from "neon-snake-1"
        const levelCode = BigInt(parseInt(reward.levelId.split('-').pop() || '1'));
        const seasonCode = BigInt(parseInt(reward.season.split('-').pop() || '1'));
        
        // Dynamic game lookup to resolve gameIdCode dynamically
        const gameSlug = reward.levelId.split('-').slice(0, -1).join('-');
        const game = getGameBySlug(gameSlug);
        const gameIdCode = BigInt(game?.gameId ?? 1);
        
        const categoryCode = 0n; // Progression

        const tokenId = (
            (gameIdCode << 224n) |
            (seasonCode << 208n) |
            (categoryCode << 192n) |
            (levelCode << 176n) |
            (rarityCode << 168n)
        ).toString();

        // 3. Update Reward with deterministic tokenId (Keep status as PREPARED until tx succeeds)
        await prisma.reward.update({
            where: { id: rewardId },
            data: { 
                tokenId
            }
        });

        // 4. Removed Nonce Fetching for better UX

        // 5. Generate Signature
        const pk = process.env.MINTER_PRIVATE_KEY;
        if (!pk) throw new Error("MINTER_PRIVATE_KEY missing");
        
        const account = privateKeyToAccount(`0x${pk.replace('0x', '')}`);
        
        const domain = {
            name: 'RCADE',
            version: '1',
            chainId: CHAIN_ID,
            verifyingContract: CONTRACT_ADDRESS as `0x${string}`,
        };

        const types = {
            Mint: [
                { name: 'to', type: 'address' },
                { name: 'tokenId', type: 'uint256' },
                { name: 'amount', type: 'uint256' },
                { name: 'rewardId', type: 'bytes32' }
            ]
        };

        const rewardIdHash = keccak256(toHex(rewardId));

        const message = {
            to: userWallet as `0x${string}`,
            tokenId: BigInt(tokenId),
            amount: 1n,
            rewardId: rewardIdHash
        };

        const signature = await account.signTypedData({
            domain,
            types,
            primaryType: 'Mint',
            message
        });

        return NextResponse.json({
            success: true,
            payload: {
                to: message.to,
                tokenId: message.tokenId.toString(),
                amount: 1,
                rewardId: message.rewardId,
                signature
            }
        });
    } catch (error) {
        console.error("Failed to generate mint payload", error);
        return NextResponse.json({ error: 'Failed to generate mint payload' }, { status: 500 });
    }
}
