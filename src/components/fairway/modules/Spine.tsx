'use client';

/**
 * ============================================================================
 * Spine — the persistent green summary rail (mockup §01 .spine)
 * ----------------------------------------------------------------------------
 * The "always visible, never scrolls away" half of the Spine & Stage
 * pattern: an eyebrow, a huge mono hero figure + verdict sentence, an
 * optional bare `StandingBars` readout, an optional `PriorityList`, an
 * optional `SpineLedger`, a free-form `children` escape hatch for
 * surface-specific rows, and a pill CTA that renders as a real `<a>` when
 * `cta.href` is given, else a real `<button>`.
 *
 * The standing readout used to be `StandingTrack` (a dot-on-a-rail pin) —
 * replaced 2026-09-10 (owner: "get rid of these slider things... replace it
 * with an actual component") with `StandingBars` in `frame="bare"` mode, so
 * it reads as labeled rows on the spine's own dark surface instead of a
 * second nested card.
 *
 * Sticky positioning is the CONSUMER's job (per plan: "sticky top-20 handled
 * by the CONSUMER via className prop passthrough") — this component only
 * accepts `className` and applies it last so a page can add
 * `sticky top-20` (or `lg:sticky lg:top-20`) without Spine hard-coding a
 * position that would fight a mobile stacked layout.
 *
 * The dark accent-900→accent-800 gradient surface has no `bg-surface-*`
 * equivalent for its translucent white hairlines/border — those are inline
 * `oklch(1 0 0 / N)` values, matching the approved mockup.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PressTarget } from '../controls';
import { TABULAR_NUMS } from '../charts/theme';
import { StandingBars } from '../charts/StandingBars';
import { PriorityList } from './PriorityList';
import { SpineLedger } from './SpineLedger';
import type { SpineProps } from './types';

const HAIRLINE_COLOR = 'oklch(1 0 0 / 0.14)';
const CTA_BORDER_COLOR = 'oklch(1 0 0 / 0.25)';

function SpineHairline() {
  return <hr aria-hidden="true" className="my-5 border-t" style={{ borderTopColor: HAIRLINE_COLOR }} />;
}

function SpineEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">
      {children}
    </p>
  );
}

export function Spine({
  eyebrow,
  hero,
  verdict,
  standing,
  priorities,
  ledger,
  cta,
  children,
  className,
}: SpineProps & { className?: string }) {
  const ctaClassName =
    'mt-5 block w-full rounded-full border px-4 py-2.5 text-center font-fw-sans text-body-sm font-semibold text-text-on-accent transition-opacity duration-200 ease-out hover:opacity-80 motion-reduce:transition-none';

  return (
    <aside
      data-slot="spine"
      className={cn(
        'rounded-fw-lg border border-accent-700 bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-6 text-text-on-accent shadow-raise',
        className,
      )}
    >
      <SpineEyebrow>{eyebrow}</SpineEyebrow>

      <p className="mt-2.5 flex items-baseline gap-1.5 font-fw-mono text-stat-lg font-semibold leading-none tracking-[-0.03em] text-text-on-accent">
        <span style={TABULAR_NUMS} className="tabular-nums">
          {hero.value}
        </span>
        {hero.unit ? (
          <span className="font-fw-sans text-body-sm font-normal normal-case tracking-normal text-accent-300">
            {hero.unit}
          </span>
        ) : null}
      </p>

      <p className="mt-2.5 font-fw-sans text-body-sm text-ink-on-deep">{verdict}</p>

      {standing ? (
        <>
          <SpineHairline />
          <StandingBars {...standing} size="sm" layout="compact" frame="bare" className="text-text-on-accent" />
        </>
      ) : null}

      {priorities && priorities.length > 0 ? (
        <>
          <SpineHairline />
          <div className="mb-2.5">
            <SpineEyebrow>Priorities</SpineEyebrow>
          </div>
          <PriorityList items={priorities} />
        </>
      ) : null}

      {ledger && ledger.length > 0 ? (
        <>
          <SpineHairline />
          <SpineLedger rows={ledger} />
        </>
      ) : null}

      {children}

      {cta ? (
        cta.href ? (
          <a href={cta.href} className={ctaClassName} style={{ borderColor: CTA_BORDER_COLOR }}>
            {cta.label}
          </a>
        ) : (
          <PressTarget onClick={cta.onClick} className={ctaClassName} style={{ borderColor: CTA_BORDER_COLOR }}>
            {cta.label}
          </PressTarget>
        )
      ) : null}
    </aside>
  );
}
