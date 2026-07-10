/**
 * InkNotice — the compact inline notice atom for baseball entry surfaces
 * (spec §7 empty-state doctrine: no red/amber boxes anywhere on baseball
 * surfaces; see also `<InkBadge>` — "urgency is a color, not a toast").
 *
 * Replaces the raw `border-red-200 bg-red-50 text-red-700` (and its
 * `border-red-200/70 bg-red-50/60` sibling) strip that had spread — several
 * of them byte-for-byte identical — across every baseball sign-in/sign-up,
 * complete-signup/forgot/reset-password, and coach/player onboarding
 * surface. One `<InkNotice>` instead: a quiet Paper strip (never a stock
 * colored fill) with a lane-ink left rule + icon carrying the "needs
 * attention" signal (meaning is never color alone) and graphite text
 * carrying the message. `role="alert"` by default so it's announced the
 * instant it mounts, matching (and in a few call sites, upgrading) every
 * raw box this replaces.
 *
 * Deliberately lighter than `<EditorsLetter>` — that's the composed,
 * page-level empty/error letter (a full `PaperCard` with headline + reading-
 * voice body); this is the compact strip that sits directly above a form's
 * submit button. Defaults to the `pursuit` (clay) lane since every current
 * use is a form/account error; pass `ink="team"` for a green-lane notice.
 * No hooks — safe in a server component.
 *
 * The `pursuit` (error) lane reads `--notice-error-ink`, NOT `--pursuit-ink`
 * directly (src/styles/baseball-living-annual.css) — three "SAGE & CREAM"
 * entry scopes this component mounts inside (src/styles/baseball-auth.css's
 * `.baseball-auth-panel`, and the onboarding-entry.css files under both
 * baseball/(onboarding)/coach-onboarding and .../player, each scoping
 * `.entry-onboarding-scope`) redefine --pursuit-ink AND --grade-plus
 * to the identical `--fl-sage-deep`, so an error reading --pursuit-ink would
 * render in the same sage as any success indicator on those same surfaces
 * (e.g. forgot-password's `text-grade-plus` CheckCircle2) — indistinguishable.
 * --notice-error-ink is deliberately independent of --pursuit-ink so none of
 * those three scopes' overrides touch it; the error strip stays clay/oxide
 * (never sage, never raw red) everywhere. The `team` lane is unaffected by
 * this and still reads `--grade-plus` directly — success IS meant to sage-ify
 * under those scopes, only the error/success collision is the bug.
 */
import type { ReactNode } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InkNoticeProps {
  /** The message body — callers keep their own exact copy. */
  children: ReactNode;
  /** Ink lane for the left rule + icon: `pursuit` clay (default) or `team` green. */
  ink?: 'team' | 'pursuit';
  /** Override the default AlertCircle icon. Pass `null` to hide it. */
  icon?: LucideIcon | null;
  /** ARIA role — `alert` (default) interrupts for errors; pass `status` for a polite notice. */
  role?: 'alert' | 'status';
  className?: string;
}

const INK: Record<NonNullable<InkNoticeProps['ink']>, { text: string; bar: string }> = {
  // Reads the dedicated --notice-error-ink var (see file header) instead of
  // the shared `text-pursuit`/`bg-pursuit` utilities — those resolve to
  // --pursuit-ink, which the SAGE & CREAM entry scopes collapse onto the
  // same value as --grade-plus. Arbitrary-value classes, not a new Tailwind
  // color, matching this file's existing `bg-[var(--paper)]` pattern below.
  pursuit: { text: 'text-[color:var(--notice-error-ink)]', bar: 'bg-[var(--notice-error-ink)]' },
  team: { text: 'text-grade-plus', bar: 'bg-grade-plus' },
};

export function InkNotice({ children, ink = 'pursuit', icon, role = 'alert', className }: InkNoticeProps) {
  const tone = INK[ink];
  const Icon = icon === null ? null : (icon ?? AlertCircle);

  return (
    <div
      role={role}
      className={cn(
        'relative flex items-start gap-2.5 overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)]',
        'py-3 pl-5 pr-4 text-sm text-text-primary animate-fade-in',
        className,
      )}
    >
      {/* Lane-ink left rule — the non-color meaning channel (mirrors InlineNotice's status bar). */}
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} />

      {Icon ? <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', tone.text)} aria-hidden /> : null}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
