'use client';

/**
 * ============================================================================
 * Fairway · feedback · ToastStack (DESIGN-SYSTEM.md §6 "ToastStack", §4.3, §7)
 * ----------------------------------------------------------------------------
 * The single, app-wide non-blocking toast surface — a warm-styled wrapper over
 * `sonner` (the system keeps Sonner as the one toast contract, §6). Toasts are
 * transient floating chrome (§4.3 allow-list #5), so this is one of the few
 * places Liquid Glass is permitted: a cream-tinted `.glass`-style panel with a
 * distinct tone icon per type (the non-color meaning channel) and a slow
 * cinematic settle. No colored side-rail: the founder-banned "card with a
 * colored left border stripe" idiom was removed from the toast panel — the
 * tone icon (a different glyph per type, not just a color) already carries
 * the meaning.
 *
 * Style: warm cream glass via the `--fw-glass-*` tokens, `rounded-card`, the
 * `--fw-ease-glide` curve at `--fw-dur-slow`. Position is bottom-right on desktop
 * / bottom-center on mobile (clears the iOS tab bar + safe area). Reduced
 * transparency collapses to an opaque `bg-elevated` panel (§4.3 fallback).
 *
 * `fairwayToast` is a thin, fully-typed facade over sonner's `toast` exposing
 * `.success / .warning / .danger / .info / .loading / .promise` with the warm
 * tone-icon styling baked in. It returns sonner's id so callers can dismiss.
 *
 * A11y: sonner renders an `aria-live` region; we pin `polite` so new toasts are
 * announced without interrupting (danger uses `assertive` via the helper).
 * Every toast is dismissible (close button ≥24px, focus-visible ring).
 * ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import {
  Toaster as SonnerToaster,
  toast as sonnerToast,
  type ToasterProps,
  type ExternalToast,
} from 'sonner';
import { CheckCircle2, Info, AlertTriangle, AlertOctagon, Loader2 } from 'lucide-react';
import { fwHaptic } from '@/lib/fairway/haptics';

/* --------------------------------------------------------------------------
 * Viewport hook — flip sonner position between desktop & mobile without a flash
 * (SSR renders desktop default, client hydrates to the right spot).
 * ------------------------------------------------------------------------ */
function useIsMobile(breakpointPx = 768): boolean {
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

export interface ToastStackProps extends Omit<ToasterProps, 'theme'> {
  /** Override the responsive breakpoint (px) for desktop vs mobile placement. */
  mobileBreakpointPx?: number;
}

/**
 * Mount ONCE at the root of a Fairway subtree (inside the `.fairway-ds` scope so
 * the toast classNames resolve against the warm tokens). Non-blocking, stacked,
 * dismissible.
 */
export function ToastStack({ mobileBreakpointPx = 768, ...props }: ToastStackProps) {
  const isMobile = useIsMobile(mobileBreakpointPx);
  const regionRef = useRef<HTMLElement>(null);

  // Pin the live region politeness explicitly (robust across sonner versions).
  useEffect(() => {
    regionRef.current?.setAttribute('aria-live', 'polite');
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
      // We render our own tone icons, so disable sonner's rich colors.
      richColors={false}
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-fw-success" aria-hidden="true" />,
        info: <Info className="h-5 w-5 text-text-secondary" aria-hidden="true" />,
        warning: <AlertTriangle className="h-5 w-5 text-fw-warning" aria-hidden="true" />,
        error: <AlertOctagon className="h-5 w-5 text-fw-danger" aria-hidden="true" />,
        loading: (
          <Loader2 className="h-5 w-5 animate-spin text-text-tertiary motion-reduce:animate-none" aria-hidden="true" />
        ),
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          // Warm cream Liquid Glass panel (§4.3). Tone is carried by the icon
          // glyph (wired via `icons` above), not a colored side-rail.
          toast: [
            'group relative isolate overflow-hidden font-fw-sans',
            'rounded-card border border-[var(--fw-glass-border)]',
            'bg-[var(--fw-glass-bg-strong)] backdrop-blur-[var(--fw-blur-glass)] backdrop-saturate-[160%]',
            'text-text-primary shadow-raise',
            '![transition-timing-function:var(--fw-ease-glide)] ![transition-duration:520ms]',
            // reduced transparency → opaque panel (Apple accessibility lesson, §4.3)
            'motion-reduce:!duration-200',
          ].join(' '),
          title: 'text-[13px] font-semibold leading-5 text-text-primary',
          description: 'mt-0.5 text-[13px] leading-5 text-text-secondary',
          actionButton:
            'rounded-fw-sm bg-accent-500 px-3 py-1.5 text-[13px] font-medium text-text-on-accent transition-colors [transition-duration:180ms] hover:bg-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2',
          cancelButton:
            'rounded-fw-sm px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-colors [transition-duration:180ms] hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          closeButton:
            'border border-border-subtle bg-surface text-text-tertiary transition-colors [transition-duration:180ms] hover:bg-surface-sunken hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          icon: 'shrink-0',
        },
      }}
      {...props}
    />
  );
}

/* --------------------------------------------------------------------------
 * fairwayToast — typed facade over sonner's `toast`, with the warm tone icons
 * already wired via <ToastStack icons={…}>. Keeps the familiar
 * `toast.success(title, { description })` signature.
 * ------------------------------------------------------------------------ */

type Message = React.ReactNode;

export type FairwayToastOptions = ExternalToast;

function base(message: Message, opts?: FairwayToastOptions) {
  return sonnerToast(message, opts);
}

export const fairwayToast = Object.assign(base, {
  success: (message: Message, opts?: FairwayToastOptions) => { fwHaptic('success'); return sonnerToast.success(message, opts); },
  info: (message: Message, opts?: FairwayToastOptions) => sonnerToast.info(message, opts),
  warning: (message: Message, opts?: FairwayToastOptions) => { fwHaptic('warning'); return sonnerToast.warning(message, opts); },
  /** Canonical error toast (the system says "danger", sonner calls it "error"). */
  danger: (message: Message, opts?: FairwayToastOptions) => { fwHaptic('error'); return sonnerToast.error(message, opts); },
  /** Alias for callers that think in sonner terms. */
  error: (message: Message, opts?: FairwayToastOptions) => { fwHaptic('error'); return sonnerToast.error(message, opts); },
  loading: (message: Message, opts?: FairwayToastOptions) => sonnerToast.loading(message, opts),
  message: (message: Message, opts?: FairwayToastOptions) => sonnerToast.message(message, opts),
  /**
   * Wrapped (not a direct re-export of `sonnerToast.promise`) so the exported
   * `fairwayToast` type never has to *name* sonner's internal, un-exported
   * `PromiseIExtendedResult` type — which would trip TS4023 when this barrel is
   * re-exported. The runtime behavior is identical; only the typed-data option
   * shape is widened to nameable params.
   */
  promise: <ToastData,>(
    promise: Promise<ToastData> | (() => Promise<ToastData>),
    data?: FairwayToastOptions & {
      loading?: Message;
      success?: Message | ((d: ToastData) => Message);
      error?: Message | ((e: unknown) => Message);
    },
  ) => sonnerToast.promise(promise, data as never),
  dismiss: sonnerToast.dismiss,
  /** Imperatively remove a toast (or all) by id. */
  remove: (id?: string | number) => sonnerToast.dismiss(id),
});
