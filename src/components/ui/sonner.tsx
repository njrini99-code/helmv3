'use client';

/**
 * Unified toast surface for Helm Sports Labs.
 *
 * Wraps `sonner` so the entire app can keep the same `toast.success(title, description?)`
 * call signature we used with our hand-rolled provider, while picking up sonner's
 * dismiss/stack/queue mechanics, accessibility, and `loading` / `promise` helpers.
 *
 * Style direction: California-modern matte — `surface-stone` panel, `rounded-2xl`,
 * cubic-bezier(0.16, 1, 0.3, 1) easing at 400ms. Position is bottom-right on
 * desktop and bottom-center on mobile to clear the iOS tab bar + safe area.
 *
 * Capacitor haptics fire on success / error / warning before delegating to sonner.
 */

import { useEffect, useRef, useState } from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast, type ToasterProps } from 'sonner';
import { triggerHaptic } from '@/lib/utils/capacitor';

// ---------------------------------------------------------------------------
// Toaster — mounted once at app root
// ---------------------------------------------------------------------------

/**
 * Track viewport so we can flip sonner's position between desktop (bottom-right)
 * and mobile (bottom-center). `useState`-based so SSR renders the desktop default
 * and the client hydrates to the right position without a flash.
 */
function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpointPx]);

  return isMobile;
}

export function Toaster(props: ToasterProps) {
  const isMobile = useIsMobile();
  // Sonner renders its toast list inside a <section> live region. We hold a ref
  // to that node and pin `aria-live="polite"` on it so screen readers announce
  // new toasts without interrupting (and so the contract is explicit + robust
  // against any sonner version that might drop the default).
  const regionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const region = regionRef.current;
    if (region) region.setAttribute('aria-live', 'polite');
  }, []);

  return (
    <SonnerToaster
      ref={regionRef}
      position={isMobile ? 'bottom-center' : 'bottom-right'}
      duration={5000}
      gap={12}
      offset={isMobile ? 'calc(env(safe-area-inset-bottom) + 5rem)' : '1.5rem'}
      visibleToasts={4}
      closeButton
      richColors={false}
      toastOptions={{
        unstyled: false,
        // California-modern matte: surface-stone panel, rounded-2xl, cinematic easing.
        classNames: {
          toast:
            'surface-stone rounded-2xl !p-4 text-warm-900 ' +
            '![transition-timing-function:cubic-bezier(0.16,1,0.3,1)] !duration-[400ms]',
          title: 'font-semibold text-sm',
          description: 'text-sm text-warm-500 mt-0.5',
          actionButton:
            'text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors',
          cancelButton:
            'text-sm font-medium text-warm-500 hover:text-warm-700 transition-colors',
          closeButton:
            'text-warm-400 hover:text-warm-600 hover:bg-warm-100 rounded-md transition-colors',
          success: '[&_[data-icon]]:text-primary-600',
          error: '[&_[data-icon]]:text-red-600',
          warning: '[&_[data-icon]]:text-amber-600',
          info: '[&_[data-icon]]:text-blue-600',
        },
      }}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// `toast` re-export — mirrors the hand-rolled API
// ---------------------------------------------------------------------------

/**
 * Sonner accepts either a string or an options object as the second argument.
 * Our legacy API was `toast.success(title, description?)`, where `description`
 * was always a plain string. We normalize that to sonner's `{description}` form
 * so call sites don't have to change.
 */
type LegacyData = string | { description?: string; duration?: number; action?: { label: string; onClick: () => void } };

function normalizeLegacy(data?: LegacyData) {
  if (data === undefined) return undefined;
  if (typeof data === 'string') return { description: data };
  return data;
}

type SonnerData = Parameters<typeof sonnerToast.success>[1];

function fireHaptic(kind: 'success' | 'warning' | 'error') {
  // Fire-and-forget; no-ops on web.
  void triggerHaptic(kind);
}

/**
 * Drop-in replacement for the hand-rolled `@/components/ui/toast` API.
 *
 * Supports both the legacy 2-arg shape `toast.success('Saved', 'All good')`
 * and sonner's native shape `toast.success('Saved', { description, duration, action })`.
 */
export const toast = Object.assign(
  // Bare-string call — `toast('Hello')` — defers to sonner's own dispatch.
  (message: string | React.ReactNode, data?: SonnerData) => sonnerToast(message, data),
  {
    success: (title: string, data?: LegacyData) => {
      fireHaptic('success');
      return sonnerToast.success(title, normalizeLegacy(data));
    },
    error: (title: string, data?: LegacyData) => {
      fireHaptic('error');
      return sonnerToast.error(title, normalizeLegacy(data));
    },
    warning: (title: string, data?: LegacyData) => {
      fireHaptic('warning');
      return sonnerToast.warning(title, normalizeLegacy(data));
    },
    info: (title: string, data?: LegacyData) => sonnerToast.info(title, normalizeLegacy(data)),
    message: (title: string, data?: LegacyData) => sonnerToast.message(title, normalizeLegacy(data)),
    loading: (title: string, data?: LegacyData) => sonnerToast.loading(title, normalizeLegacy(data)),
    promise: <T,>(
      promise: Promise<T> | (() => Promise<T>),
      data?: Parameters<typeof sonnerToast.promise<T>>[1],
    ) => sonnerToast.promise(promise, data),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
    custom: (jsx: Parameters<typeof sonnerToast.custom>[0], data?: Parameters<typeof sonnerToast.custom>[1]) =>
      sonnerToast.custom(jsx, data),
  }
);

// ---------------------------------------------------------------------------
// useToast — legacy compat hook
// ---------------------------------------------------------------------------

/**
 * Legacy `useToast()` hook from the hand-rolled provider. The original API
 * exposed `showToast(message, type)` and `addToast({ type, title, description, action, duration })`.
 * We keep both shapes alive so call sites don't all have to migrate at once.
 *
 * Sonner is global, so this hook returns stable references that delegate to
 * the same dispatcher used by `toast.*`. No actual context lookup needed.
 */
type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToastInput = {
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

function dispatchByType(
  type: ToastType,
  title: string,
  data?: { description?: string; duration?: number; action?: { label: string; onClick: () => void } },
) {
  switch (type) {
    case 'success':
      return toast.success(title, data);
    case 'error':
      return toast.error(title, data);
    case 'warning':
      return toast.warning(title, data);
    case 'info':
      return toast.info(title, data);
  }
}

export function useToast() {
  return {
    /** `showToast('Saved', 'success')` — legacy 2-arg API. */
    showToast: (message: string, type: ToastType) => dispatchByType(type, message),
    /** `addToast({ type, title, description, action, duration })` — legacy options API. */
    addToast: ({ type, title, description, duration, action }: AddToastInput) =>
      dispatchByType(type, title, { description, duration, action }),
    /** Sonner is keyed on toast IDs; pass it through for legacy `removeToast(id)` callers. */
    removeToast: (id: string | number) => sonnerToast.dismiss(id),
  };
}

export type { ToasterProps } from 'sonner';
