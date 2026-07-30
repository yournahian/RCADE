import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';

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

    const { amount_usdc, return_path } = await req.json();
    if (!amount_usdc || isNaN(Number(amount_usdc)) || Number(amount_usdc) <= 0) {
      return NextResponse.json({ error: 'Valid USDC amount required' }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const redirectUrl = `${origin}${return_path || '/dashboard'}?ababilpay_status=success&ababilpay_intent_id={intent_id}`;
    const cancelUrl = `${origin}${return_path || '/dashboard'}?ababilpay_status=cancel`;

    const ababilKey = process.env.ABABILPAY_SECRET_KEY || 'sk_test_rcade_default';

    const response = await fetch('https://testnetv1.ababilpay.xyz/api/v1/x402/intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ababilKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount_usdc: Number(amount_usdc),
        description: `RCADE Wallet Top Up (${amount_usdc} USDC)`,
        order_id: `topup_${verifiedClaims.userId.slice(-6)}_${Date.now()}`,
        redirect_url: redirectUrl,
        cancel_url: cancelUrl
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Ababilpay intent creation failed:', errText);
      return NextResponse.json({ error: 'Failed to create payment intent with Ababilpay' }, { status: 502 });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in create-intent:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
