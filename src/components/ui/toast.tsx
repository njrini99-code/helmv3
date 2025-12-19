'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconCheck, IconX, IconInfo } from '@/components/icons';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  showToast: (message: string, type: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border animate-slide-up',
              'bg-white/80 backdrop-blur-xl saturate-150',
              toast.type === 'success' && 'border-green-200/50',
              toast.type === 'error' && 'border-red-200/50',
              toast.type === 'info' && 'border-slate-200/50'
            )}
            style={{
              animationDelay: `${index * 50}ms`,
            }}
          >
            {/* Shine effect */}
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />
            <div className="flex-shrink-0">
              {toast.type === 'success' && (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                  <IconCheck size={12} className="text-white" />
                </div>
              )}
              {toast.type === 'error' && (
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
                  <IconX size={12} className="text-white" />
                </div>
              )}
              {toast.type === 'info' && (
                <div className="w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center shadow-sm">
                  <IconInfo size={12} className="text-white" />
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-slate-900">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 flex-shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-all duration-200"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
