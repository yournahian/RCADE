import { NextResponse } from 'next/server';
import { BackupExporterService } from '@/services/backup-exporter';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
  try {
    if (!verifyAdminSecret(req)) {
      console.warn('[BackupsAPI][Warning] Unauthorized backup download attempt.');
      return handleAdminUnauthorized();
    }

    const { searchParams } = new URL(req.url);

    const startSeqParam = searchParams.get('startSeq');
    const endSeqParam = searchParams.get('endSeq');
    
    const startSeq = startSeqParam ? parseInt(startSeqParam) : undefined;
    const endSeq = endSeqParam ? parseInt(endSeqParam) : undefined;

    console.log(`[BackupsAPI] Exporting signed evidence bundle. Sequence range: [${startSeq ?? 1} - ${endSeq ?? 'TIP'}]`);
    const bundleString = await BackupExporterService.exportOfflineBundle(startSeq, endSeq);

    // Return the JSON string as a structured download attachment
    return new Response(bundleString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="rcade-audit-snapshot-${Date.now()}.json"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });

  } catch (err: any) {
    console.error('[BackupsAPI][Crash] Secured backups downloader failed:', err);
    return NextResponse.json({ error: 'Internal Server Error during backup synthesis.', details: err.message }, { status: 500 });
  }
}
