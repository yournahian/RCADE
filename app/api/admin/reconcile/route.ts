import { NextResponse } from 'next/server';
import { reconcileOwnerships } from '@/services/reconciliation';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
    if (!verifyAdminSecret(req)) {
        return handleAdminUnauthorized();
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    try {
        if (action === 'merge-duplicates') {
            return NextResponse.json({ error: 'Merge logic removed after unique constraint applied.' }, { status: 400 });
        } else if (action === 'reconcile') {
            const result = await reconcileOwnerships(false); // Admin check only, does not force repair
            return NextResponse.json(result);
        } else if (action === 'repair') {
            const result = await reconcileOwnerships(true); // Admin force repair
            return NextResponse.json(result);
        } else {
            return NextResponse.json({ error: 'Specify ?action=reconcile or ?action=repair' }, { status: 400 });
        }
    } catch (e: any) {
        console.error("Reconciliation Route Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
