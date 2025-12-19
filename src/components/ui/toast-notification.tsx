'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconX, IconInfo, IconWarning } from '@/components/icons';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastNotificationProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const toastIcons = {
  success: IconCheck,
  error: IconX,
  info: IconInfo,
  warning: IconWarning,
};

const toastStyles = {
  success: 'border-green-200/50',
  error: 'border-red-200/50',
  info: 'border-slate-200/50',
  warning: 'border-amber-200/50',
};

const iconStyles = {
  success: 'bg-green-500 text-white shadow-sm',
  error: 'bg-red-500 text-white shadow-sm',
  info: 'bg-slate-500 text-white shadow-sm',
  warning: 'bg-amber-500 text-white shadow-sm',
};

export function ToastNotification({ toast, onClose }: ToastNotificationProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = toastIcons[toast.type];

  useEffect(() => {
    const duration = toast.duration || 5000;
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.duration, toast.id]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 300);
  };

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-xl border shadow-xl min-w-[320px] max-w-md overflow-hidden',
        'bg-white/80 backdrop-blur-xl saturate-150',
        'transition-all duration-300 ease-out',
        toastStyles[toast.type],
        isExiting
          ? 'opacity-0 translate-x-full scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-fade-in'
      )}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      {/* Icon */}
      <div className={cn('flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center', iconStyles[toast.type])}>
        <Icon size={16} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-slate-900">{toast.title}</h4>
        {toast.message && (
          <p className="text-sm text-slate-600 mt-0.5">{toast.message}</p>
        )}
      </div>

      {/* Close Button */}
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-all duration-200"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

// Toast Container Component
interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const positionStyles = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export function ToastContainer({ toasts, onClose, position = 'top-right' }: ToastContainerProps) {
  return (
    <div className={cn('fixed z-50 flex flex-col gap-3', positionStyles[position])}>
      {toasts.map(toast => (
        <ToastNotification key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}
