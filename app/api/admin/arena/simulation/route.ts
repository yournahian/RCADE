import { NextResponse } from 'next/server';
import { runSimulationSuite } from '@/scripts/simulate-arena';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function POST(req: Request) {
  try {
    if (!verifyAdminSecret(req)) {
      console.warn('[Arena][Simulation][Admin][Violation] Unauthorized attempt to trigger arena simulation');
      return handleAdminUnauthorized();
    }

    const textBody = await req.text();
    let body: any = {};
    if (textBody) {
      try {
        body = JSON.parse(textBody);
      } catch {
        return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
      }
    }

    const { mode, seed } = body;

    if (!mode || typeof mode !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing "mode" parameter' }, { status: 400 });
    }

    const parsedSeed = parseInt(seed, 10) || 1337;

    console.log(`[Arena][Simulation][Admin] Valid administrative signature verified. Triggering simulation mode: ${mode} with Seed: ${parsedSeed}...`);
    
    // 2. Trigger simulation suite inside Next.js server runtime
    const report = await runSimulationSuite(mode, parsedSeed);

    return NextResponse.json(report);

  } catch (error: any) {
    console.error('[Arena][Simulation][Admin][Crash] Simulation suite failed to execute:', error);
    
    return NextResponse.json({ 
      error: 'Simulation execution crashed',
      details: error.message || 'Unknown exception'
    }, { status: 500 });
  }
}

// Support GET for easy browser-based triggering
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'NORMAL_MATCH_FLOW';
    const seedStr = searchParams.get('seed') || '1337';
    if (!verifyAdminSecret(req)) {
      console.warn('[Arena][Simulation][Admin][Violation] Unauthorized GET attempt to trigger arena simulation');
      return handleAdminUnauthorized();
    }

    const parsedSeed = parseInt(seedStr, 10) || 1337;

    console.log(`[Arena][Simulation][Admin] Valid GET signature verified. Triggering simulation mode: ${mode} with Seed: ${parsedSeed}...`);
    
    const report = await runSimulationSuite(mode, parsedSeed);

    return NextResponse.json(report);

  } catch (error: any) {
    console.error('[Arena][Simulation][Admin][Crash] GET Simulation suite failed to execute:', error);
    
    return NextResponse.json({ 
      error: 'Simulation execution crashed',
      details: error.message || 'Unknown exception'
    }, { status: 500 });
  }
}
