'use client';

/**
 * ============================================================================
 * Fairway · feedback · InlineNotice (DESIGN-SYSTEM.md §6 "InlineNotice", §1, §7)
 * ----------------------------------------------------------------------------
 * In-flow, non-floating alert banner — info / success / warning / danger. This
 * is the matte, opaque counterpart to the floating ToastStack: it lives INSIDE
 * the content column (form-level errors, page-level notices, "heads up" rows).
 *
 * Anatomy (§6): tone icon chip · title (label weight) · message (body) ·
 * optional action slot · optional dismiss. A tone-colored left status bar gives
 * the meaning a non-color channel partner (icon + bar + text — color is never
 * the only signal, §7.4). Surface is a soft tinted matte fill with a single
 * hairline border (never border + shadow at rest, §4.1).
 *
 * A11y: assertive tones (warning/danger) render `role="alert"` (interrupts);
 * quiet tones (info/success) render `role="status"` + `aria-live="polite"`.
 * Dismiss is a real ≥24px button with hover + focus-visible + active states.
 * Motion: gentle reveal honoring `prefers-reduced-motion` (motion.ts).
 * ========================================================================== */

import { forwardRef, useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneStyle, type FeedbackTone } from './tone';
import { revealVariants } from './motion';

export interface InlineNoticeProps {
  /** Semantic tone — drives icon, tint, left bar, and ARIA role. */
  tone?: FeedbackTone;
  /** Short bold headline (label voice). Optional — message can stand alone. */
  title?: React.ReactNode;
  /** The body message. */
  children?: React.ReactNode;
  /** Override the tone's default lucide icon. Pass `null` to hide the icon. */
  icon?: LucideIcon | null;
  /** Action cluster (buttons / links), right-aligned under the message. */
  action?: React.ReactNode;
  /** Show a dismiss (×) button. Fires `onDismiss`. */
  dismissible?: boolean;
  /** Called when the dismiss button is pressed (consumer owns visibility). */
  onDismiss?: () => void;
  /** Controlled visibility — when `false`, animates out then unmounts. */
  open?: boolean;
  className?: string;
}

export const InlineNotice = forwardRef<HTMLDivElement, InlineNoticeProps>(
  function InlineNotice(
    {
      tone = 'info',
      title,
      children,
      icon,
      action,
      dismissible = false,
      onDismiss,
      open = true,
      className,
    },
    ref,
  ) {
    const reduced = useReducedMotion() ?? false;
    const variants = revealVariants(reduced);
    const t = toneStyle(tone);
    const Icon = icon === null ? null : (icon ?? t.Icon);
    const titleId = useId();
    const bodyId = useId();

    return (
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            ref={ref}
            // assertive tones interrupt; quiet tones are polite (§7.4)
            role={t.assertive ? 'alert' : 'status'}
            aria-live={t.assertive ? 'assertive' : 'polite'}
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={children ? bodyId : undefined}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'relative isolate flex gap-3 overflow-hidden rounded-card border p-4 font-fw-sans',
              'pl-5', // room for the status bar
              t.surface,
              t.border,
              className,
            )}
          >
            {/* tone-colored left status bar — the non-color meaning channel */}
            <span
              aria-hidden="true"
              className={cn('absolute inset-y-0 left-0 w-1', t.bar)}
            />

            {Icon && (
              <Icon
                aria-hidden="true"
                className={cn('mt-0.5 h-5 w-5 shrink-0', t.icon)}
              />
            )}

            <div className="min-w-0 flex-1">
              {title && (
                <p
                  id={titleId}
                  className="text-body-sm font-semibold leading-5 text-text-primary"
                >
                  {title}
                </p>
              )}
              {children && (
                <div
                  id={bodyId}
                  className={cn(
                    'text-body leading-6 text-text-secondary',
                    title && 'mt-0.5',
                  )}
                >
                  {children}
                </div>
              )}
              {action && <div className="mt-3 flex flex-wrap items-center gap-3">{action}</div>}
            </div>

            {dismissible && (
              // Intentional raw <button>: a self-contained Fairway DS primitive must
              // not depend on the legacy @/components/ui/button (it carries non-Fairway
              // styling). The full interactive-state contract (§7.1) is implemented inline.
              // eslint-disable-next-line helm/no-raw-button
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className={cn(
                  'group -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-fw-sm',
                  'text-text-tertiary transition-colors duration-[180ms]',
                  'hover:bg-surface hover:text-text-secondary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  'active:translate-y-[0.5px]',
                )}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);
