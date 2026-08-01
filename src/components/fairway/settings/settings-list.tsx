'use client';

/**
 * ============================================================================
 * Fairway · Settings kit
 * ----------------------------------------------------------------------------
 * The shared vocabulary for every GolfHelm settings surface.
 *
 * WHY THIS EXISTS. Settings was one 2,332-line page: 39 panels stacked with no
 * navigation, and every panel hand-rolling its own row markup. Even inside a
 * single card there were two different row idioms — a filled
 * `bg-surface-sunken` box for one toggle, then a `divide-y` list for the ones
 * under it. Nothing was shared, so nothing was consistent, and the result read
 * as a long form rather than as a settings area.
 *
 * THE SHAPE (chosen 2026-07-25):
 *   - An INDEX of grouped drill-in rows, each opening a focused sub-page —
 *     the pattern Stripe/Linear/GitHub use. A phone never scrolls a wall.
 *   - VALUE-FORWARD rows: the current value sits right-aligned, so the right
 *     edge of the list is a readable column of your actual configuration and
 *     you can audit it without opening anything.
 *
 * THE PIECES:
 *   SettingsStack     → vertical rhythm between groups
 *   SettingsGroup     → quiet eyebrow ABOVE one hairline-divided card
 *   SettingsLinkRow   → a drill-in row: icon · label · value · chevron
 *   SettingsRow       → an in-place row: label · (description) · control/value
 *   SettingsToggleRow → label · (description) · Switch
 *   SettingsValue     → the right-aligned value token used by all of them
 *
 * Every row is >=52px so its control clears the touch floor without padding
 * hacks, and the hairlines come from `divide-y` on the group rather than
 * hand-placed rules — so a conditionally-hidden row can't strand a separator.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces';
import { Switch } from '@/components/fairway/forms/Switch';
import { IconChevronRight } from '@/components/icons';

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
  title?: string;
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
      {title || description || action ? (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 font-fw-sans text-caption text-text-secondary">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

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

export interface SettingsValueProps {
  children: React.ReactNode;
  /** Use tabular figures — for counts, distances, scores. */
  numeric?: boolean;
  /** Render as the "nothing set" state rather than a value. */
  muted?: boolean;
  className?: string;
}

/**
 * The right-aligned current value.
 *
 * This is the load-bearing piece of the value-forward decision: it is the same
 * token everywhere, so the right edge of a settings list reads as one column
 * of state instead of a ragged mix of chips, plain text and bold numbers.
 */
function SettingsValue({ children, numeric, muted, className }: SettingsValueProps) {
  return (
    <span
      data-slot="fw-settings-value"
      className={cn(
        'truncate font-fw-sans text-body-sm',
        numeric && 'font-fw-mono tabular-nums',
        muted ? 'text-text-tertiary' : 'text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export interface SettingsLinkRowProps {
  /** Destination. Rendered through the caller's Link component. */
  href: string;
  /** Leading glyph — the index's wayfinding. */
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** Optional second line. Omit on a dense index. */
  description?: React.ReactNode;
  /** Current value, right-aligned before the chevron. */
  value?: React.ReactNode;
  /** Render a `numeric` SettingsValue for the `value`. */
  numericValue?: boolean;
  /** Link component (Next's `Link`). Defaults to a plain anchor. */
  as?: React.ElementType;
  className?: string;
}

/**
 * A drill-in row for the settings index.
 *
 * The whole row is the target — not a small chevron — so it is comfortable on
 * a phone. The value renders BEFORE the chevron so a reader scanning the right
 * edge gets state, then affordance, in that order.
 */
export function SettingsLinkRow({
  href,
  icon,
  label,
  description,
  value,
  numericValue,
  as,
  className,
}: SettingsLinkRowProps) {
  const Comp = (as ?? 'a') as React.ElementType;
  return (
    <Comp
      href={href}
      data-slot="fw-settings-link-row"
      className={cn(
        'flex min-h-[56px] w-full items-center gap-3 px-4 py-3',
        'transition-colors [transition-duration:var(--fw-dur-fast)] hover:bg-surface-sunken',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset',
        className,
      )}
    >
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary [&_svg]:h-[18px] [&_svg]:w-[18px]">
          {icon}
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block truncate font-fw-sans text-caption text-text-tertiary">
            {description}
          </span>
        ) : null}
      </span>

      {value != null && value !== '' ? (
        <SettingsValue numeric={numericValue} className="max-w-[45%] text-right">
          {value}
        </SettingsValue>
      ) : null}

      <IconChevronRight
        size={18}
        aria-hidden
        className="shrink-0 text-text-tertiary"
      />
    </Comp>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export interface SettingsRowProps {
  /** The decision's name. */
  label: React.ReactNode;
  /** Why it matters / what it changes. */
  description?: React.ReactNode;
  /** The control (Switch, Segmented, Button…) — right-aligned. */
  control?: React.ReactNode;
  /**
   * A read-only current value, right-aligned. Ignored when `control` is set.
   * This is the value-forward path for rows that open elsewhere or are simply
   * informational (email address, last-changed date, plan).
   */
  value?: React.ReactNode;
  /** Render `value` with tabular figures. */
  numericValue?: boolean;
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
 * One setting, edited in place.
 *
 * `stacked` is the important switch: an inline control sits to the right of
 * the label (switches, short values), while a full-width control (slider,
 * segmented) drops to its own line so it never competes with the label for
 * horizontal space at 320px.
 */
export function SettingsRow({
  label,
  description,
  control,
  value,
  numericValue,
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

  const trailing =
    control ??
    (value != null && value !== '' ? (
      <SettingsValue numeric={numericValue}>{value}</SettingsValue>
    ) : null);

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
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      )}
      {stacked ? null : children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export interface SettingsToggleRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Overrides the accessible name (defaults to `label` when it is a string). */
  ariaLabel?: string;
  className?: string;
}

/**
 * The single most repeated settings shape: a label, an optional explanation,
 * and a switch. It was hand-rolled at every call site — sometimes inside a
 * filled box, sometimes in a divided list, sometimes as a bordered mini-card —
 * which is most of why the surface looked assembled rather than designed.
 */
export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  className,
}: SettingsToggleRowProps) {
  return (
    <SettingsRow
      label={label}
      description={description}
      className={className}
      control={
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        />
      }
    />
  );
}
