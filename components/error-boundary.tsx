'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Terminal } from 'lucide-react';
import { AnalyticsService } from '@/services/analytics';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught exception occurred:', error, errorInfo);
    this.setState({ errorInfo });

    // Track error in telemetry
    AnalyticsService.track('TRANSACTION_FAILED', undefined, {
      context: 'ErrorBoundary',
      message: error.message,
      stack: error.stack,
    });
  }

  private handleReboot = () => {
    // Graceful reboot flow
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-bg-void text-amber-500 font-mono p-4 flex flex-col items-center justify-center relative overflow-hidden select-none select-text-selection">
          {/* CRT Scanline Overlay */}
          <div className="absolute inset-0 pointer-events-none z-50 bg-scanlines opacity-15" />
          <div className="absolute inset-0 pointer-events-none z-40 bg-radial-crt" style={{
            background: 'radial-gradient(circle, transparent 60%, rgba(0,0,0,0.85) 100%)'
          }} />

          {/* Retro Amber Terminal Box */}
          <div className="w-full max-w-2xl border border-amber-500/30 bg-black/95 p-6 md:p-8 space-y-6 relative shadow-lg shadow-amber-500/5 select-text">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-amber-500" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-amber-500" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-500" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-500" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-amber-500/20">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 animate-pulse text-amber-500" />
                <span className="text-xs uppercase tracking-[0.2em] font-black">SYSTEM CRASH GATED</span>
              </div>
              <span className="text-[9px] uppercase tracking-widest text-amber-500/50 bg-amber-950/30 px-2 py-0.5 border border-amber-500/10">ERR_CODE: 0x80F3</span>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <div className="flex items-start gap-3.5 p-4 bg-amber-950/10 border border-amber-500/10 rounded-sm">
                <ShieldAlert className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5 animate-bounce" />
                <div className="space-y-1">
                  <h4 className="text-xs uppercase tracking-[0.15em] font-bold text-amber-400">CRITICAL EXCEPTION IN SYSTEM LAYER</h4>
                  <p className="text-[10px] text-amber-500/70 leading-relaxed font-mono">
                    A runtime error, Web3 hydration failure, or RPC socket rejection has halted active instruction sequencing. Optimistic states have been gated for recovery.
                  </p>
                </div>
              </div>

              {/* Error Details */}
              <div className="p-4 bg-black border border-amber-500/20 max-h-48 overflow-y-auto scrollbar-thin text-[9.5px] space-y-2 text-amber-400 font-mono">
                <div className="font-bold">EXCEPTION MESSAGE:</div>
                <div className="text-red-400 font-bold whitespace-pre-wrap">{this.state.error?.message || 'Unknown Runtime Error'}</div>
                {this.state.error?.stack && (
                  <>
                    <div className="font-bold pt-2 border-t border-amber-500/10">CALL STACK SEQUENCE:</div>
                    <pre className="text-amber-500/60 overflow-x-auto select-all leading-normal">{this.state.error.stack}</pre>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.href = '/';
                }}
                className="px-5 py-2.5 text-[9px] font-heading font-black uppercase tracking-widest text-amber-500/60 hover:text-amber-500 transition-colors border border-amber-500/10 hover:border-amber-500/30 cursor-pointer"
              >
                Return to Core
              </button>
              <button
                onClick={this.handleReboot}
                className="px-5 py-2.5 text-[9px] font-heading font-black uppercase tracking-widest bg-amber-500 text-black hover:bg-amber-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:shadow-amber-500/20"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin-reverse" />
                Reboot System
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
