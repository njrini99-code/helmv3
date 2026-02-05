'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

type ToastContextValue = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  showToast: (message: string, type: Toast['type']) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
let toastApi: ToastContextValue | null = null;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const duration = toast.duration ?? 5000;
    setToasts(prev => [...prev, { ...toast, id, duration }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Backward compatibility method
  const showToast = useCallback((message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, title: message, duration: 5000 }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const contextValue = { toasts, addToast, removeToast, showToast };

  useEffect(() => {
    toastApi = contextValue;
    return () => {
      if (toastApi === contextValue) {
        toastApi = null;
      }
    };
  }, [contextValue]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainerInternal toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

function ToastContainerInternal({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => onRemove(toast.id)}
          index={index}
        />
      ))}
    </div>
  );
}

// Export for backward compatibility
export function ToastContainer() {
  const context = useContext(ToastContext);
  if (!context) return null;
  return <ToastContainerInternal toasts={context.toasts} onRemove={context.removeToast} />;
}

const toastIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const toastColors = {
  success: {
    icon: 'text-primary-600',
    bg: 'bg-primary-50',
    border: 'border-l-primary-500',
    progress: 'bg-primary-500',
  },
  error: {
    icon: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-l-red-500',
    progress: 'bg-red-500',
  },
  warning: {
    icon: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-l-amber-500',
    progress: 'bg-amber-500',
  },
  info: {
    icon: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-l-blue-500',
    progress: 'bg-blue-500',
  },
};

function ToastItem({ toast, onRemove, index }: { toast: Toast; onRemove: () => void; index: number }) {
  const Icon = toastIcons[toast.type];
  const colors = toastColors[toast.type];
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef(Date.now());
  const duration = toast.duration ?? 5000;

  // Progress bar countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 50);

    return () => clearInterval(interval);
  }, [duration]);

  const handleRemove = useCallback(() => {
    setIsExiting(true);
    setTimeout(onRemove, 200);
  }, [onRemove]);

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto w-[380px] bg-white border border-warm-200 border-l-4 rounded-[14px] shadow-lg overflow-hidden',
        'transition-all duration-200 ease-out',
        isExiting
          ? 'opacity-0 translate-x-[120%] scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-slide-in-right',
        colors.border,
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="p-4 flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', colors.bg)}>
          <Icon className={cn('w-4 h-4', colors.icon)} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-warm-900">{toast.title}</p>
          {toast.description && (
            <p className="text-sm text-warm-500 mt-0.5">{toast.description}</p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="text-sm font-medium text-primary-600 hover:text-primary-700 mt-2 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleRemove}
          aria-label="Dismiss notification"
          className={cn(
            'w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center',
            'text-warm-400 hover:text-warm-600 hover:bg-warm-100',
            'transition-all duration-150 active:scale-90',
          )}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] bg-warm-100 w-full">
        <div
          className={cn('h-full transition-all duration-100 ease-linear', colors.progress)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Helper functions for easy toast triggering
export const toast = {
  success: (title: string, description?: string, action?: { label: string; onClick: () => void }) => {
    toastApi?.addToast({ type: 'success', title, description, action });
  },
  error: (title: string, description?: string) => {
    toastApi?.addToast({ type: 'error', title, description });
  },
  warning: (title: string, description?: string) => {
    toastApi?.addToast({ type: 'warning', title, description });
  },
  info: (title: string, description?: string, action?: { label: string; onClick: () => void }) => {
    toastApi?.addToast({ type: 'info', title, description, action });
  },
};
