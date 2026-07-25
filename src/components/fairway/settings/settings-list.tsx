'use client';

/**
 * ============================================================================
 * Fairway · Settings list — SettingsGroup / SettingsRow / SettingsStack
 * ----------------------------------------------------------------------------
 * The settings surfaces were built as a stack of full-bleed `Surface` cards,
 * each with its own `text-h2` heading, `padding="lg"` and generous internal
 * `space-y-*`. On a phone that produced roughly one decision per screen — the
 * Fine-tune Thresholds card alone ran past three viewport heights for three
 * numbers — which reads as a form, not as a settings app, and trips the
 * standing "no full-screen monolith cards on mobile" rule.
 *
 * This is the denser vocabulary every modern settings surface uses:
 *
 *   SettingsStack   → the page's vertical rhythm between groups
 *   SettingsGroup   → a quiet eyebrow ABOVE a single hairline-divided card
 *   SettingsRow     → one decision: label (+ hint) left, control right
 *
 * The heading moves OUT of the card and drops from `h2`-scale display type to a
 * tracked eyebrow, so the card contains only decisions. Rows are divided by
 * hairlines that inset past the label column — the standard list idiom — rather
 * than by full-width `<div className="h-px">` rules between fat blocks.
 *
 * Rows are ≥52px so their controls clear the touch floor without extra padding.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces';

/* ────────────────────────────────────────────────────────────────────────── */

export interface SettingsStackProps {
  children: React.ReactNode;
  className?: string;
}

/** Vertical rhythm between setting groups. */
export function SettingsStack({ children, className }: SettingsStackProps) {
  return (
    <div data-slot="fw-settings-stack" className={cn('flex flex-col gap-7', className)}>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export interface SettingsGroupProps {
  /** Quiet uppercase eyebrow rendered ABOVE the card. */
  title: string;
  /** One line of supporting copy under the eyebrow. */
  description?: React.ReactNode;
  /** Right-aligned slot beside the title (e.g. an auto-save indicator). */
  action?: React.ReactNode;
  /** Note under the card — consequences, permissions, "only the head coach…". */
  footnote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A titled group of rows. The card holds ONLY rows; the title sits outside it,
 * so scanning the page is reading a column of eyebrows rather than parsing a
 * stack of same-weight `h2`s.
 */
export function SettingsGroup({
  title,
  description,
  action,
  footnote,
  children,
  className,
}: SettingsGroupProps) {
  return (
    <section data-slot="fw-settings-group" className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 font-fw-sans text-caption text-text-secondary">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {/* divide-y, not hand-placed rules: a row can be added or conditionally
          hidden without leaving a stranded separator behind it. */}
      <Surface elevation="border" padding="none" className="overflow-hidden">
        <div className="divide-y divide-border-subtle">{children}</div>
      </Surface>

      {footnote ? (
        <p className="px-1 font-fw-sans text-caption text-text-tertiary">{footnote}</p>
      ) : null}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export interface SettingsRowProps {
  /** The decision's name. */
  label: React.ReactNode;
  /** Why it matters / what it changes. */
  description?: React.ReactNode;
  /** The control (Switch, Segmented, value + chevron…). */
  control?: React.ReactNode;
  /**
   * Put the control on its own line below the label instead of beside it.
   * Sliders and segmented controls need the full width; switches do not.
   */
  stacked?: boolean;
  /** `htmlFor` target so clicking the label focuses the control. */
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * One setting. `stacked` is the important switch: an inline control sits to the
 * right of the label (switches, short values), while a full-width control
 * (slider, segmented) drops to its own line so it never competes with the label
 * for horizontal space at 320px.
 */
export function SettingsRow({
  label,
  description,
  control,
  stacked = false,
  htmlFor,
  className,
  children,
}: SettingsRowProps) {
  const Label = htmlFor ? 'label' : 'span';
  const head = (
    <div className="min-w-0 flex-1">
      <Label
        {...(htmlFor ? { htmlFor } : {})}
        className={cn(
          'block font-fw-sans text-body-sm font-medium text-text-primary',
          htmlFor && 'cursor-pointer',
        )}
      >
        {label}
      </Label>
      {description ? (
        <p className="mt-0.5 font-fw-sans text-caption leading-relaxed text-text-secondary">
          {description}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      data-slot="fw-settings-row"
      className={cn('flex min-h-[52px] flex-col justify-center gap-3 px-4 py-3.5', className)}
    >
      {stacked ? (
        <>
          {head}
          {control ?? children}
        </>
      ) : (
        <div className="flex items-center justify-between gap-4">
          {head}
          {control ? <div className="shrink-0">{control}</div> : null}
        </div>
      )}
      {stacked ? null : children}
    </div>
  );
}
