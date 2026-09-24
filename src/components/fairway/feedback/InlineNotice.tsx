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
 * optional action slot · optional dismiss. The tone icon (a distinct glyph per
 * tone, not just a color) is the non-color meaning channel partner to the tint
 * + text — color is never the only signal, §7.4. No colored side-rail: the
 * founder-banned "card with a colored left border stripe" idiom was removed
 * from this primitive (it rendered on every InlineNotice call site — most
 * visibly the Tasks page overdue banner). Surface is a soft tinted matte fill
 * with a single hairline border (never border + shadow at rest, §4.1).
 *
 * A11y: assertive tones (warning/danger) render `role="alert"` (interrupts).
 * A quiet tone (info/success) is a live region only when `live` is set — for a
 * notice whose content changes after mount (a save result, a sync state). A
 * static explainer is plain content: a screen reader reads it in place instead
 * of hearing it announced out of context (A11Y-03).
 * Dismiss is a real ≥24px button with hover + focus-visible + active states.
 * Motion: gentle reveal honoring `prefers-reduced-motion` (motion.ts).
 * ========================================================================== */

import { forwardRef, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneStyle, type FeedbackTone } from './tone';
import { revealVariants } from './motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

export interface InlineNoticeProps {
  /** Semantic tone — drives icon, tint, left bar, and ARIA role. */
  tone?: FeedbackTone;
  /**
   * Announce a quiet (info/success) notice politely as it changes. Set it when
   * the notice reports something that just happened; leave it off for static
   * copy. Defaults to on for `success`, off for `info`. Assertive tones are
   * always announced.
   */
  live?: boolean;
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
      live,
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
    const reduced = useReducedMotionGuard() ?? false;
    const variants = revealVariants(reduced);
    const t = toneStyle(tone);
    // A success notice nearly always reports an action that just finished, so
    // it stays a live region unless told otherwise; info is static by default.
    const isLive = live ?? tone === 'success';
    const Icon = icon === null ? null : (icon ?? t.Icon);
    const titleId = useId();
    const bodyId = useId();

    return (
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            ref={ref}
            // assertive tones interrupt; quiet tones are polite (§7.4)
            role={t.assertive ? 'alert' : isLive ? 'status' : undefined}
            aria-live={t.assertive ? 'assertive' : isLive ? 'polite' : undefined}
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={children ? bodyId : undefined}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'relative isolate flex gap-3 overflow-hidden rounded-card border p-4 font-fw-sans',
              t.surface,
              t.border,
              className,
            )}
          >
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
                  'text-text-tertiary transition-colors [transition-duration:180ms]',
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
