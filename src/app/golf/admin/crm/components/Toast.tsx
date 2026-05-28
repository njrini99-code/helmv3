'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { IconXCircle, IconCheckCircle2, IconWarning, IconInfo, IconX } from '@/components/icons';
import { IconButton } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

// ============================================================================
// CONFIG
// ============================================================================
const TOAST_CONFIG: Record<ToastType, {
  icon: typeof IconCheckCircle2;
  containerClass: string;
  iconClass: string;
}> = {
  success: {
    icon: IconCheckCircle2,
    containerClass: 'border-emerald-200/50 bg-emerald-50/80',
    iconClass: 'text-emerald-500',
  },
  error: {
    icon: IconXCircle,
    containerClass: 'border-red-200/50 bg-red-50/80',
    iconClass: 'text-red-500',
  },
  warning: {
    icon: IconWarning,
    containerClass: 'border-amber-200/50 bg-amber-50/80',
    iconClass: 'text-amber-500',
  },
  info: {
    icon: IconInfo,
    containerClass: 'border-blue-200/50 bg-blue-50/80',
    iconClass: 'text-blue-500',
  },
};

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 3;

// ============================================================================
// PROVIDER
// ============================================================================
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setRemoving(prev => new Set(prev).add(id));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      setRemoving(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => {
      const next = [...prev, { id, type, message, createdAt: Date.now() }];
      // Auto-dismiss oldest beyond max
      if (next.length > MAX_VISIBLE) {
        const oldest = next[0];
        if (oldest) {
          const existing = timersRef.current.get(oldest.id);
          if (existing) clearTimeout(existing);
          timersRef.current.delete(oldest.id);
          dismiss(oldest.id);
        }
      }
      return next;
    });

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      dismiss(id);
    }, AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container — bottom-right */}
      <div className="fixed bottom-4 right-4 z-toolbar flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.slice(-MAX_VISIBLE).map(item => {
          const config = TOAST_CONFIG[item.type];
          const Icon = config.icon;
          const isRemoving = removing.has(item.id);

          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-xl',
                'transition-all duration-200 ease-out',
                isRemoving
                  ? 'opacity-0 translate-x-4'
                  : 'opacity-100 translate-x-0',
                config.containerClass,
              )}
              style={{ minWidth: 260, maxWidth: 380 }}
            >
              <Icon size={16} className={cn('flex-shrink-0', config.iconClass)} />
              <span className="text-sm font-medium text-warm-800 flex-1">{item.message}</span>
              <IconButton variant="default" aria-label="Close"
                onClick={() => {
                  const existing = timersRef.current.get(item.id);
                  if (existing) clearTimeout(existing);
                  timersRef.current.delete(item.id);
                  dismiss(item.id);
                }}
                className="flex-shrink-0 p-0.5 rounded-md text-warm-400 hover:text-warm-600 transition-colors"
              >
                <IconX size={12} />
              </IconButton>
            </div>
          );
        })}
      </div>

      {/* Animation is handled via inline style on each toast element */}
    </ToastContext.Provider>
  );
}
