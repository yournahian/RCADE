'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, Loader2, X, ExternalLink } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  txHash?: string;
}

type ToastCallback = (toast: ToastItem) => void;
type DismissCallback = (id: string) => void;

const toastListeners = new Set<ToastCallback>();
const dismissListeners = new Set<DismissCallback>();

// Global toast helper mimicking Sonner/React-Hot-Toast
export const toast = {
  success: (title: string, message?: string, duration = 4000, txHash?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    toastListeners.forEach(listener => listener({ id, type: 'success', title, message, duration, txHash }));
    return id;
  },
  error: (title: string, message?: string, duration = 5000, txHash?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    toastListeners.forEach(listener => listener({ id, type: 'error', title, message, duration, txHash }));
    return id;
  },
  info: (title: string, message?: string, duration = 4000, txHash?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    toastListeners.forEach(listener => listener({ id, type: 'info', title, message, duration, txHash }));
    return id;
  },
  loading: (title: string, message?: string, options?: { id?: string }) => {
    const id = options?.id || Math.random().toString(36).substring(2, 9);
    toastListeners.forEach(listener => listener({ id, type: 'loading', title, message, duration: Infinity }));
    return id;
  },
  dismiss: (id: string) => {
    dismissListeners.forEach(listener => listener(id));
  }
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleAddToast = (newToast: ToastItem) => {
      setToasts(prev => {
        const filtered = prev.filter(t => t.id !== newToast.id);
        return [...filtered, newToast];
      });

      if (newToast.duration && newToast.duration !== Infinity) {
        setTimeout(() => {
          handleDismiss(newToast.id);
        }, newToast.duration);
      }
    };

    const handleDismiss = (id: string) => {
      setToasts(prev => prev.filter(t => t.id !== id));
    };

    toastListeners.add(handleAddToast);
    dismissListeners.add(handleDismiss);

    return () => {
      toastListeners.delete(handleAddToast);
      dismissListeners.delete(handleDismiss);
    };
  }, []);

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-xs md:max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => {
          let borderColor = 'rgba(169,221,211,0.3)';
          let leftBarColor = '#a9ddd3';
          let Icon = Info;

          if (t.type === 'success') {
            borderColor = 'rgba(169,221,211,0.6)';
            leftBarColor = '#a9ddd3';
            Icon = CheckCircle2;
          } else if (t.type === 'error') {
            borderColor = 'rgba(239,68,68,0.5)';
            leftBarColor = '#ef4444';
            Icon = AlertTriangle;
          } else if (t.type === 'loading') {
            borderColor = 'rgba(169,221,211,0.4)';
            leftBarColor = '#a9ddd3';
            Icon = Loader2;
          }

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 50, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="flex gap-3 items-start px-4 py-3.5 border pointer-events-auto shadow-2xl relative overflow-hidden"
              style={{
                background: '#0d0d0d',
                borderColor: borderColor,
                borderLeft: `4px solid ${leftBarColor}`,
              }}
            >
              {/* Scanline CRT overlay effect */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%]" />

              <div className="flex-shrink-0 mt-0.5">
                {t.type === 'loading' ? (
                  <Icon className="w-4 h-4 animate-spin" style={{ color: leftBarColor }} />
                ) : (
                  <Icon className="w-4 h-4" style={{ color: leftBarColor }} />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-2">
                <h4 className="font-heading text-[10px] font-bold uppercase tracking-[0.15em] text-white">
                  {t.title}
                </h4>
                {t.message && (
                  <p className="text-[9px] font-mono mt-1 leading-relaxed" style={{ color: '#aaa' }}>
                    {t.message}
                  </p>
                )}
                {t.txHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${t.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-[8px] font-heading font-black uppercase tracking-wider transition-colors hover:text-white"
                    style={{ color: '#a9ddd3' }}
                  >
                    View on Basescan <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="text-text-muted hover:text-white transition-colors flex-shrink-0 mt-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
