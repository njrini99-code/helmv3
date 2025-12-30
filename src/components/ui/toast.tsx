'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { create } from 'zustand';

// Types
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

// Store
interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  // Backward compatibility
  showToast: (message: string, type: Toast['type']) => void;
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2);
    const duration = toast.duration ?? 5000;

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  // Backward compatibility method
  showToast: (message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).slice(2);
    const duration = 5000;

    set((state) => ({
      toasts: [...state.toasts, { id, type, title: message, duration }],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
}));

// Icons
const icons = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

// Toast Item
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-lg shadow-lg',
        'bg-white border border-slate-200',
        'max-w-sm w-full overflow-hidden'
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900">{toast.title}</p>
        {toast.description && (
          <p className="text-sm text-slate-600 mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

// Toast Container
export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Helper functions
export const toast = {
  success: (title: string, description?: string) =>
    useToast.getState().addToast({ type: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToast.getState().addToast({ type: 'error', title, description }),
  warning: (title: string, description?: string) =>
    useToast.getState().addToast({ type: 'warning', title, description }),
  info: (title: string, description?: string) =>
    useToast.getState().addToast({ type: 'info', title, description }),
};

// Backward compatibility: ToastProvider (no-op wrapper)
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
