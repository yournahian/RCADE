import { NextResponse } from 'next/server';
import { recalculateUserProgression } from '@/services/progression';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function POST(req: Request) {
    try {
        if (!verifyAdminSecret(req)) {
            return handleAdminUnauthorized();
        }

        const { wallet } = await req.json();
        
        if (!wallet) return NextResponse.json({ error: 'Wallet required' }, { status: 400 });

        const newProgression = await recalculateUserProgression(wallet);

        return NextResponse.json({ success: true, newProgression });
    } catch (error) {
        console.error("Failed to recalculate", error);
        return NextResponse.json({ error: 'Failed to recalculate' }, { status: 500 });
    }
}
