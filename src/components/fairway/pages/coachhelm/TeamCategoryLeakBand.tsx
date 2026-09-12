'use client';

/**
 * ============================================================================
 * TeamCategoryLeakBand — "where the team is bleeding strokes", team-wide
 * ----------------------------------------------------------------------------
 * `getTeamCategoryInsights` computes a rich per-category rollup (driving /
 * approach / short game / putting / scoring: team avg, trend, per-player
 * breakdown, up-to-3 insights each with `strokesSavedPerRound`) plus a 0-100
 * `teamHealth` score on EVERY /dashboard/intelligence load — and until now it
 * was fetched and thrown away (only `overview.data.playerCount` was ever
 * read). This band is the "rebuilt equivalent" of the orphaned
 * `golf/coachhelm/coach/LeakBoard.tsx` for THIS richer shape: LeakBoard groups
 * a flat list of live signal insights by category (a good "what's open right
 * now" summary), but has no way to carry a team AVERAGE, a category TREND, a
 * ranked per-player worst-offender list, or the team-health DIAL — those only
 * exist on `TeamCategory[]`, so rather than force LeakBoard's shape to fit,
 * this is a fresh, decoupled presentation component over the actual data.
 *
 * Every category segment carries at least two visual channels (a trend glyph
 * + an attention-share bar), never text-only, per the CoachHelm design bar.
 * Honest degrade: a category with zero players scored (`players.length===0`)
 * shows "Awaiting rounds" instead of a fabricated 0%; the band itself renders
 * nothing when the fetch failed or the team genuinely has no categories yet
 * (CoachIntelligenceHome's own onboarding gate already covers a truly empty
 * roster before this ever mounts).
 *
 * ONE SEAMED BAND (facelift, 2026-09): previously five separate `Surface`
 * cards in a wrapped grid, each with its own framer-motion entrance staggered
 * by index — a card-soup + a banned staggered-entrance (BRIEF.md §6.5, §11).
 * Now a single hairline-divided row (`divide-x`) inside the ONE `InstrumentPanel`
 * bezel, no per-segment surface, no motion. Categories that don't fit the
 * viewport scroll horizontally as one strip rather than wrapping into a second
 * seamed row (which would need its own divider treatment).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway/controls/badge';
import { TrendGlyph } from '@/components/fairway/charts/TrendChip';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { RingGauge } from '@/components/fairway/modules/RingGauge';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import type { TeamCategory } from '@/app/golf/actions/team-category-insights';

export interface TeamCategoryLeakBandProps {
  categories: TeamCategory[];
  teamHealth: number;
  className?: string;
}

/** "35% Scramble" → ["35%", "Scramble"]; "+3.8 vs par" → ["+3.8", "vs par"]; "42" → ["42", null]. */
function splitAvgLabel(label: string): [string, string | null] {
  const i = label.indexOf(' ');
  return i > 0 ? [label.slice(0, i), label.slice(i + 1)] : [label, null];
}

function CategorySegment({ category }: { category: TeamCategory }) {
  const scored = category.players.length;
  const hasData = scored > 0;
  const [avgValue, avgUnit] = hasData ? splitAvgLabel(category.teamAvgLabel) : [category.teamAvgLabel, null];

  // Worst-first: `players` is already sorted best→worst by the source
  // action, so reversing + filtering to the flagged (>1 stddev off-average)
  // subset keeps the truly worst offenders on top, capped to 2 so the card
  // stays dense rather than dumping the full roster.
  const worstOffenders = [...category.players].reverse().filter((p) => p.needsAttention).slice(0, 2);

  const strokesChips = category.insights
    .filter((insight): insight is typeof insight & { strokesSavedPerRound: number } =>
      typeof insight.strokesSavedPerRound === 'number' && insight.strokesSavedPerRound > 0,
    )
    .slice(0, 2);

  return (
    // Equal-share columns (`flex-1` from a 0 basis) with a 144px floor: when
    // the band has room every category gets the same width and the row fills
    // the panel edge to edge; when it doesn't (five categories in a ~500px
    // stage) the floor pushes the row into the horizontal scroller above
    // rather than squeezing the mono readouts. The old `min-w-[164px]
    // max-w-[220px] shrink-0` pair could never fill the panel and, with the
    // cockpit's three panes at 1440, left the fourth column half inside the
    // scroll fade reading as text cut mid-word (facelift REVIEW.md item 6).
    <div className="flex h-full min-w-[144px] flex-1 flex-col gap-3 px-4 py-3.5 first:pl-0 last:pr-0">
      {/* flex-wrap: on tight phone widths (long label + long trend word,
          e.g. APPROACH + Declining) the glyph must wrap under the label —
          with shrink-0 alone it escapes past the card edge (iOS 2026-07-24). */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <p className="font-fw-display text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
          {category.label}
        </p>
        <TrendGlyph direction={category.trend} className="shrink-0 text-caption" />
      </div>

        {/* Value and unit as two type sizes on one baseline ("35%" + "Scramble")
            rather than one h3 string: at the band's column floor a mono
            "35% Scramble" wrapped to two lines and pushed that column's tick
            rail below its siblings'. The unit is whatever follows the first
            space in the formatted label; a label with no space renders whole. */}
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{avgValue}</span>
          {avgUnit ? <span className="text-caption text-text-tertiary">{avgUnit}</span> : null}
        </p>

        {hasData ? (
          <div className="flex flex-col gap-1.5">
            {/* N-of-`scored` discrete ticks, not a continuous % fill — a
                percentage-shaped bar under a percentage-shaped headline stat
                (e.g. "63% FW") reads as filling to THAT number, not to the
                attention fraction below it. Quantized ticks can't be
                misread that way. */}
            <div aria-hidden="true" className="flex items-center gap-[3px]">
              {Array.from({ length: scored }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 min-w-[3px] flex-1 rounded-sm',
                    // The non-attention ticks now read GREEN rather than the
                    // beige surface-sunken they used to. Those players ARE on
                    // track, so the rail states both halves instead of only
                    // flagging the bad one against an inert background — and it
                    // puts the brand green back into a band that was entirely
                    // amber-on-champagne.
                    i < category.attentionCount ? 'bg-fw-warning' : 'bg-accent-500',
                  )}
                />
              ))}
            </div>
            {/* `whitespace-normal` deliberately overrides Badge's built-in
                whitespace-nowrap (twMerge lets className win). At 390px the
                two-up grid makes each card ~165px while "2 of 7 need work"
                needs ~181px, so the nowrap pill was CLIPPED by 16px — measured
                on prod 2026-07-25. Wrapping to a second line matches the
                "+0.7 str/rd available" pill already in this view. */}
            <Badge
              tone={category.attentionCount > 0 ? 'warning' : 'success'}
              size="sm"
              numeric
              className="whitespace-normal"
            >
              {category.attentionCount > 0
                ? `${category.attentionCount} of ${scored} need work`
                : `${scored} of ${scored} on track`}
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden />
            <Badge tone="neutral" size="sm">
              Awaiting rounds
            </Badge>
          </div>
        )}

        {worstOffenders.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
            {worstOffenders.map((p) => (
              <div
                key={p.playerId}
                className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-caption"
              >
                <span className="min-w-0 truncate text-text-secondary" title={p.playerName}>
                  {p.playerName}
                </span>
                <TrendGlyph
                  direction={p.trend}
                  magnitude={p.trendDelta}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        ) : null}

        {strokesChips.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {strokesChips.map((insight) => (
              <Badge
                key={insight.id}
                tone="accent"
                size="sm"
                numeric
                className="h-auto max-w-full whitespace-normal break-words py-1 text-left leading-snug"
              >
                +{insight.strokesSavedPerRound.toFixed(1)} str/rd available
              </Badge>
            ))}
          </div>
        ) : null}
    </div>
  );
}

export function TeamCategoryLeakBand({ categories, teamHealth, className }: TeamCategoryLeakBandProps) {
  // Premium scroll-edge fade (the same primitive `ViewHeaderSegments` uses
  // for its own horizontally-scrollable row) — at 1440px five categories can
  // still exceed the panel's available width, and this strip is DESIGNED to
  // scroll rather than wrap into a second row (see the file docblock). A
  // hard-clipped hidden edge with no visual cue reads as a broken layout
  // (facelift REVIEW.md item 6, "columns clip at 1440"); the fade signals
  // "more this way" instead.
  //
  // Called BEFORE the `categories.length === 0` guard below — Rules of Hooks
  // forbids a conditional/early-return call (caught by
  // react-hooks/rules-of-hooks), and there is nothing unsafe about running
  // this on the empty-categories render anyway (the ref just never attaches
  // to a DOM node in that case).
  const { ref: scrollFadeRef, fadeStyle } = useScrollFade<HTMLDivElement>('x');

  if (categories.length === 0) return null;

  return (
    <InstrumentPanel
      depth="base"
      className={className}
      eyebrow="CoachHelm · team"
      header="Where the team is bleeding strokes"
      readout={
        <div className="flex items-center gap-2.5">
          <RingGauge value={teamHealth} size={44} />
          <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">Team health</span>
        </div>
      }
    >
      {/* ONE seamed row (hairline `divide-x`), not a wrapped grid of cards —
          overflows into its own horizontal scroller on narrow viewports
          rather than wrapping into a second seamed row. */}
      <div ref={scrollFadeRef} style={fadeStyle} className="overflow-x-auto">
        <div className="flex divide-x divide-border-subtle">
          {categories.map((category) => (
            <CategorySegment key={category.id} category={category} />
          ))}
        </div>
      </div>
    </InstrumentPanel>
  );
}
