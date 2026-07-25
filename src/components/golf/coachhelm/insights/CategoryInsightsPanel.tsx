'use client';

/**
 * ============================================================================
 * CategoryInsightsPanel — the player Insights drill's THEME rendering
 * ----------------------------------------------------------------------------
 * Founder feedback (2026-07-22 screenshots): the prior rendering here
 * (`ThemesPanel`/`ThemeCard`/`CauseRow` from `@/components/fairway/cards-
 * insight/themes`) was a monotonous vertical stack of identical bordered
 * accordion rows, usually surfacing only ONE category (Putting), with amber
 * `fw-warning` "Declining"/strokes-per-round chips that read as off-token
 * alarms rather than calm, scannable signal. "Insights should be easier to
 * read."
 *
 * This component renders the SAME `ThemeNode[]`/`CauseNode[]` scaffold (no
 * new shot math — `assemble.ts` is untouched) through a different lens:
 *   - a category filter (`Segmented`) so the player can move across their
 *     whole game instead of scrolling one long list
 *   - each category section leads with a headline + an at-a-glance magnitude
 *     Badge (fw-danger for a leak, fw-success/accent for a strength — NEVER
 *     amber/warning; a trend chip follows the same danger/success mapping)
 *   - each cause collapses to ONE crisp takeaway line + magnitude by
 *     default; the full prose, root drivers, drills, and the "Make it a
 *     plan" CTA sit behind a single expand (progressive disclosure, not a
 *     wall of paragraphs)
 *
 * `ThemesPanel`/`ThemeCard`/`CauseRow` are NOT modified — they're also
 * mounted by `FairwayPlayerCoachHelm`/`FairwayPlayerInsight` (the coach's
 * player deep-dive "Game" tab), a surface owned elsewhere. This file is
 * additive and scoped to the player Insights drill only.
 *
 * PRESENTATION ONLY — no data fetch, no server action import. `onMakePlan`
 * is injected exactly as `ThemesPanel` did.
 * ========================================================================== */

import { useId, useMemo, useState } from 'react';
import { ChevronDown, Sparkles, Target, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Eyebrow,
  Inset,
  InsufficientData,
  Segmented,
  type SegmentedOption,
} from '@/components/fairway';
import type {
  CauseNode,
  DriverLeaf,
  RootDriver,
  ThemeNode,
  ThemeTrend,
} from '@/lib/coachhelm/v3/themes/types';

export interface CategoryInsightsPanelProps {
  /** Themes, already sorted by magnitude — this panel does NOT re-sort. */
  themes: ThemeNode[];
  onMakePlan?: (cause: CauseNode, theme: ThemeNode) => void;
  makePlanPendingId?: string | null;
}

const ALL_VALUE = '__all__';

export function CategoryInsightsPanel({
  themes,
  onMakePlan,
  makePlanPendingId,
}: CategoryInsightsPanelProps) {
  const substantive = useMemo(() => themes.filter((t) => t.state !== 'thin'), [themes]);
  const thin = useMemo(() => themes.filter((t) => t.state === 'thin'), [themes]);
  const [selected, setSelected] = useState<string>(ALL_VALUE);

  // No scaffold at all (CoachHelm not enabled / nothing to render).
  if (themes.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No themes yet"
        description="Log a few rounds with shot detail and CoachHelm will surface the strokes-gained themes worth working on — putting, approach, off-the-tee, around-the-green, and your scoring patterns."
      />
    );
  }

  // Brand-new player: the whole scaffold is thin.
  if (substantive.length === 0) {
    return (
      <InsufficientData
        icon={Sparkles}
        title="Not enough rounds yet"
        description="Log a few rounds with shot detail and CoachHelm will surface the strokes-gained themes worth working on — putting, approach, off-the-tee, around-the-green, and your scoring patterns."
      />
    );
  }

  const options: SegmentedOption<string>[] = [
    { value: ALL_VALUE, label: 'All' },
    ...substantive.map((t) => ({ value: t.category as string, label: t.displayLabel })),
  ];

  const visible =
    selected === ALL_VALUE ? substantive : substantive.filter((t) => t.category === selected);

  return (
    <div className="flex flex-col gap-5" data-slot="category-insights-panel">
      {options.length > 2 ? (
        <Segmented
          options={options}
          value={selected}
          onValueChange={setSelected}
          aria-label="Filter insights by part of your game"
        />
      ) : null}

      <div className="flex flex-col gap-6">
        {visible.map((theme) => (
          <CategorySection
            key={theme.category}
            theme={theme}
            onMakePlan={onMakePlan}
            makePlanPendingId={makePlanPendingId}
          />
        ))}
      </div>

      {thin.length > 0 && selected === ALL_VALUE ? (
        <Inset
          padding="sm"
          className="flex flex-wrap items-center gap-2"
          data-slot="category-insights-thin-footer"
        >
          <Eyebrow>Awaiting data</Eyebrow>
          <span aria-hidden className="text-text-tertiary">
            ·
          </span>
          <span className="min-w-0 flex-1 truncate font-fw-sans text-caption text-text-tertiary">
            {thin.map((t) => t.displayLabel).join(', ')}
          </span>
        </Inset>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Category section — one theme's header (label + magnitude + trend) + its
 * causes, rendered as a flat, dividered list rather than a card-in-a-card
 * (this panel already sits inside `DrillPanel`'s own card chrome).
 * ────────────────────────────────────────────────────────────────────────── */

interface CategorySectionProps {
  theme: ThemeNode;
  onMakePlan?: (cause: CauseNode, theme: ThemeNode) => void;
  makePlanPendingId?: string | null;
}

function describeTrend(trend: ThemeTrend): { label: string; cls: string; arrow: string } {
  if (trend.direction === 'steady') {
    return { label: 'Steady', cls: 'text-text-tertiary', arrow: '→' };
  }
  // SG SIGN CONVENTION: higher SG is better → improving = good = success/green.
  // Declining maps to the DANGER token, never amber/warning.
  return trend.direction === 'improving'
    ? { label: 'Improving', cls: 'text-fw-success-ink', arrow: '↗' }
    : { label: 'Declining', cls: 'text-fw-danger-ink', arrow: '↘' };
}

function CategorySection({ theme, onMakePlan, makePlanPendingId }: CategorySectionProps) {
  const { displayLabel, state, themeStrokesPerRound, tourGapPerRound, causes, trend } = theme;
  const magnitude = themeStrokesPerRound.toFixed(1);
  // Anything that rounds to "0.0" at this display's precision reads as noise
  // under a category headline (a zero-leverage row bypassing the impact
  // backfill), so it's treated as "no displayable magnitude" — never a
  // fabricated 0.0 chip. Same guard as `hasDisplayableImpact` in
  // insight-card/InsightCard.tsx.
  const hasMagnitude = Math.round(themeStrokesPerRound * 10) > 0;
  const isLeak = state === 'leak';
  const isStrength = state === 'strength';
  const toTourOnly = hasMagnitude && tourGapPerRound.toFixed(1) === magnitude;
  const trendChip = trend ? describeTrend(trend) : null;

  return (
    <section
      className="flex flex-col gap-3"
      data-slot="category-section"
      data-theme-category={theme.category}
      data-theme-state={state}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-subtle pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 className="truncate font-fw-display text-body-lg font-medium text-text-primary">
            {displayLabel}
          </h3>
          {trendChip ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-fw-sans text-caption font-medium',
                trendChip.cls,
              )}
              data-slot="category-trend"
              data-trend-direction={trend?.direction}
            >
              <span aria-hidden>{trendChip.arrow}</span>
              {trendChip.label}
            </span>
          ) : null}
        </div>

        {(isLeak || isStrength) && hasMagnitude ? (
          <Badge
            tone={isStrength ? 'success' : 'danger'}
            leadingIcon={
              isStrength ? (
                <TrendingUp aria-hidden />
              ) : (
                <TrendingDown aria-hidden />
              )
            }
            className="flex-shrink-0"
          >
            <span className="tabular-nums">{isStrength ? `+${magnitude}` : magnitude}</span>
            <span className="ml-1 font-normal opacity-80">
              strokes/rd {isStrength ? 'vs baseline' : toTourOnly ? 'to Tour' : 'to team avg'}
            </span>
          </Badge>
        ) : null}
      </header>

      {state === 'thin' ? (
        <p className="max-w-prose font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
          Not enough rounds yet — log a few with shot detail (and tag your putt misses) and this
          theme will light up.
        </p>
      ) : causes.length > 0 ? (
        <div className="flex flex-col divide-y divide-border-subtle">
          {causes.map((cause) => (
            <CauseCard
              key={cause.insight_id}
              cause={cause}
              onMakePlan={onMakePlan ? () => onMakePlan(cause, theme) : undefined}
              makePlanPending={makePlanPendingId === cause.insight_id}
            />
          ))}
        </div>
      ) : (
        <p className="max-w-prose font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
          {isStrength
            ? 'Keep doing what’s working here — no leak to address.'
            : 'No specific cause surfaced yet — keep logging rounds to pinpoint it.'}
        </p>
      )}
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Cause card — headline + at-a-glance magnitude, ONE takeaway line by
 * default; full prose, drivers, drills, and the CTA sit behind one expand.
 * ────────────────────────────────────────────────────────────────────────── */

/** Collect cause-level + driver-level drills, de-duped by drill_id, order-stable. */
function collectDrills(cause: CauseNode): DriverLeaf[] {
  const seen = new Set<string>();
  const out: DriverLeaf[] = [];
  const push = (d: DriverLeaf) => {
    if (d.drill_id && seen.has(d.drill_id)) return;
    if (d.drill_id) seen.add(d.drill_id);
    out.push(d);
  };
  for (const d of cause.drills) push(d);
  for (const driver of cause.drivers) for (const d of driver.drills) push(d);
  return out;
}

function driverSourceLabel(source: RootDriver['source']): string {
  switch (source) {
    case 'composite':
      return 'Root driver';
    case 'shot_detail':
      return 'Shot pattern';
    case 'diagnostic':
    default:
      return 'Diagnostic';
  }
}

/** Split cause prose into sentences so the collapsed state can show just the first one. */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface CauseCardProps {
  cause: CauseNode;
  onMakePlan?: () => void;
  makePlanPending?: boolean;
}

function CauseCard({ cause, onMakePlan, makePlanPending = false }: CauseCardProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const drills = collectDrills(cause);
  const hasDrill = drills.length > 0;

  const sentences = useMemo(() => splitSentences(cause.content), [cause.content]);
  const takeaway = sentences[0] ?? cause.content;
  const hasMoreContent = sentences.length > 1;

  const suppressed = cause.counterfactualSuppressed;
  const strokes = cause.strokesSavedPerRound;
  const tourGap = cause.tourGapPerRound;
  // Same "rounds to 0.0 reads as noise" guard as the category header above —
  // a cause with a real but sub-0.05 leverage falls through to no badge
  // rather than a fabricated "0.0 strokes/rd" chip.
  const showStrokesBadge = !suppressed && Math.round(strokes * 10) > 0;
  const toTourOnly = tourGap != null && tourGap.toFixed(1) === strokes.toFixed(1);
  const showTourCeiling = showStrokesBadge && !toTourOnly && tourGap != null && tourGap > strokes;

  const planEnabled = !suppressed && cause.canMakePlan && hasDrill;
  const needsDrill = !suppressed && cause.canMakePlan && !hasDrill;

  return (
    <div
      className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0"
      data-slot="category-cause-card"
      data-cause-id={cause.insight_id}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        // `Button`'s shared base class bakes in `whitespace-nowrap` (correct for
        // its normal short single-line labels). This trigger's content is
        // multi-line (title + a line-clamp-2 takeaway paragraph) — without an
        // explicit reset, every descendant inherits nowrap and silently clips
        // instead of wrapping (line-clamp-2 needs real wrapping to clamp).
        className="group -mx-2 block h-auto min-h-0 w-full whitespace-normal rounded-fw-md px-2 py-1.5 text-left font-normal outline-none focus-visible:ring-offset-surface"
      >
        {/* Button's children contract wants ONE child — everything below is
            phrasing content (spans, not div/p) since it renders inside a
            native <button>. */}
        <span className="flex w-full items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <span className="min-w-0 font-fw-sans text-body-sm font-medium text-text-primary">
                {cause.title}
              </span>
              {showStrokesBadge ? (
                <Badge tone="danger" size="sm" className="flex-shrink-0">
                  <span className="tabular-nums">{strokes.toFixed(1)}</span> strokes/rd
                </Badge>
              ) : suppressed ? (
                <Badge tone="neutral" variant="outline" size="sm" className="flex-shrink-0">
                  Tendency
                </Badge>
              ) : null}
            </span>
            {/* `block` is intentionally omitted: Tailwind's generated stylesheet
                declares `.block` after `.line-clamp-2`, so a literal `block`
                class wins the display-property tie and silences line-clamp's
                own `display:-webkit-box` — the clamp never engages and the
                (now-wrapping) takeaway grows unbounded instead of holding to
                2 lines. `line-clamp-2` already establishes its own block-level
                box, so no separate `block` is needed. */}
            <span className="mt-1 max-w-prose font-fw-sans text-body-sm font-normal leading-relaxed text-text-secondary line-clamp-2">
              {takeaway}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'mt-1 h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform [transition-duration:180ms] motion-reduce:transition-none',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </span>
      </Button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-3 px-2 pb-1 pt-0.5">
          {suppressed ? (
            <p className="max-w-prose font-fw-sans text-caption leading-relaxed text-text-tertiary">
              A directional read from your pattern — there isn&rsquo;t a reliable stroke estimate
              for this yet, so treat it as a tendency to watch rather than a measured leak.
            </p>
          ) : null}

          {showTourCeiling && tourGap != null ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              <span className="tabular-nums">{tourGap.toFixed(1)}</span> from Tour
            </p>
          ) : null}

          {hasMoreContent ? (
            <p className="max-w-prose font-fw-sans text-body-sm leading-relaxed text-text-secondary">
              {cause.content}
            </p>
          ) : null}

          {cause.drivers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {cause.drivers.map((driver, i) => (
                <Inset
                  key={`${cause.insight_id}-driver-${i}`}
                  padding="sm"
                  className="flex flex-col gap-1.5"
                >
                  <Eyebrow>{driverSourceLabel(driver.source)}</Eyebrow>
                  {driver.title ? (
                    <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                      {driver.title}
                    </span>
                  ) : null}
                  {driver.prose ? (
                    <p className="max-w-prose font-fw-sans text-caption leading-relaxed text-text-secondary">
                      {driver.prose}
                    </p>
                  ) : null}
                </Inset>
              ))}
            </div>
          ) : null}

          {hasDrill ? (
            <div className="flex flex-col gap-2">
              <Eyebrow className="inline-flex items-center gap-1.5">
                <Target className="h-3 w-3 text-accent-600" aria-hidden />
                Drills
              </Eyebrow>
              <div className="flex flex-wrap gap-2">
                {drills.map((drill) => (
                  <span
                    key={drill.drill_id || drill.slug || drill.title}
                    className="inline-flex items-center rounded-full border border-border-subtle bg-surface-sunken px-3 py-1 font-fw-sans text-caption font-medium text-text-secondary"
                  >
                    {drill.title}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {suppressed ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              Talk to your coach about this
            </p>
          ) : planEnabled ? (
            <div>
              <Button
                variant="primary"
                size="sm"
                busy={makePlanPending}
                disabled={makePlanPending}
                onClick={onMakePlan}
              >
                Make it a plan
              </Button>
            </div>
          ) : needsDrill ? (
            <Inset padding="sm" className="flex items-center">
              <span className="font-fw-sans text-caption text-text-tertiary">
                No drill yet — talk to your coach.
              </span>
            </Inset>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default CategoryInsightsPanel;
