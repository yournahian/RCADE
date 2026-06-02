import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { BackupExporterService } from '../services/backup-exporter';

async function main() {
  console.log('\n=============================================================================');
  console.log('         RCADE ARENA // CRYPTOGRAPHIC OFFLINE AUDITING GATEWAY               ');
  console.log('=============================================================================\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.startsWith('--file='));
  
  if (!fileArg) {
    console.error('Error: Missing required --file argument.');
    console.log('Usage: npx ts-node --project tsconfig.json scripts/verify-offline-bundle.ts --file=path/to/snapshot.json');
    process.exit(1);
  }

  const filePathVal = fileArg.split('=')[1];
  const absolutePath = path.resolve(filePathVal);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File does not exist at path: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`[OfflineAuditor] Reading evidence snapshot: ${path.basename(absolutePath)}`);
  
  try {
    const rawData = fs.readFileSync(absolutePath, 'utf8');
    
    console.log('[OfflineAuditor] Initiating mathematical validation sequence...');
    const result = await BackupExporterService.verifyOfflineBundle(rawData);

    if (result.healthy) {
      console.log('\n=============================================================================');
      console.log('🛡️  VERIFICATION SUCCESS: EXPORTS ARE GENUINE AND FREE OF TAMPERING          ');
      console.log('=============================================================================');
      console.log(`  Notarized At:   ${result.details.notarizedAt}`);
      console.log(`  Chain-Tip Hash: ${result.details.chainTipHash}`);
      console.log(`  Receipts Count: ${result.details.receiptsCount} matching matches`);
      console.log(`  Audit Blocks:   ${result.details.blocksCount} serialized ledger states`);
      console.log(`  Signature Seal: Verified mathematically (HMAC-SHA256 Anchor valid)`);
      console.log(`  Anchor Hash:    ${result.details.anchor}`);
      console.log('=============================================================================\n');
      process.exit(0);
    } else {
      console.error('\n=============================================================================');
      console.error('🚨 MATHEMATICAL ANOMALY DETECTED: OFFLINE SNAPSHOT IS COMPROMISED           ');
      console.error('=============================================================================');
      console.error(`  Reason: ${result.reason}`);
      console.error('  CAUTION: DO NOT USE THIS BUNDLE FOR DISPUTES OR TOURNAMENT PAYOUTS.');
      console.error('=============================================================================\n');
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`[OfflineAuditor][Fatal] Audit process panicked: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[OfflineAuditor][Crash] Fatal error running auditor:', err);
  process.exit(1);
});
