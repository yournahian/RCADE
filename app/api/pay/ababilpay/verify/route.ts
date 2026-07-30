import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const verifiedClaims = await privy.verifyAuthToken(token);
    if (!verifiedClaims) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const { intentId } = await req.json();
    if (!intentId) {
      return NextResponse.json({ error: 'intentId required' }, { status: 400 });
    }

    // 1. Check if intentId is already processed to prevent double-spending/double-funding
    const alreadyProcessed = await prisma.indexedEvent.findUnique({
      where: {
        transactionHash_logIndex: {
          transactionHash: intentId,
          logIndex: 9999
        }
      }
    });

    if (alreadyProcessed) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        message: 'Top-up has already been processed and wallet was funded.',
        txHash: alreadyProcessed.id // using existing field as mock/placeholder or just confirmation
      });
    }

    // 2. Poll Ababilpay GET API to verify payment intent status
    const ababilKey = process.env.ABABILPAY_SECRET_KEY || 'sk_test_rcade_default';
    const response = await fetch(`https://testnetv1.ababilpay.xyz/api/v1/x402/intents/${intentId}`, {
      headers: {
        'Authorization': `Bearer ${ababilKey}`
      }
    });

    if (!response.ok) {
      console.error('Ababilpay intent fetch failed:', await response.text());
      return NextResponse.json({ error: 'Failed to verify payment intent status with Ababilpay' }, { status: 502 });
    }

    const result = await response.json();
    const intentData = result.data;

    if (!intentData || intentData.status !== 'paid') {
      return NextResponse.json({
        success: false,
        status: intentData?.status || 'pending',
        message: 'Payment has not been settled yet.'
      });
    }

    // 3. Fulfill: Resolve destination wallet
    const privyUser = await privy.getUserById(verifiedClaims.userId);
    const userWalletAddress = privyUser.wallet?.address;
    if (!userWalletAddress) {
      return NextResponse.json({ error: 'No wallet linked to authenticated user account' }, { status: 400 });
    }

    // 4. Calculate top up reward (Base Sepolia ETH)
    // Formula: 0.005 ETH per 1 USDC paid
    const amountUsdc = Number(intentData.amount_usdc || 10);
    const ethPayout = (amountUsdc * 0.005).toFixed(4); // e.g. 10 USDC -> 0.0500 ETH

    // 5. Execute on-chain transfer from minter/admin wallet to user
    const pk = process.env.MINTER_PRIVATE_KEY;
    if (!pk) {
      throw new Error('MINTER_PRIVATE_KEY is not configured in backend environment variables.');
    }

    const account = privateKeyToAccount(`0x${pk.replace('0x', '')}`);
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org')
    });

    console.log(`Fulfilling top-up: Sending ${ethPayout} ETH to user ${userWalletAddress} (Intent: ${intentId})`);
    const topupTxHash = await walletClient.sendTransaction({
      to: userWalletAddress as `0x${string}`,
      value: parseEther(ethPayout)
    });

    // 6. Record processed intent in IndexedEvent table to enforce idempotency
    await prisma.indexedEvent.create({
      data: {
        eventName: 'ABABILPAY_TOPUP',
        transactionHash: intentId,
        logIndex: 9999,
        blockNumber: 0
      }
    });

    return NextResponse.json({
      success: true,
      status: 'paid',
      amountUsdc,
      ethPayout,
      txHash: topupTxHash
    });
  } catch (error: any) {
    console.error('Error verifying Ababilpay topup:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
