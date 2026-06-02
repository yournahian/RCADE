import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Use a global or context map to track active trace IDs if needed
const traceContext = new Map<string, string>();

/**
 * Higher-Order Function to wrap Next.js App Router API Routes.
 * Intercepts incoming requests, extracts/injects x-correlation-id,
 * passes it down, and ensures the response echoes the header.
 */
export function withCorrelationTrace(
  handler: (req: Request, context: any, correlationId: string) => Promise<Response>
) {
  return async (req: Request, context: any) => {
    // 1. Extract existing correlation-id or generate a new one
    const incomingId = req.headers.get('x-correlation-id') || req.headers.get('correlation-id');
    const correlationId = incomingId || `corr-${crypto.randomUUID()}`;

    console.log(`[Trace][Request] Intercepted path: ${req.url} | CorrelationID: ${correlationId}`);

    try {
      // 2. Execute underlying handler
      const response = await handler(req, context, correlationId);
      
      // 3. Clone or append correlation-id header to response
      response.headers.set('x-correlation-id', correlationId);
      return response;

    } catch (err: any) {
      console.error(`[Trace][Failure] Panicked during request trace. CorrelationID: ${correlationId} | Error:`, err);
      
      return NextResponse.json(
        { 
          error: 'Internal service execution fault.', 
          correlationId,
          details: process.env.NODE_ENV === 'development' ? err.message : undefined 
        },
        { 
          status: 500,
          headers: { 'x-correlation-id': correlationId }
        }
      );
    }
  };
}
