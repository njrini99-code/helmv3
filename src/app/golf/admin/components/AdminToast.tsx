'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, X, Info, AlertTriangle, Activity } from 'lucide-react';

// ============================================
// TYPES
// ============================================

export type AdminToastVariant = 'success' | 'warning' | 'error' | 'info' | 'critical';

export interface AdminToast {
  id: string;
  variant: AdminToastVariant;
  title: string;
  message?: string;
  /** Auto-dismiss after this many ms (null = never) */
  duration?: number | null;
  /** Toast timestamp */
  timestamp: Date;
  /** Optional click handler */
  onClick?: () => void;
  /** Whether this is a critical alert that should play sound */
  playSound?: boolean;
  /** Optional metadata for the toast */
  metadata?: Record<string, unknown>;
}

export interface AdminToastContextValue {
  toasts: AdminToast[];
  addToast: (toast: Omit<AdminToast, 'id' | 'timestamp'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
  success: (title: string, message?: string, options?: Partial<AdminToast>) => string;
  warning: (title: string, message?: string, options?: Partial<AdminToast>) => string;
  error: (title: string, message?: string, options?: Partial<AdminToast>) => string;
  info: (title: string, message?: string, options?: Partial<AdminToast>) => string;
  critical: (title: string, message?: string, options?: Partial<AdminToast>) => string;
}

// ============================================
// CONTEXT
// ============================================

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

let toastCounter = 0;

// ============================================
// PROVIDER
// ============================================

interface AdminToastProviderProps {
  children: React.ReactNode;
  /** Maximum number of toasts to show at once */
  maxToasts?: number;
  /** Position of the toast container */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Enable sound for critical alerts */
  soundEnabled?: boolean;
}

export function AdminToastProvider({
  children,
  maxToasts = 5,
  position = 'top-right',
  soundEnabled = true,
}: AdminToastProviderProps) {
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio for critical alerts
  useEffect(() => {
    if (soundEnabled && typeof window !== 'undefined') {
      // Use a simple beep sound (can be replaced with a custom sound file)
      audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH6MloWBfX1/gYaLkJmgnZqVkI6MiomIiIiJi4yOkJKUlZaXl5iYmJiXlpWUk5GQjo2LioiHhoWEg4KBgH9+fXx7enl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4/QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/');
    }
    return () => {
      audioRef.current = null;
    };
  }, [soundEnabled]);

  const playAlertSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, [soundEnabled]);

  const addToast = useCallback((toast: Omit<AdminToast, 'id' | 'timestamp'>): string => {
    const id = `admin-toast-${++toastCounter}`;
    const newToast: AdminToast = {
      ...toast,
      id,
      timestamp: new Date(),
      duration: toast.duration ?? 5000,
    };

    // Play sound for critical alerts
    if ((toast.variant === 'critical' || toast.playSound) && soundEnabled) {
      playAlertSound();
    }

    setToasts(prev => {
      const updated = [newToast, ...prev];
      // Limit number of toasts
      return updated.slice(0, maxToasts);
    });

    return id;
  }, [maxToasts, soundEnabled, playAlertSound]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = useCallback((title: string, message?: string, options?: Partial<AdminToast>) => {
    return addToast({ variant: 'success', title, message, ...options });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string, options?: Partial<AdminToast>) => {
    return addToast({ variant: 'warning', title, message, ...options });
  }, [addToast]);

  const error = useCallback((title: string, message?: string, options?: Partial<AdminToast>) => {
    return addToast({ variant: 'error', title, message, ...options });
  }, [addToast]);

  const info = useCallback((title: string, message?: string, options?: Partial<AdminToast>) => {
    return addToast({ variant: 'info', title, message, ...options });
  }, [addToast]);

  const critical = useCallback((title: string, message?: string, options?: Partial<AdminToast>) => {
    return addToast({ variant: 'critical', title, message, playSound: true, ...options });
  }, [addToast]);

  const value: AdminToastContextValue = {
    toasts,
    addToast,
    removeToast,
    clearAll,
    success,
    warning,
    error,
    info,
    critical,
  };

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <AdminToastContainer toasts={toasts} onClose={removeToast} position={position} />
    </AdminToastContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useAdminToast(): AdminToastContextValue {
  const context = useContext(AdminToastContext);
  if (!context) {
    throw new Error('useAdminToast must be used within an AdminToastProvider');
  }
  return context;
}

// ============================================
// TOAST COMPONENT
// ============================================

const variantConfig: Record<AdminToastVariant, {
  icon: typeof Check;
  iconClass: string;
  borderClass: string;
  bgClass: string;
}> = {
  success: {
    icon: Check,
    iconClass: 'bg-primary-500 text-white',
    borderClass: 'border-primary-200/50',
    bgClass: 'bg-primary-50/50',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'bg-amber-500 text-white',
    borderClass: 'border-amber-200/50',
    bgClass: 'bg-amber-50/50',
  },
  error: {
    icon: X,
    iconClass: 'bg-red-500 text-white',
    borderClass: 'border-red-200/50',
    bgClass: 'bg-red-50/50',
  },
  info: {
    icon: Info,
    iconClass: 'bg-blue-500 text-white',
    borderClass: 'border-blue-200/50',
    bgClass: 'bg-blue-50/50',
  },
  critical: {
    icon: Activity,
    iconClass: 'bg-red-600 text-white animate-pulse',
    borderClass: 'border-red-300/50',
    bgClass: 'bg-red-100/50',
  },
};

interface AdminToastItemProps {
  toast: AdminToast;
  onClose: (id: string) => void;
}

function AdminToastItem({ toast, onClose }: AdminToastItemProps) {
  const config = variantConfig[toast.variant];
  const Icon = config.icon;

  const handleClose = useCallback(() => {
    // Framer Motion handles exit animation via AnimatePresence
    onClose(toast.id);
  }, [onClose, toast.id]);

  // Auto-dismiss
  useEffect(() => {
    if (toast.duration === null) return;
    
    const duration = toast.duration ?? 5000;
    const timer = setTimeout(handleClose, duration);
    return () => clearTimeout(timer);
  }, [toast.duration, handleClose]);

  // Format timestamp
  const timeAgo = getTimeAgo(toast.timestamp);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-xl border shadow-xl min-w-[340px] max-w-md overflow-hidden',
        'bg-white/90 backdrop-blur-xl',
        config.borderClass,
        toast.onClick && 'cursor-pointer hover:bg-white/95 transition-colors',
        toast.variant === 'critical' && 'ring-2 ring-red-500/20'
      )}
      onClick={toast.onClick}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Icon */}
      <div className={cn('flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-sm', config.iconClass)}>
        <Icon size={18} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-sm text-warm-900 leading-tight">{toast.title}</h4>
          <span className="text-micro text-warm-400 whitespace-nowrap tabular-nums">{timeAgo}</span>
        </div>
        {toast.message && (
          <p className="text-sm leading-relaxed text-warm-600 mt-1 line-clamp-2">{toast.message}</p>
        )}
        {toast.onClick && (
          <p className="text-xs text-primary-500 mt-1 font-medium">Click to view details →</p>
        )}
      </div>

      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="flex-shrink-0 p-1.5 rounded-md text-warm-400 hover:text-warm-600 hover:bg-warm-100/50 active:bg-warm-200 transition-all duration-200"
      >
        <X size={14} />
      </button>

      {/* Progress bar for auto-dismiss */}
      {toast.duration !== null && (
        <motion.div
          className={cn('absolute bottom-0 left-0 h-0.5', config.bgClass.replace('/50', ''))}
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: (toast.duration ?? 5000) / 1000, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

// ============================================
// CONTAINER
// ============================================

const positionStyles = {
  'top-right': 'top-20 right-4',
  'top-left': 'top-20 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
};

interface AdminToastContainerProps {
  toasts: AdminToast[];
  onClose: (id: string) => void;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

function AdminToastContainer({ toasts, onClose, position }: AdminToastContainerProps) {
  return (
    <div className={cn('fixed z-50 flex flex-col gap-3 pointer-events-none', positionStyles[position])}>
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <AdminToastItem toast={toast} onClose={onClose} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================
// EXPORTS
// ============================================

export { AdminToastContainer };
