'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<{
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  showToast: (message: string, type: Toast['type']) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Backward compatibility method
  const showToast = useCallback((message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, title: message }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, showToast }}>
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
    <div className="
      fixed bottom-6 right-6 z-50
      flex flex-col gap-3
      pointer-events-none
    ">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
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
  success: 'text-primary-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const Icon = toastIcons[toast.type];

  return (
    <div className="
      pointer-events-auto
      w-[360px]
      bg-white
      border border-warm-200
      rounded-[16px]
      shadow-lg
      p-4
      flex items-start gap-3
      animate-in slide-in-from-right-full fade-in
      duration-200
    ">
      <Icon className={`w-5 h-5 flex-shrink-0 ${toastColors[toast.type]}`} />

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-warm-900">{toast.title}</p>
        {toast.description && (
          <p className="text-sm text-warm-500 mt-0.5">{toast.description}</p>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 mt-2"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={onRemove}
        className="
          w-6 h-6 flex-shrink-0
          rounded-md
          flex items-center justify-center
          text-warm-400 hover:text-warm-600 hover:bg-warm-100
          transition-colors duration-150
        "
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Helper functions for easy toast triggering
export const toast = {
  success: (title: string, description?: string, action?: { label: string; onClick: () => void }) => {
    const context = ToastContext as any;
    if (context._currentValue) {
      context._currentValue.addToast({ type: 'success', title, description, action });
    }
  },
  error: (title: string, description?: string) => {
    const context = ToastContext as any;
    if (context._currentValue) {
      context._currentValue.addToast({ type: 'error', title, description });
    }
  },
  warning: (title: string, description?: string) => {
    const context = ToastContext as any;
    if (context._currentValue) {
      context._currentValue.addToast({ type: 'warning', title, description });
    }
  },
  info: (title: string, description?: string, action?: { label: string; onClick: () => void }) => {
    const context = ToastContext as any;
    if (context._currentValue) {
      context._currentValue.addToast({ type: 'info', title, description, action });
    }
  },
};
