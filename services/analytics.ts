export type TelemetryEvent = 
  | 'LISTING_CREATED'
  | 'PURCHASE_COMPLETED'
  | 'TRANSACTION_FAILED'
  | 'PROGRESSION_CHANGED'
  | 'WALLET_MISMATCH_DETECTED';

export interface TelemetryPayload {
  event: TelemetryEvent;
  timestamp: string;
  wallet?: string;
  metadata?: any;
}

export class AnalyticsService {
  /**
   * Dispatches a lightweight internal telemetry tracking event.
   * Persists events to localStorage for diagnostics and outputs to console.
   */
  static track(event: TelemetryEvent, wallet?: string, metadata?: any) {
    const payload: TelemetryPayload = {
      event,
      timestamp: new Date().toISOString(),
      wallet: wallet?.toLowerCase(),
      metadata,
    };

    console.log(`[Telemetry] [${event}]`, payload);

    if (typeof window !== 'undefined') {
      try {
        const existing = localStorage.getItem('rcade_telemetry');
        const events: TelemetryPayload[] = existing ? JSON.parse(existing) : [];
        
        // Cap local logs at 100 entries to prevent memory bloating
        if (events.length >= 100) {
          events.shift();
        }
        
        events.push(payload);
        localStorage.setItem('rcade_telemetry', JSON.stringify(events));
      } catch (err) {
        console.error('[Telemetry] Failed to write to localStorage:', err);
      }
    }
  }

  /**
   * Retrieves all logged telemetry events from localStorage.
   */
  static getLogs(): TelemetryPayload[] {
    if (typeof window === 'undefined') return [];
    try {
      const existing = localStorage.getItem('rcade_telemetry');
      return existing ? JSON.parse(existing) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clears telemetry logs.
   */
  static clearLogs() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rcade_telemetry');
    }
  }
}
