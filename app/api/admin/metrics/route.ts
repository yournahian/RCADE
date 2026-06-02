import { NextResponse } from 'next/server';
import { MetricsService } from '@/services/metrics';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
  try {
    if (!verifyAdminSecret(req)) {
      return handleAdminUnauthorized();
    }

    const payload = await MetricsService.getPrometheusFormat();

    // Return plain text standard Prometheus exposition format
    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });

  } catch (err: any) {
    console.error('[MetricsExporter][Crash] Exporter route failed:', err);
    return new Response(`Exporter Panic: ${err.message}`, { status: 500 });
  }
}
