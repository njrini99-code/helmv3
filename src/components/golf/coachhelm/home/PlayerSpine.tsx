'use client';

/**
 * ============================================================================
 * PlayerSpine — the Player CoachHelm spine (spec §5.3)
 * ----------------------------------------------------------------------------
 * Thin composition over the `Spine` module: the predicted-score hero (falls
 * back to an honest em-dash pre-forecast), the prediction verdict, the
 * you/team/Tour `StandingTrack` (anchored on SG: Total — same rail idiom as
 * the Stats spine), the top-3 focus-area `PriorityList`, and the
 * rounds/fairways/greens/putts `SpineLedger`.
 *
 * The desktop rail (`<Spine>`, ≥940px) is `Spine.tsx`'s own layout —
 * everything it needs (hero/verdict/track/priorities/ledger) is already
 * real, non-empty data whenever it exists, so each optional section either
 * renders in full or collapses cleanly (no leftover blank block). The
 * compact mobile hero below (<940px, owned entirely by this file) shows the
 * SAME priorities + ledger content in full — not a 2-item teaser — in its
 * horizontally-scrolling pill row, so the mobile summary is exactly as dense
 * as the desktop rail it stands in for.
 * ========================================================================== */

import Link from 'next/link';
import { Spine } from '@/components/fairway/modules';
import type { PriorityItem, StandingTrackProps } from '@/components/fairway/modules';

export interface PlayerSpineProps {
  hero: { value: string; unit?: string };
  verdict: string;
  track?: StandingTrackProps;
  priorities: PriorityItem[];
  ledger: Array<{ label: string; value: string }>;
  className?: string;
}

export function PlayerSpine({ hero, verdict, track, priorities, ledger, className }: PlayerSpineProps) {
  return (
    <>
      <aside className="overflow-clip rounded-fw-lg border border-accent-700 bg-gradient-to-r from-accent-900 to-accent-800 p-4 text-text-on-accent [box-shadow:var(--fw-shadow-card)] min-[940px]:hidden">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">CoachHelm AI</p>
            <p className="mt-1.5 flex items-baseline gap-1.5 font-fw-mono text-h2 font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {hero.value}
              {hero.unit ? <span className="font-fw-sans text-caption font-normal tracking-normal text-accent-300">{hero.unit}</span> : null}
            </p>
            <p className="mt-2 line-clamp-2 font-fw-sans text-caption leading-relaxed text-ink-on-deep">{verdict}</p>
          </div>
          <Link href="/golf/dashboard/rounds/new" className="shrink-0 rounded-full border border-white/25 px-3 py-2 text-caption font-semibold text-text-on-accent transition-opacity duration-150 hover:opacity-80">
            Log round
          </Link>
        </div>
        {(priorities.length > 0 || ledger.length > 0) ? (
          /* Wraps below lg instead of scrolling.
             As a hidden-scrollbar horizontal scroller this row hid 48% of
             itself on a phone (clientWidth 324 vs scrollWidth 622 — 'Fairways',
             'Greens' and 'Putts / rd' were all past the edge) with no fade, no
             scrollbar and no tabindex, so the content was neither visible nor
             keyboard-reachable (audit 2026-07-24, P-07). These are five short
             chips; wrapping costs one line and shows all of them. */
          <div className="mt-3 flex min-w-0 flex-wrap gap-2 border-t border-white/15 pt-3 lg:flex-nowrap lg:overflow-x-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
            {priorities.map((item) => (
              <span key={`${item.rank}-${item.title}`} className="shrink-0 rounded-full bg-accent-650 px-3 py-1.5 font-fw-sans text-caption text-ink-on-deep">
                {item.title} <b className="ml-1 font-fw-mono font-medium tabular-nums text-text-on-accent">{item.value}</b>
              </span>
            ))}
            {ledger.map((item) => (
              <span key={item.label} className="shrink-0 rounded-full bg-accent-650 px-3 py-1.5 font-fw-sans text-caption text-ink-on-deep">
                {item.label} <b className="ml-1 font-fw-mono font-medium tabular-nums text-text-on-accent">{item.value}</b>
              </span>
            ))}
          </div>
        ) : null}
      </aside>
      <Spine
        eyebrow="CoachHelm AI"
        hero={hero}
        verdict={verdict}
        track={track}
        priorities={priorities}
        ledger={ledger}
        cta={{ label: 'Log a round', href: '/golf/dashboard/rounds/new' }}
        className={`hidden min-[940px]:block ${className ?? ''}`}
      />
    </>
  );
}
