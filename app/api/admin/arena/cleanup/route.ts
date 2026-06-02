import { NextResponse } from 'next/server';
import { ArenaCleanupService } from '@/services/arena-cleanup';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function POST(req: Request) {
  try {
    if (!verifyAdminSecret(req)) {
      console.warn('[Arena][Cleanup][Admin][Violation] Unauthorized attempt to invoke cleanup cron');
      return handleAdminUnauthorized();
    }

    console.log('[Arena][Cleanup][Cron] Valid sweep signature verified. Triggering garbage collection...');
    
    // 2. Trigger active garbage collection service
    await ArenaCleanupService.runGarbageCollection();

    return NextResponse.json({ success: true, message: 'Garbage collection completed' });

  } catch (error: any) {
    console.error('[Arena][Cleanup][Admin][Crash] Garbage collection cron failed to run:', error);
    
    // Fail Open: keep route from crashing server
    return NextResponse.json({ 
      error: 'Garbage collection cron failed',
      details: error.message || 'Unknown exception'
    }, { status: 500 });
  }
}
