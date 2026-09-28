'use client';

/**
 * ============================================================================
 * TeamBleedBoard — "Where the team is bleeding strokes"
 * ----------------------------------------------------------------------------
 * The five areas of the game `getTeamCategoryInsights` scores on every load
 * (Driving, Approach, Short Game, Putting, Scoring), each as its own clearly
 * headed section: the area, the stat it is measured by, the team average, the
 * area's trend, how many players are flagged, and then the players who sit
 * below the team average there, by name, with their own number and trend.
 *
 * Replaces `TeamCategoryLeakBand` on this page (that file stays for its other
 * readers). Differences that matter:
 *   · The players are the point of the section, not a two-name footnote.
 *     Flagged players come first (more than one standard deviation worse than
 *     the team, the action's own `needsAttention`), then anyone else below
 *     the average, worst first, three per area.
 *   · Short Game has no per-round data (scrambling needs shot-level rounds),
 *     so the action reports every short-game trend as "stable". That is a
 *     missing reading, not a steady one: the section says "Trend unavailable"
 *     and draws no per-player trend at all.
 *   · Numbers are formatted here from the raw values (true minus, no
 *     toFixed), so the header figure and the player figures always agree.
 *   · The strokes figure stays. When the area's top CoachHelm signal carries
 *     a live counterfactual (`strokesSavedPerRound`, engine-backed rows only,
 *     set by `assembleBriefEngineInsights`), the area shows "+0.7
 *     strokes/round available", exactly as the old band did. No live
 *     counterfactual, no figure: it is never estimated here.
 *
 * Layout follows the CARD's width (container queries), not the viewport,
 * because the dashboard rail eats a different amount at each breakpoint:
 * stacked areas on a phone, one row per area (figures left, players right)
 * at tablet and laptop widths, five columns only when there is room for them.
 *
 * Honest degrade: an area with nobody scored reads "Awaiting rounds"; the
 * health ring reads "Awaiting rounds" when no area has any data, rather than
 * drawing the action's 0 as a real (terrible) score.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Avatar, Badge, EmptyState, TrendGlyph } from '@/components/fairway';
import type { PlayerCategoryStat, TeamCategory } from '@/app/golf/actions/team-category-insights';

export interface TeamBleedBoardProps {
  categories: TeamCategory[];
  teamHealth: number;
  className?: string;
}

type Trend = TeamCategory['trend'];

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const TWO_DECIMALS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const SIGNED_ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

const TREND_WORD: Record<Trend, string> = {
  improving: 'Improving',
  stable: 'Steady',
  declining: 'Declining',
};

/** What each area is measured by, in plain words. Falls back to the action's
 *  own `primaryMetric` label for an id this file does not know. */
const METRIC_NAME: Record<string, string> = {
  driving: 'Fairways hit',
  approach: 'Greens in regulation',
  short_game: 'Scrambling',
  putting: 'Putts per round',
  scoring: 'Average to par',
};

/** Areas whose per-round trend the action cannot compute. */
const NO_TREND_DATA = new Set(['short_game']);

function withTrueMinus(text: string): string {
  return text.replace('-', '−');
}

/** One formatter per area so the team figure and each player's figure read
 *  the same way. */
export function formatAreaValue(categoryId: string, value: number): string {
  if (!Number.isFinite(value)) return '';
  switch (categoryId) {
    case 'driving':
    case 'approach':
    case 'short_game':
      return `${WHOLE.format(value)}%`;
    case 'putting':
      return ONE_DECIMAL.format(value);
    case 'scoring':
      return withTrueMinus(SIGNED_ONE_DECIMAL.format(value));
    default:
      return withTrueMinus(ONE_DECIMAL.format(value));
  }
}

/**
 * The strokes a round the area's top CoachHelm signal puts on the table:
 * the first engine-backed insight with a live counterfactual (finite, above
 * zero). Template insights never carry one. Null when there is none.
 */
export function strokesAvailable(category: TeamCategory): { perRound: number; message: string } | null {
  for (const insight of category.insights) {
    const perRound = insight.strokesSavedPerRound;
    if (insight.engineBacked === true && typeof perRound === 'number' && Number.isFinite(perRound) && perRound > 0) {
      return { perRound, message: insight.message };
    }
  }
  return null;
}

/** One decimal, or two below 0.1 so a small real figure never reads "0.0"
 *  (the rule `assembleBriefEngineInsights` writes its sentence with). */
export function formatStrokesPerRound(perRound: number): string {
  const abs = Math.abs(perRound);
  return abs < 0.1 ? TWO_DECIMALS.format(abs) : ONE_DECIMAL.format(abs);
}

/**
 * The players below the team average in one area: everyone the action
 * flagged, then anyone else on the wrong side of the average, worst first.
 *
 * `players` arrives sorted best to worst, which is also how "wrong side" is
 * read without a per-area direction table: the first player is the best, so
 * if the best value is the larger one, lower is worse.
 */
export function areaContributors(category: TeamCategory, limit = 3): { shown: PlayerCategoryStat[]; more: number } {
  const players = category.players;
  if (players.length === 0) return { shown: [], more: 0 };
  const first = players[0]!;
  const last = players[players.length - 1]!;
  const higherIsBetter = first.value >= last.value;
  const belowAverage = (p: PlayerCategoryStat) =>
    higherIsBetter ? p.value < category.teamAvg : p.value > category.teamAvg;
  const worstFirst = [...players].reverse();
  const flagged = worstFirst.filter((p) => p.needsAttention);
  const others = worstFirst.filter((p) => !p.needsAttention && belowAverage(p));
  const all = [...flagged, ...others];
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

function HealthRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 15;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90 text-text-primary" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
      />
    </svg>
  );
}

function AttentionTicks({ scored, flagged }: { scored: number; flagged: number }) {
  // N-of-scored discrete ticks rather than a continuous fill: a bar under a
  // percentage headline ("63%") reads as filling to THAT number. Ticks can't.
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-[3px]">
      {Array.from({ length: scored }, (_, i) => (
        <span
          key={i}
          className={cn('h-1.5 min-w-[3px] flex-1 rounded-full', i < flagged ? 'bg-fw-warning' : 'bg-border-strong')}
        />
      ))}
    </div>
  );
}

// Card-width breakpoints (the <section> is the container). Written out in
// full on every class, never assembled from a prefix constant: Tailwind only
// generates classes it can read literally in the source.
//   600px  one row per area, figures left and players right
//   820px  players three across inside that row
//   1100px five side-by-side columns

function AreaSection({ category }: { category: TeamCategory }) {
  const scored = category.players.length;
  const hasData = scored > 0;
  const trendKnown = !NO_TREND_DATA.has(category.id);
  const metricName = METRIC_NAME[category.id] ?? category.primaryMetric;
  const { shown, more } = areaContributors(category);
  const available = strokesAvailable(category);
  const headingId = `bleed-area-${category.id}`;

  return (
    <li
      aria-labelledby={headingId}
      className={cn(
        'grid min-w-0 grid-cols-1 gap-4 p-4 sm:p-5',
        '[@container(min-width:600px)]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] [@container(min-width:600px)]:gap-8',
        '[@container(min-width:1100px)]:flex [@container(min-width:1100px)]:flex-col [@container(min-width:1100px)]:gap-4',
      )}
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="min-w-0">
          <h3 id={headingId} className="font-fw-sans text-body font-semibold text-text-primary">
            {category.label}
          </h3>
          <p className="font-fw-sans text-caption text-text-tertiary">{metricName}, team average</p>
        </div>

        {hasData ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-fw-display text-h2 font-semibold tabular-nums tracking-[-0.02em] text-text-primary">
                {formatAreaValue(category.id, category.teamAvg)}
              </span>
              {trendKnown ? (
                <TrendGlyph direction={category.trend} className="font-fw-sans text-caption font-medium" />
              ) : (
                <span className="font-fw-sans text-caption text-text-tertiary">Trend unavailable</span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <AttentionTicks scored={scored} flagged={category.attentionCount} />
              <span
                className={cn(
                  'shrink-0 font-fw-sans text-caption tabular-nums',
                  category.attentionCount > 0 ? 'font-medium text-fw-warning-ink' : 'text-text-tertiary',
                )}
              >
                {category.attentionCount > 0
                  ? `${category.attentionCount} of ${scored} flagged`
                  : `${scored} of ${scored} in range`}
              </span>
            </div>
            {available ? (
              <Badge
                tone="accent"
                size="sm"
                numeric
                title={available.message}
                className="h-auto max-w-full self-start whitespace-normal break-words py-1 text-left leading-snug"
              >
                +{formatStrokesPerRound(available.perRound)} strokes/round available
                <span className="sr-only"> in the top {category.label.toLowerCase()} signal</span>
              </Badge>
            ) : null}
          </>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-tertiary">Awaiting rounds</p>
        )}
      </div>

      {hasData ? (
        <div
          className={cn(
            'flex min-w-0 flex-col gap-2 border-t border-border-subtle pt-3',
            '[@container(min-width:600px)]:border-t-0 [@container(min-width:600px)]:pt-0',
            '[@container(min-width:1100px)]:border-t [@container(min-width:1100px)]:pt-3',
          )}
        >
          <p className="font-fw-sans text-caption font-medium text-text-secondary">Below the team average</p>
          {shown.length > 0 ? (
            <ul
              className={cn(
                'grid grid-cols-1 gap-1',
                '[@container(min-width:820px)]:grid-cols-3 [@container(min-width:820px)]:gap-x-5',
                '[@container(min-width:1100px)]:grid-cols-1',
              )}
            >
              {shown.map((p) => {
                const value = formatAreaValue(category.id, p.value);
                const trendWord = TREND_WORD[p.trend];
                return (
                  <li
                    key={p.playerId}
                    className="flex min-h-[36px] min-w-0 items-center gap-2.5"
                    title={
                      trendKnown ? `${p.playerName}: ${value}, ${trendWord.toLowerCase()}` : `${p.playerName}: ${value}`
                    }
                  >
                    <Avatar src={p.avatarUrl} name={p.playerName} size="xs" decorative />
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-primary">
                      {p.playerName}
                      {p.needsAttention ? <span className="sr-only"> (flagged)</span> : null}
                    </span>
                    {p.needsAttention ? (
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-fw-warning" />
                    ) : null}
                    <span className="shrink-0 font-fw-sans text-body-sm font-medium tabular-nums text-text-primary">
                      {value}
                    </span>
                    {trendKnown ? (
                      <TrendGlyph
                        direction={p.trend}
                        label={<span className="sr-only">{trendWord}</span>}
                        className="w-4 shrink-0 justify-center font-fw-sans text-body-sm"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="font-fw-sans text-body-sm text-text-tertiary">Nobody is below the team average.</p>
          )}
          {more > 0 ? (
            <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">+{more} more below the average</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function TeamBleedBoard({ categories, teamHealth, className }: TeamBleedBoardProps) {
  // `computeTeamHealth` returns 0 both for "0% healthy" and "no area has a
  // scored player"; only the first is a reading.
  const hasAnyData = categories.some((c) => c.players.length > 0);

  return (
    <section
      aria-labelledby="team-bleed-heading"
      className={cn(
        'flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft [container-type:inline-size]',
        className,
      )}
    >
      <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <h2 id="team-bleed-heading" className="min-w-0 font-fw-sans text-h3 font-semibold text-text-primary">
          Where the team is bleeding strokes
        </h2>
        {hasAnyData ? (
          <div
            className="flex shrink-0 items-center gap-2.5"
            role="img"
            aria-label={`Team health ${teamHealth} out of 100: the share of scored players inside the team's normal range, averaged across the areas`}
          >
            <HealthRing value={teamHealth} />
            <div className="flex flex-col leading-tight">
              <span className="font-fw-display text-h3 font-semibold tabular-nums text-text-primary">{teamHealth}</span>
              <span className="font-fw-sans text-caption text-text-secondary">Team health</span>
            </div>
          </div>
        ) : (
          <span className="shrink-0 font-fw-sans text-caption text-text-secondary">Awaiting rounds</span>
        )}
      </div>

      {categories.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            variant="subtle"
            title="Awaiting rounds"
            description="Driving, approach, short game, putting and scoring fill in as players log rounds."
          />
        </div>
      ) : (
        <ol
          className={cn(
            'grid grid-cols-1 divide-y divide-border-subtle',
            '[@container(min-width:1100px)]:grid-cols-5 [@container(min-width:1100px)]:divide-x [@container(min-width:1100px)]:divide-y-0',
          )}
        >
          {categories.map((category) => (
            <AreaSection key={category.id} category={category} />
          ))}
        </ol>
      )}

      {hasAnyData ? (
        <p className="border-t border-border-subtle px-4 py-3 font-fw-sans text-caption text-text-tertiary sm:px-5">
          Flagged means more than one standard deviation worse than the team average. Trends compare recent rounds with
          the rounds before them.
        </p>
      ) : null}
    </section>
  );
}
