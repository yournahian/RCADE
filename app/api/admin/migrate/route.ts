import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
  try {
    if (!verifyAdminSecret(req)) {
      return handleAdminUnauthorized();
    }

    console.log('[Arena][Migrate] Executing dynamic database schema updates...');
    
    // Create the DistributedLock table dynamically if it does not exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DistributedLock" (
        "key" TEXT NOT NULL,
        "holder" TEXT NOT NULL,
        "fencingToken" INTEGER NOT NULL DEFAULT 1,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DistributedLock_pkey" PRIMARY KEY ("key")
      );
    `);

    // Create the SettlementJournal table dynamically if it does not exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SettlementJournal" (
        "matchId" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 1,
        "error" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SettlementJournal_pkey" PRIMARY KEY ("matchId")
      );
    `);

    console.log('[Arena][Migrate] Database schema synchronization completed successfully.');
    return NextResponse.json({ success: true, message: 'Schema sync completed successfully' });

  } catch (err: any) {
    console.error('[Arena][Migrate][Crash] Schema sync failed:', err);
    return NextResponse.json({ error: 'Migration failed', details: err.message }, { status: 500 });
  }
}
