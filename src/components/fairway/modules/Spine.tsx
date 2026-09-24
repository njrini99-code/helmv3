'use client';

/**
 * ============================================================================
 * Spine — the persistent frosted summary card (mockup §01 .spine)
 * ----------------------------------------------------------------------------
 * The "always visible, never scrolls away" half of the Spine & Stage
 * pattern: an eyebrow, a big dark tabular hero figure (+ a small gain/loss
 * direction chip when it is a signed strokes-gained figure) and a verdict sentence, an
 * optional `StandingTrack`, an optional `PriorityList`, an optional
 * `SpineLedger` stat row, a free-form `children` escape hatch for
 * surface-specific rows, and a secondary pill CTA that renders as a real
 * `<a>` when `cta.href` is given, else a real `<button>`.
 *
 * LOOK (owner redesign, 2026-09): a light, frosted-glass card — translucent
 * `bg-surface` with a backdrop blur, a hairline `border-border-subtle`, a soft
 * shadow, and a very faint `accent-wash` tint fading down from the top edge.
 * It replaced the old dark accent-900→800 gradient slab ("the big green
 * thing"). Every colour is a token, so the card follows light/dark theme.
 * Without `backdrop-filter` support it falls back to the opaque `bg-surface`
 * card (same pattern as `ChartTooltip`).
 *
 * Sticky positioning is the CONSUMER's job (per plan: "sticky top-20 handled
 * by the CONSUMER via className prop passthrough") — this component only
 * accepts `className` and applies it last so a page can add
 * `sticky top-20` (or `lg:sticky lg:top-20`) without Spine hard-coding a
 * position that would fight a mobile stacked layout.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PressTarget } from '../controls';
import { TABULAR_NUMS } from '../charts/theme';
import { StandingTrack } from './StandingTrack';
import { PriorityList } from './PriorityList';
import { SpineLedger } from './SpineLedger';
import type { SpineProps } from './types';

export type SpineHeroDirection = 'gain' | 'loss';

/**
 * Direction of a SIGNED strokes-gained hero, read from its leading sign:
 * "+1.3" is a gain, "−2.1" / "-2.1" a loss. Only when the unit says it is a
 * strokes-gained figure ("SG / rd"): a signed score-to-par ("+3.0", the
 * PlayerSpine prediction hero) is the opposite sense — plus is worse — so it
 * gets no chip rather than a wrong green "Gaining". Unsigned values ("74.2",
 * "—") and zero get no chip either. Pure, exported for tests.
 */
export function spineHeroDirection(value: string, unit?: string): SpineHeroDirection | null {
  if (!unit || !/\bSG\b/.test(unit)) return null;
  const match = /^\s*([+\-\u2212])\s*(\d+(?:[.,]\d+)?)/.exec(value);
  if (!match) return null;
  if (Number(match[2]!.replace(',', '.')) === 0) return null;
  return match[1] === '+' ? 'gain' : 'loss';
}

function SpineDivider() {
  return <hr aria-hidden="true" className="my-5 border-t border-border-subtle" />;
}

function SpineEyebrow({ children }: { children: ReactNode }) {
  return <p className="font-fw-sans text-caption font-semibold text-text-secondary">{children}</p>;
}

/** Small rounded direction chip beside the hero figure. It never repeats the
 *  number (the hero already shows it); the word carries the meaning, the
 *  arrow is decoration, so colour is never the only channel. */
function HeroDirectionChip({ direction }: { direction: SpineHeroDirection }) {
  const gain = direction === 'gain';
  return (
    <span
      data-slot="spine-hero-chip"
      data-direction={direction}
      className={cn(
        'inline-flex items-center gap-0.5 self-center rounded-full px-2 py-0.5 font-fw-sans text-caption font-semibold',
        gain ? 'bg-accent-wash text-accent-ink' : 'bg-fw-danger-bg text-fw-danger-ink',
      )}
    >
      <span aria-hidden="true">{gain ? '↑' : '↓'}</span>
      {gain ? 'Gaining' : 'Losing'}
    </span>
  );
}

export function Spine({
  eyebrow,
  hero,
  verdict,
  track,
  priorities,
  ledger,
  cta,
  children,
  className,
}: SpineProps & { className?: string }) {
  const direction = spineHeroDirection(hero.value, hero.unit);
  const ctaClassName =
    'mt-5 block w-full rounded-full border border-border-control bg-surface px-4 py-2.5 text-center font-fw-sans text-body-sm font-semibold text-accent-ink transition-colors duration-200 ease-out hover:bg-accent-wash motion-reduce:transition-none';

  return (
    <aside
      data-slot="spine"
      className={cn(
        // Frosted card: translucent surface + blur, with a faint green wash
        // fading down from the top edge (a gradient on the card itself, so it
        // needs no overflow clipping). Opaque surface where blur is missing.
        'rounded-fw-lg border border-border-subtle p-6 text-text-primary shadow-soft',
        'bg-gradient-to-b from-accent-wash/40 via-surface/70 via-35% to-surface/70',
        'backdrop-blur-xl backdrop-saturate-150',
        'supports-[not(backdrop-filter:blur(0))]:bg-surface',
        className,
      )}
    >
      <SpineEyebrow>{eyebrow}</SpineEyebrow>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="flex items-baseline gap-1.5 font-fw-display text-stat-lg font-semibold leading-none tracking-[-0.03em] text-text-primary">
          <span style={TABULAR_NUMS} className="tabular-nums">
            {hero.value}
          </span>
          {hero.unit ? (
            <span className="font-fw-sans text-body-sm font-medium tracking-normal text-text-secondary">
              {hero.unit}
            </span>
          ) : null}
        </p>
        {direction ? <HeroDirectionChip direction={direction} /> : null}
      </div>

      <p className="mt-3 font-fw-sans text-body-sm text-text-secondary">{verdict}</p>

      {track ? (
        <>
          <SpineDivider />
          <StandingTrack {...track} tone="light" />
        </>
      ) : null}

      {priorities && priorities.length > 0 ? (
        <>
          <SpineDivider />
          <div className="mb-3">
            <SpineEyebrow>Priorities</SpineEyebrow>
          </div>
          <PriorityList items={priorities} />
        </>
      ) : null}

      {ledger && ledger.length > 0 ? (
        <>
          <SpineDivider />
          <SpineLedger rows={ledger} />
        </>
      ) : null}

      {children}

      {cta ? (
        cta.href ? (
          <a href={cta.href} className={ctaClassName}>
            {cta.label}
          </a>
        ) : (
          <PressTarget onClick={cta.onClick} className={ctaClassName}>
            {cta.label}
          </PressTarget>
        )
      ) : null}
    </aside>
  );
}
