import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MatchStatus } from '@prisma/client';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
  try {
    if (!verifyAdminSecret(req)) {
      console.warn('[Arena][Diagnostics][Violation] Unauthorized access attempt to diagnostics logs');
      return handleAdminUnauthorized();
    }

    // 2. Query operational indices
    const tenMinutesAgo = new Date(Date.now() - 600000);

    const [
      activeQueueCount,
      activeMatchesCount,
      staleActiveCount,
      totalMatchesCount,
      invalidatedCount,
      forfeitedCount
    ] = await Promise.all([
      prisma.match.count({ where: { status: MatchStatus.PENDING } }),
      prisma.match.count({ where: { status: MatchStatus.ACTIVE } }),
      prisma.match.count({ where: { status: MatchStatus.ACTIVE, createdAt: { lt: tenMinutesAgo } } }),
      prisma.match.count(),
      prisma.match.count({ where: { status: MatchStatus.INVALIDATED } }),
      prisma.match.count({ where: { status: MatchStatus.FORFEITED } })
    ]);

    // Calculate anomaly rates safely to prevent division by zero
    const anomalyRatePercentage = totalMatchesCount > 0 
      ? parseFloat(((invalidatedCount / totalMatchesCount) * 100).toFixed(2))
      : 0.0;

    const forfeitRatePercentage = totalMatchesCount > 0
      ? parseFloat(((forfeitedCount / totalMatchesCount) * 100).toFixed(2))
      : 0.0;

    console.log('[Arena][Diagnostics] Query completed. Reporting high-level operational indicators.');

    return NextResponse.json({
      success: true,
      metrics: {
        activeQueueCount,
        activeMatchesCount,
        staleActiveCount,
        totalMatchesCount,
        invalidatedCount,
        forfeitedCount,
        anomalyRatePercentage,
        forfeitRatePercentage
      }
    });

  } catch (error: any) {
    console.error('[Arena][Diagnostics][Crash] Diagnostics API failed:', error);
    
    // Fail-open: keep API from crashing server
    return NextResponse.json({
      error: 'Diagnostics retrieval failed',
      details: error.message || 'Unknown exception'
    }, { status: 500 });
  }
}
