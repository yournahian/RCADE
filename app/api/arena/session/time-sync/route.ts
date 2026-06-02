import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientSendTime } = body;

    if (!clientSendTime || typeof clientSendTime !== 'number') {
      return NextResponse.json({ error: 'Missing clientSendTime parameter' }, { status: 400 });
    }

    const serverTime = Date.now();
    
    return NextResponse.json({
      success: true,
      serverTime,
      clientSendTime
    });
  } catch (error: any) {
    console.error('[Arena][TimeSync][Crash] High-precision clock handshake failed:', error);
    return NextResponse.json({ error: 'Internal time synchronization failure' }, { status: 500 });
  }
}
