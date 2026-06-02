import { prisma } from '@/lib/prisma';
import { AuditArchiveService } from '@/services/audit-archive';
import { MetricsService } from '@/services/metrics';

export class RollbackJournalService {
  private static tableVerified = false;

  /**
   * Self-healing SQL model materialization for SettlementJournal.
   */
  static async ensureTableExists() {
    if (this.tableVerified) return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SettlementJournal" (
          "id" TEXT NOT NULL,
          "matchId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "attemptCount" INTEGER NOT NULL DEFAULT 0,
          "lastError" TEXT,
          "rollbackState" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SettlementJournal_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "SettlementJournal_matchId_idx" ON "SettlementJournal"("matchId");
      `);
      this.tableVerified = true;
    } catch (err) {
      console.error('[RollbackJournal] Dynamic table materialization failed:', err);
    }
  }

  /**
   * Logs that a match settlement transaction is starting.
   */
  static async startSettlement(matchId: string) {
    await this.ensureTableExists();
    console.log(`[RollbackJournal][Start] Match ID: ${matchId}`);
    
    try {
      const existing = await prisma.settlementJournal.findFirst({
        where: { matchId }
      });

      if (existing) {
        await prisma.settlementJournal.update({
          where: { id: existing.id },
          data: {
            status: 'SETTLING',
            attemptCount: { increment: 1 },
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.settlementJournal.create({
          data: {
            matchId,
            status: 'SETTLING',
            attemptCount: 1
          }
        });
      }
    } catch (err: any) {
      console.error(`[RollbackJournal][Start][Warning] Failed to log start for match ${matchId}:`, err.message);
    }
  }

  /**
   * Logs that a match settlement transaction committed successfully.
   */
  static async completeSettlement(matchId: string) {
    await this.ensureTableExists();
    console.log(`[RollbackJournal][Complete] Match ID: ${matchId}`);
    
    try {
      await prisma.settlementJournal.updateMany({
        where: { matchId },
        data: {
          status: 'COMPLETED',
          updatedAt: new Date()
        }
      });
    } catch (err: any) {
      console.error(`[RollbackJournal][Complete][Warning] Failed to log completion for match ${matchId}:`, err.message);
    }
  }

  /**
   * Logs that a match settlement transaction failed.
   */
  static async failSettlement(matchId: string, error: string) {
    await this.ensureTableExists();
    console.log(`[RollbackJournal][Fail] Match ID: ${matchId} | Error: ${error}`);
    
    try {
      await prisma.settlementJournal.updateMany({
        where: { matchId },
        data: {
          status: 'FAILED',
          lastError: error,
          updatedAt: new Date()
        }
      });
    } catch (err: any) {
      console.error(`[RollbackJournal][Fail][Warning] Failed to log failure for match ${matchId}:`, err.message);
    }
  }

  /**
   * Scans for any active or hanging settlement logs and executes deterministic recovery.
   * Runs periodically or upon system startup.
   */
  static async runRecoveryAudit(): Promise<{ processedCount: number; repairedCount: number; details: any[] }> {
    await this.ensureTableExists();
    console.log('[RollbackJournal] Commencing recovery audit for partial transaction boundaries...');

    let processedCount = 0;
    let repairedCount = 0;
    const details: any[] = [];

    try {
      // Find all journals stuck in SETTLING mode
      const stuckJournals = await prisma.settlementJournal.findMany({
        where: { status: 'SETTLING' }
      });

      for (const journal of stuckJournals) {
        processedCount++;
        const matchId = journal.matchId;

        // Check if a MatchReceipt was actually created in PostgreSQL
        const receipt = await prisma.matchReceipt.findUnique({
          where: { matchId }
        });

        if (receipt) {
          // Case 1: Transaction succeeded and was committed! 
          // The server crashed after the transaction but before completing the journal.
          console.log(`[RollbackJournal][Recover] Match ${matchId} has a receipt! Marking COMPLETED.`);
          
          await prisma.settlementJournal.update({
            where: { id: journal.id },
            data: { status: 'COMPLETED', updatedAt: new Date() }
          });

          // Check if an entry exists in the AuditArchive ledger
          const archiveBlocks = await prisma.auditArchive.findMany({
            where: {
              entryType: 'RECEIPT'
            }
          });

          const alreadyArchived = archiveBlocks.some((block: any) => block.payload.matchId === matchId);

          if (!alreadyArchived) {
            console.log(`[RollbackJournal][Recover] Repairing AuditArchive entry for Match: ${matchId}`);
            try {
              await AuditArchiveService.appendEntry('RECEIPT', {
                matchId,
                winnerId: receipt.winnerId,
                scores: (receipt.payload as any)?.scores ?? {}
              }, {
                settlementReceiptHash: receipt.settlementHash
              });
              repairedCount++;
              details.push({ matchId, action: 'LEDGER_REPAIR', status: 'SUCCESS' });
            } catch (err: any) {
              console.error(`[RollbackJournal][Recover] Failed to append AuditArchive block:`, err.message);
              details.push({ matchId, action: 'LEDGER_REPAIR', status: 'FAILED', error: err.message });
            }
          } else {
            details.push({ matchId, action: 'VERIFY_EXISTING', status: 'SUCCESS' });
          }

        } else {
          // Case 2: Transaction did NOT commit! 
          // The Prisma transaction rolled back cleanly. We must restore match status to ACTIVE to enable retry,
          // or INVALIDATED if it has repeatedly failed.
          console.log(`[RollbackJournal][Recover] Match ${matchId} has NO receipt. Transaction aborted during crash.`);

          const shouldRetry = journal.attemptCount < 3;
          const targetStatus = shouldRetry ? 'ACTIVE' : 'INVALIDATED';
          
          try {
            await prisma.$transaction([
              prisma.settlementJournal.update({
                where: { id: journal.id },
                data: {
                  status: 'FAILED',
                  lastError: `Transaction aborted mid-flight during crash. Attempts: ${journal.attemptCount}`,
                  updatedAt: new Date()
                }
              }),
              prisma.match.update({
                where: { id: matchId },
                data: {
                  status: targetStatus
                }
              })
            ]);
            
            repairedCount++;
            MetricsService.increment('settlement_failures_total');
            console.log(`[RollbackJournal][Recover] Repaired match status for Match: ${matchId} to ${targetStatus}`);
            details.push({ matchId, action: `RESTORE_${targetStatus}`, status: 'SUCCESS' });
          } catch (err: any) {
            console.error(`[RollbackJournal][Recover] Failed to repair match status:`, err.message);
            details.push({ matchId, action: 'RESTORE_STATUS', status: 'FAILED', error: err.message });
          }
        }
      }
    } catch (err: any) {
      console.error('[RollbackJournal][RecoveryAudit] Audit execution panicked:', err.message);
    }

    return { processedCount, repairedCount, details };
  }
}
