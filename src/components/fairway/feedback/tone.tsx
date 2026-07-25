/**
 * ============================================================================
 * Fairway · feedback · shared tone vocabulary (LOCAL helper — feedback group)
 * ----------------------------------------------------------------------------
 * One source of truth for the four feedback tones used across InlineNotice,
 * ToastStack and (the danger/empty surfaces of) EmptyState / InsufficientData.
 *
 * Per DESIGN-SYSTEM.md §1 the status palette is GREEN-FORWARD: success === the
 * helm accent, warning is the warm amber, danger is the canonical red, and
 * `info` is rendered with neutral warm chrome (the system has no blue — info is
 * a quiet, text-secondary tone, NOT a SaaS blue). Tones reference ONLY the
 * Fairway semantic tokens (`fw-success` / `fw-warning` / `fw-danger` + warm
 * neutrals) so they render correctly inside a `.fairway-ds` scope and never
 * touch the live app's flat hex status colors.
 *
 * This file is intentionally local to the feedback folder so it cannot collide
 * with any shared helper another agent might create at a higher level.
 * ========================================================================== */

import {
  CheckCircle2,
  Info,
  AlertTriangle,
  AlertOctagon,
  type LucideIcon,
} from 'lucide-react';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToneStyle {
  /** Default lucide icon for the tone (overridable per component). */
  readonly Icon: LucideIcon;
  /** Soft tinted fill for the surface / icon chip. */
  readonly surface: string;
  /** Hairline border that matches the tone (kept warm/low-chroma). */
  readonly border: string;
  /** The tone's emphasis color — used for icon + the left status bar. */
  readonly accent: string;
  /** Foreground for the tone's icon when sitting on its own tinted chip. */
  readonly icon: string;
  /** Background for the left status bar (the §6 "status-colored left bar"). */
  readonly bar: string;
  /** Accessible role hint: assertive tones interrupt, quiet ones are polite. */
  readonly assertive: boolean;
}

/**
 * The tone table. Info is deliberately warm-neutral (no blue in the system);
 * success/warning/danger spend the `fw-*` semantic tokens.
 */
export const TONES: Record<FeedbackTone, ToneStyle> = {
  info: {
    Icon: Info,
    surface: 'bg-surface-sunken',
    border: 'border-border-subtle',
    accent: 'text-text-secondary',
    icon: 'text-text-secondary',
    bar: 'bg-border-strong',
    assertive: false,
  },
  success: {
    Icon: CheckCircle2,
    surface: 'bg-fw-success-bg',
    border: 'border-accent-200',
    accent: 'text-fw-success-ink',
    icon: 'text-fw-success-ink',
    bar: 'bg-accent-500',
    assertive: false,
  },
  warning: {
    Icon: AlertTriangle,
    surface: 'bg-fw-warning-bg',
    border: 'border-fw-warning/30',
    accent: 'text-fw-warning-ink',
    icon: 'text-fw-warning-ink',
    bar: 'bg-fw-warning',
    assertive: true,
  },
  danger: {
    Icon: AlertOctagon,
    surface: 'bg-fw-danger-bg',
    border: 'border-fw-danger/30',
    accent: 'text-fw-danger-ink',
    icon: 'text-fw-danger-ink',
    bar: 'bg-fw-danger',
    assertive: true,
  },
};

/** Resolve a tone's style, defaulting to `info`. */
export function toneStyle(tone: FeedbackTone): ToneStyle {
  return TONES[tone];
}
