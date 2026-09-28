'use client';

/**
 * ============================================================================
 * TeamShotWeaknesses — the team's costliest shot situations
 * ----------------------------------------------------------------------------
 * Reads `getTeamOverview`'s `teamShotAnalysis`, and says exactly what that
 * payload measures, no more:
 *
 *   · topWeaknesses: shot situations (starting lie + distance band) with 15+
 *     team shots in the last 90 days, ranked by average strokes gained PER
 *     SHOT against the PGA Tour baseline (`rankWeaknessContexts`), top five.
 *     Distance is feet on the green, yards everywhere else.
 *   · deadZones: 25-yard bands where the team averages more than 0.2 strokes
 *     lost per shot (every lie, putts excluded, 15+ shots).
 *
 * Accuracy notes the old panel got wrong or left out:
 *   · The lie is shown as recorded. `golf_shots.lie_before` allows tee,
 *     fairway, rough, sand, green, other and penalty; the baseline has no
 *     "other" or "penalty" rows, so the engine prices those against the
 *     Tour's FAIRWAY expectation at that distance and they read harsher than
 *     a real rough or recovery number would. Such a row says "Other lie" or
 *     "Penalty lie" with an asterisk, and the footnote says why.
 *   · A tee shot is not labelled "off the tee": a par-3 tee shot is an
 *     approach, and the payload carries no par. The lie is the honest label.
 *   · Every figure is strokes gained and says so on the number itself
 *     ("−0.45 SG/shot", "−10.8 SG total"), not only in a footnote: a coach
 *     reported strokes gained "missing" when it was only unlabelled. The
 *     total is the per-shot average times the shot count.
 *   · A situation where the team GAINS strokes is not a weakness and is not
 *     listed, even if the ranking handed it over.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { EmptyState, InlineNotice } from '@/components/fairway';
import type { TeamShotAnalysis } from '@/app/golf/actions/team-category-insights';

export interface TeamShotWeaknessesProps {
  /** `undefined` when the overview read failed (see `unavailable`) or the
   *  payload never arrived. */
  data: TeamShotAnalysis | undefined;
  /** The overview read failed: say so here rather than "no data yet". */
  unavailable?: boolean;
  className?: string;
}

const TWO_DECIMALS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const COUNT = new Intl.NumberFormat('en-US');

const LIE_PHRASE: Record<string, string> = {
  tee: 'From the tee',
  fairway: 'From the fairway',
  rough: 'From the rough',
  sand: 'From sand',
  bunker: 'From sand',
  recovery: 'Recovery shot',
  other: 'Other lie',
  penalty: 'Penalty lie',
};

/** Lies the SG baseline has no rows for: `lookupBaseline` falls back to the
 *  fairway expectation at the same distance. */
const NO_BASELINE = new Set(['other', 'penalty']);

/** "0-25" → "0–25"; "250+" stays. En dash for a numeric range. */
function formatRange(range: string): string {
  return range.replace('-', '–');
}

/** Strokes LOST, as a positive magnitude, printed with a true minus. */
function lost(value: number, digits: 'one' | 'two' = 'two'): string {
  const f = digits === 'two' ? TWO_DECIMALS : ONE_DECIMAL;
  return `−${f.format(Math.abs(value))}`;
}

export interface WeaknessRow {
  key: string;
  distance: string;
  lie: string;
  /** Benchmarked against the fairway because the lie has no baseline. */
  noBaseline: boolean;
  isPutt: boolean;
  perShot: number;
  total: number;
  shotCount: number;
}

/** The payload's weaknesses, as display rows: losing situations only, worst
 *  per shot first. */
export function buildWeaknessRows(data: TeamShotAnalysis | undefined): WeaknessRow[] {
  return (data?.topWeaknesses ?? [])
    .filter((w) => Number.isFinite(w.avgSG) && w.avgSG < 0 && w.shotCount > 0)
    .map((w, i) => {
      const isPutt = w.lie === 'green';
      const unit = isPutt ? 'ft' : 'yd';
      const lie = isPutt ? 'Putts' : (LIE_PHRASE[w.lie] ?? `From ${w.lie.replace(/_/g, ' ')}`);
      return {
        key: `${w.context}-${i}`,
        distance: `${formatRange(w.distanceRange)} ${unit}`,
        lie,
        noBaseline: NO_BASELINE.has(w.lie),
        isPutt,
        perShot: w.avgSG,
        total: w.avgSG * w.shotCount,
        shotCount: w.shotCount,
      };
    })
    .sort((a, b) => a.perShot - b.perShot);
}

function Header({ className }: { className?: string }) {
  return (
    <div className={cn('fw-plinth-green flex items-center justify-between gap-3 px-4 py-3 sm:px-5', className)}>
      <h2 id="team-shot-weaknesses-heading" className="font-fw-sans text-h3 font-semibold text-text-primary">
        Team shot weaknesses
      </h2>
      <span className="shrink-0 font-fw-sans text-caption text-text-secondary">Last 90 days</span>
    </div>
  );
}

const CARD =
  'flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft [container-type:inline-size]';

export function TeamShotWeaknesses({ data, unavailable = false, className }: TeamShotWeaknessesProps) {
  const rows = buildWeaknessRows(data);
  const deadZones = (data?.deadZones ?? [])
    .filter((dz) => Number.isFinite(dz.deficit) && dz.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  if (unavailable) {
    return (
      <section aria-labelledby="team-shot-weaknesses-heading" className={cn(CARD, className)}>
        <Header />
        <div className="p-4 sm:p-5">
          <InlineNotice tone="warning" title="Shot analysis didn't load">
            The team overview failed, so there is nothing to rank. Try again from the notice at the top of the page.
          </InlineNotice>
        </div>
      </section>
    );
  }

  if (rows.length === 0 && deadZones.length === 0) {
    return (
      <section aria-labelledby="team-shot-weaknesses-heading" className={cn(CARD, className)}>
        <Header />
        <div className="p-4 sm:p-5">
          <EmptyState
            variant="subtle"
            title="No shot-level weaknesses yet"
            description="A situation needs 15 team shots in the last 90 days before it is ranked. Shot-by-shot rounds fill this in."
          />
        </div>
      </section>
    );
  }

  const worst = Math.max(...rows.map((r) => Math.abs(r.perShot)), 0.0001);
  const worstZone = Math.max(...deadZones.map((dz) => dz.deficit), 0.0001);
  const hasNoBaseline = rows.some((r) => r.noBaseline);

  return (
    <section aria-labelledby="team-shot-weaknesses-heading" className={cn(CARD, className)}>
      <Header />

      <div
        className={cn(
          'grid grid-cols-1',
          deadZones.length > 0 &&
            '[@container(min-width:880px)]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] [@container(min-width:880px)]:divide-x [@container(min-width:880px)]:divide-border-subtle',
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Strokes gained (SG) per shot against the PGA Tour baseline, worst situation first.
          </p>
          {rows.length > 0 ? (
            <ol className="flex flex-col divide-y divide-border-subtle">
              {rows.map((row, index) => (
                <li key={row.key} className="flex min-w-0 items-start gap-3 py-3 first:pt-1 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-sunken font-fw-sans text-caption font-semibold tabular-nums text-text-secondary"
                  >
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-fw-sans text-body font-semibold tabular-nums text-text-primary">
                          {row.distance}
                        </p>
                        <p className="font-fw-sans text-caption text-text-tertiary">
                          <span className={cn(row.noBaseline && 'font-medium text-text-secondary')}>
                            {row.lie}
                            {row.noBaseline ? <span aria-hidden="true">*</span> : null}
                            {row.noBaseline ? (
                              <span className="sr-only"> (measured against the fairway baseline)</span>
                            ) : null}
                          </span>
                          {' · '}
                          <span className="tabular-nums">
                            {COUNT.format(row.shotCount)} {row.isPutt ? 'putts' : 'shots'}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-fw-sans text-body font-semibold tabular-nums text-fw-danger-ink">
                          {lost(row.perShot)}
                          <span className="ml-1 font-fw-sans text-caption font-medium text-text-tertiary">
                            SG/shot
                          </span>
                        </p>
                        <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                          {lost(row.total, 'one')} SG total
                        </p>
                      </div>
                    </div>
                    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className="block h-full rounded-full bg-fw-danger"
                        style={{
                          width: `${Math.max(6, (Math.abs(row.perShot) / worst) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="font-fw-sans text-body-sm text-text-tertiary">
              No situation with 15 or more shots is losing strokes against the baseline.
            </p>
          )}
        </div>

        {deadZones.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-3 border-t border-border-subtle p-4 sm:p-5 [@container(min-width:880px)]:border-t-0">
            <div>
              <h3 className="font-fw-sans text-body font-semibold text-text-primary">Dead zones</h3>
              <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">
                Distance bands where the team loses more than 0.2 strokes gained per shot, from any lie.
              </p>
            </div>
            <ul className="flex flex-col gap-2.5">
              {deadZones.map((dz) => (
                <li key={`${dz.rangeStart}-${dz.rangeEnd}`} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-fw-sans text-body-sm font-medium tabular-nums text-text-primary">
                      {dz.rangeStart}&ndash;{dz.rangeEnd} yd
                    </span>
                    <span className="font-fw-sans text-body-sm font-semibold tabular-nums text-fw-danger-ink">
                      {lost(dz.deficit)}
                      <span className="ml-1 font-fw-sans text-caption font-medium text-text-tertiary">SG/shot</span>
                    </span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className="block h-full rounded-full bg-fw-warning"
                      style={{
                        width: `${Math.max(6, (dz.deficit / worstZone) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 border-t border-border-subtle px-4 py-3 font-fw-sans text-caption text-text-tertiary sm:px-5">
        <p>
          SG is strokes gained against the PGA Tour baseline; below zero means strokes lost. Situations need 15 or
          more team shots in the last 90 days to be ranked. Putts are measured in feet, everything else in yards, and
          putts are left out of the dead zones.
        </p>
        {hasNoBaseline ? (
          <p>
            * There is no Tour baseline for an &ldquo;other&rdquo; or penalty lie, so those shots are measured against
            the fairway expectation at the same distance and read harsher than they would against a baseline of their
            own.
          </p>
        ) : null}
      </div>
    </section>
  );
}
