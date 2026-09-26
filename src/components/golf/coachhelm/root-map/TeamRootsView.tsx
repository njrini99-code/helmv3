'use client';

/**
 * ============================================================================
 * TeamRootsView: the coach landing view of the CoachHelm desk (?view=team)
 * ----------------------------------------------------------------------------
 * Summary first: `RootSummary` for the team (the team-average loss by area,
 * the two biggest shared leaks with how many players carry them, "Needs you",
 * and ONE primary action), then, collapsed by default: the team map by area
 * (`RootMap`, the top causes per losing area by summed team strokes), "Who
 * carries which root" matrix, and the team trend (diverging stacked area)
 * with the "Did the focus work?" before/after slopes.
 *
 * A player name or a matrix cell opens that player's own root map in place
 * (`?view=team&player=<id>&cause=<insightId>`, see `TeamPlayerDrill`), a real
 * navigation so the server builds it and back/forward work.
 *
 * Every number is handed in from the server page, read from stored rows:
 * stats-cache and per-round SG, stored insight evidence, stored
 * attribution. Nothing here computes a statistic or generates text.
 * ========================================================================== */

import { useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button, EmptyState, Sheet } from '@/components/fairway';
import {
  ROOT_AREAS,
  ROOT_AREA_LABEL,
  findBranch,
  formatStrokes,
  type CauseBranch,
  type RootArea,
  type UnsizedCause,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { CoachPlayerDrill } from '@/lib/coachhelm/root-map/coach-player-drill';
import { teamAreaTrend, type AreaTrendNote, type TeamTrendWeek } from '@/lib/coachhelm/root-map/area-trends';
import type { TeamRootsModel } from '@/lib/coachhelm/root-map/build-team-roots';
import type { FocusSlopeRow, NeedsYouItem } from '@/lib/coachhelm/root-map/build-team-extras';
import { playersText } from './root-style';
import { AreaBreakdown, BENCHMARK_LABEL, SpotList, breakdownFootnote, formatPerRound, sampleText } from './LeakList';
import { TeamTrendChart } from './TeamTrendChart';
import { TeamPlayerDrill } from './TeamPlayerDrill';
import { RootSummary, topSpots } from './RootSummary';
import { Disclosure } from './Disclosure';

export interface TeamNavUpdate {
  view?: string;
  filter?: string | null;
  signal?: string | null;
  player?: string | null;
  playersTab?: 'roster' | 'areas' | null;
  cause?: string | null;
}

export interface TeamRootsData {
  model: TeamRootsModel;
  headline: string | null;
  trend: TeamTrendWeek[];
  /** null: attribution is off or its read failed (nothing to show, and we
   *  do not claim "no outcomes"). [] : read fine, nothing has enough rounds. */
  slopes: FocusSlopeRow[] | null;
  needsYou: NeedsYouItem[];
  /** The signal read failed: causes, matrix and needs-you are unknown, not
   *  empty. */
  signalsFailed: boolean;
  /** `?view=team&player=`: that player's root map, built server-side with
   *  the coach's access. Null when no player is requested. */
  drill?: CoachPlayerDrill | null;
}

export interface TeamRootsViewProps extends TeamRootsData {
  hrefFor: (update: TeamNavUpdate) => string;
  navigate: (update: TeamNavUpdate) => void;
  /** Show `drill` instead of the team (the URL still names its player). */
  drillOpen?: boolean;
}

/** A real (pushed) navigation into one player's root map: the server builds
 *  the drill for `?player=`, and the browser's back returns to the team. */
function DrillLink({
  playerId,
  cause,
  hrefFor,
  className,
  children,
  ariaLabel,
  title,
}: {
  playerId: string;
  cause: string | null;
  hrefFor: TeamRootsViewProps['hrefFor'];
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <Link
      href={hrefFor({ view: 'team', player: playerId, cause })}
      scroll={false}
      aria-label={ariaLabel}
      title={title}
      className={className}
      data-slot="team-drill-link"
    >
      {children}
    </Link>
  );
}

/** A link that navigates in place on a plain click and keeps modified clicks
 *  (new tab, etc.) as ordinary links. */
function NavLink({
  update,
  hrefFor,
  navigate,
  className,
  children,
  ariaLabel,
  title,
}: {
  update: TeamNavUpdate;
  hrefFor: TeamRootsViewProps['hrefFor'];
  navigate: TeamRootsViewProps['navigate'];
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <Link
      href={hrefFor(update)}
      replace
      scroll={false}
      aria-label={ariaLabel}
      title={title}
      className={className}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(update);
      }}
    >
      {children}
    </Link>
  );
}

function SectionHead({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-text-primary pb-2">
      <h3 id={id} className="font-fw-display text-body-lg font-semibold text-text-primary">
        {title}
      </h3>
      {note ? <p className="text-caption text-text-tertiary">{note}</p> : null}
    </div>
  );
}

export function TeamRootsView(props: TeamRootsViewProps) {
  const { drill, drillOpen, hrefFor, navigate } = props;
  if (drillOpen && drill) return <TeamPlayerDrill drill={drill} hrefFor={hrefFor} navigate={navigate} />;
  return <TeamRootsOverview {...props} />;
}

function TeamRootsOverview({ model, headline, trend, slopes, needsYou, signalsFailed, hrefFor, navigate }: TeamRootsViewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const spot: CauseBranch | null = openId ? findBranch(model.map, openId) : null;
  const unsizedSpot: UnsizedCause | null = spot ? null : model.map.unsized.find((u) => u.id === openId) ?? null;
  const hasSg = model.playersWithSg > 0;
  const hasCause = model.map.losses.some((a) => a.causes.length > 0) || model.map.unsized.length > 0;
  const leaks = topSpots(model.map, 3);
  const primaryArea = leaks[0]?.area ?? model.map.losses[0]?.area ?? null;
  const trends = Object.fromEntries(ROOT_AREAS.map((a) => [a, teamAreaTrend(trend, a)])) as Record<RootArea, AreaTrendNote | null>;

  const needsSection = (
    <section aria-labelledby="team-needs-heading" className="flex flex-col gap-1 border-t border-border-subtle pt-4">
      <h3 id="team-needs-heading" className="text-body-sm font-semibold text-text-primary">
        Needs you
      </h3>
      {needsYou.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          {signalsFailed ? 'Signals did not load, so this list may be incomplete. Open Signals to retry.' : 'Nothing urgent or changed right now.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {needsYou.map((item) => {
            const body = (
              <>
                <span className="text-body-sm text-text-primary">
                  <span className="font-medium">{item.playerName}</span> · {item.title}
                </span>
                <span className="text-caption text-text-secondary">{item.detail}</span>
              </>
            );
            const rowClass =
              'flex min-h-11 flex-col justify-center gap-0.5 py-2 outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus';
            return (
              <li key={item.key}>
                {item.signalId ? (
                  // A read: open it on the player's own root map.
                  <DrillLink playerId={item.playerId} cause={item.signalId} hrefFor={hrefFor} className={rowClass}>
                    {body}
                  </DrillLink>
                ) : (
                  // A focus area waiting on the coach: its actions live on
                  // the player's focus areas.
                  <NavLink
                    update={{ view: 'players', player: item.playerId, playersTab: 'areas' }}
                    hrefFor={hrefFor}
                    navigate={navigate}
                    className={rowClass}
                  >
                    {body}
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const signalsAction = (
    <Button asChild variant="primary" size="lg" fullWidth>
      <NavLink
        update={{ view: 'signals', filter: primaryArea ? `category:${primaryArea}` : null, signal: null }}
        hrefFor={hrefFor}
        navigate={navigate}
      >
        {primaryArea && primaryArea in ROOT_AREA_LABEL
          ? `Open ${ROOT_AREA_LABEL[primaryArea as RootArea].toLowerCase()} signals`
          : 'Open signals'}
      </NavLink>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6" data-slot="team-roots">
      <header className="flex flex-col gap-1.5">
        <p className="text-caption text-text-secondary">
          {model.rosterSize} {model.rosterSize === 1 ? 'player' : 'players'}
          {hasSg ? ` · ${model.playersWithSg} with strokes gained` : ''} · team average a round
        </p>
        <h2 id="team-roots-heading" className="font-fw-display text-title-2 font-semibold text-text-primary md:text-title-1">
          Where the team loses strokes
        </h2>
      </header>

      {hasSg ? (
        <RootSummary model={model.map} headline={headline} audience="coach" trends={trends} action={signalsAction}>
          {needsSection}
        </RootSummary>
      ) : (
        <section aria-label="Team summary" className="flex flex-col gap-4">
          <EmptyState
            title="No strokes-gained data yet"
            description="This fills in once players have rounds with shot data in the stats cache."
          />
          {needsSection}
          <div>{signalsAction}</div>
        </section>
      )}

      {hasSg && leaks.length > 0 ? (
        <section aria-labelledby="team-leaks-heading" className="flex flex-col gap-1" data-slot="team-leaks">
          <SectionHead id="team-leaks-heading" title="Biggest leaks" note={`a round, ${BENCHMARK_LABEL}`} />
          <SpotList spots={leaks} audience="coach" onSelect={setOpenId} selectedId={openId} />
        </section>
      ) : null}
      {hasSg && !hasCause ? (
        <p className="text-body-sm text-text-secondary">
          {signalsFailed
            ? 'Signals did not load, so spots cannot be shown. Open Signals to retry.'
            : 'No spot under a losing area has a value yet. As player reads land, the biggest leaks show here.'}
        </p>
      ) : null}

      {hasSg ? <PlayersByArea model={model} hrefFor={hrefFor} /> : null}

      {hasSg ? (
        <Disclosure title="Every area" slot="team-map" bodyClassName="flex flex-col gap-3">
          <AreaBreakdown
            model={model.map}
            audience="coach"
            trends={trends}
            onSelect={setOpenId}
            onSelectUnsized={setOpenId}
            selectedId={openId}
          />
          <p className="text-caption text-text-tertiary" data-slot="breakdown-footnote">
            {breakdownFootnote(model.map, 'coach')}
          </p>
          {model.map.other.length > 0 ? (
            <p className="text-body-sm text-text-secondary" data-slot="team-other-reads">
              <span className="font-medium text-text-primary">Other reads under a losing area: </span>
              {model.map.other.map((o) => o.title).join(' · ')}
            </p>
          ) : null}
        </Disclosure>
      ) : null}

      <Disclosure title="Team trend" slot="team-trend" bodyClassName="flex flex-col gap-6">
        {trend.length >= 2 ? (
          <TeamTrendChart weeks={trend} bare />
        ) : (
          <p className="text-body-sm text-text-secondary">
            A trend needs strokes-gained rounds in at least two weeks. It fills in as players log rounds.
          </p>
        )}
        <FocusSlopes slopes={slopes} hrefFor={hrefFor} navigate={navigate} />
      </Disclosure>

      <Sheet
        open={!!(spot || unsizedSpot)}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        side="right"
        mobileSide="bottom"
        title={spot ? `${ROOT_AREA_LABEL[spot.area]} › ${spot.label}` : unsizedSpot ? `${ROOT_AREA_LABEL[unsizedSpot.area]} › ${unsizedSpot.label}` : 'Spot'}
        className="md:w-[min(32rem,calc(100vw-3rem))]"
      >
        <Sheet.Body className="pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-slot="team-spot-sheet">
          {spot || unsizedSpot ? <SpotCarriers spot={spot} unsized={unsizedSpot} hrefFor={hrefFor} /> : null}
        </Sheet.Body>
      </Sheet>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * One spot: who carries it (the sheet a spot row opens)
 * ──────────────────────────────────────────────────────────────────────── */

function SpotCarriers({
  spot,
  unsized,
  hrefFor,
}: {
  spot: CauseBranch | null;
  unsized: UnsizedCause | null;
  hrefFor: TeamRootsViewProps['hrefFor'];
}) {
  const carriers = spot?.carriers ?? unsized?.carriers ?? [];
  const sample = spot ? sampleText(spot) : null;
  return (
    <div className="flex flex-col gap-4">
      {spot ? (
        <p className="text-body text-text-primary">
          <span className="font-semibold tabular-nums">−{formatPerRound(spot.strokes).replace(/^under/, 'under')}</span> strokes a
          round {BENCHMARK_LABEL}, team average{sample ? `, from ${sample}` : ''}.
        </p>
      ) : (
        <p className="text-body text-text-secondary">No stroke value is stored for this spot yet.</p>
      )}
      {spot && spot.contextPath ? <p className="text-body-sm text-text-secondary">Where it concentrates: {spot.contextPath}</p> : null}
      <section aria-labelledby="spot-carriers-heading" className="flex flex-col gap-1">
        <h3 id="spot-carriers-heading" className="text-body-sm font-semibold text-text-primary">
          {carriers.length === 0
            ? 'No player carries it on their own'
            : `${playersText(carriers.length)} losing strokes here`}
        </h3>
        {carriers.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {carriers.map((c) => (
              <li key={c.playerId}>
                <DrillLink
                  playerId={c.playerId}
                  cause={null}
                  hrefFor={hrefFor}
                  ariaLabel={`Open ${c.name}'s map${c.strokes !== null ? `, ${formatPerRound(c.strokes)} strokes a round here` : ''}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <span className="min-w-0 truncate text-body text-text-primary">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-fw-sans text-body tabular-nums text-text-primary">
                      {c.strokes !== null ? `−${formatPerRound(c.strokes)}`.replace('−under', 'under') : 'no value'}
                    </span>
                    <span aria-hidden className="text-text-tertiary">
                      ›
                    </span>
                  </span>
                </DrillLink>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {spot?.measured ? (
        <p className="text-caption text-text-tertiary">Each player’s number is their own strokes a round on this spot.</p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Players by area (strokes a round vs the Tour average)
 * ──────────────────────────────────────────────────────────────────────── */

type SortKey = RootArea | 'total';

function PlayersByArea({ model, hrefFor }: { model: TeamRootsModel; hrefFor: TeamRootsViewProps['hrefFor'] }) {
  const [sort, setSort] = useState<SortKey>('total');
  const valueOf = (r: TeamRootsModel['rows'][number], k: SortKey) => (k === 'total' ? r.sgTotal : r.sg[k]);
  const rows = model.rows
    .slice()
    .sort((a, b) => {
      const va = valueOf(a, sort);
      const vb = valueOf(b, sort);
      if (va === null && vb === null) return a.name.localeCompare(b.name);
      if (va === null) return 1;
      if (vb === null) return -1;
      return va - vb;
    });
  const cols: Array<{ key: SortKey; label: string }> = [
    ...ROOT_AREAS.map((a) => ({ key: a as SortKey, label: ROOT_AREA_LABEL[a] })),
    { key: 'total', label: 'Total' },
  ];
  const teamTotal = ROOT_AREAS.map((a) => model.teamAreaSg[a]).filter((v): v is number => v !== null);
  const cell = (v: number | null) =>
    v === null ? (
      <span className="text-text-tertiary">—</span>
    ) : (
      <span
        className="tabular-nums"
        style={{ color: v >= 0.05 ? 'var(--fw-color-success-ink)' : 'var(--fw-color-text-primary)' }}
      >
        {formatPerRound(v, { signed: true })}
      </span>
    );
  return (
    <section aria-labelledby="team-players-heading" className="flex flex-col gap-2" data-slot="players-by-area">
      <SectionHead id="team-players-heading" title="Players by area" note={`a round, ${BENCHMARK_LABEL}`} />
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-body-sm">
          <caption className="sr-only">
            Strokes a round {BENCHMARK_LABEL} by area for each player, sorted by the selected column, most strokes lost first.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-canvas py-2 pr-3 text-left text-caption font-medium text-text-secondary">
                Player
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort === c.key ? 'ascending' : 'none'} className="p-0 text-right">
                  <button
                    type="button"
                    onClick={() => setSort(c.key)}
                    className={cn(
                      'inline-flex min-h-11 items-center justify-end px-2 text-caption font-medium outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus',
                      sort === c.key ? 'text-text-primary underline underline-offset-4' : 'text-text-secondary',
                    )}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr data-slot="players-team-row">
              <th scope="row" className="sticky left-0 z-10 border-t border-border-subtle bg-canvas py-2 pr-3 text-left font-semibold text-text-primary">
                Team average
              </th>
              {ROOT_AREAS.map((a) => (
                <td key={a} className="border-t border-border-subtle px-2 py-2 text-right font-semibold">
                  {cell(model.teamAreaSg[a])}
                </td>
              ))}
              <td className="border-t border-border-subtle px-2 py-2 text-right font-semibold">
                {cell(teamTotal.length > 0 ? teamTotal.reduce((t, v) => t + v, 0) : null)}
              </td>
            </tr>
            {rows.map((r) => (
              <tr key={r.playerId}>
                <th scope="row" className="sticky left-0 z-10 max-w-[10rem] border-t border-border-subtle bg-canvas p-0 pr-3 text-left font-normal">
                  <DrillLink
                    playerId={r.playerId}
                    cause={null}
                    hrefFor={hrefFor}
                    ariaLabel={`Open ${r.name}'s map`}
                    className="flex min-h-11 items-center truncate text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    {r.name}
                  </DrillLink>
                </th>
                {ROOT_AREAS.map((a) => (
                  <td key={a} className="border-t border-border-subtle px-2 py-2 text-right">
                    {cell(r.sg[a])}
                  </td>
                ))}
                <td className="border-t border-border-subtle px-2 py-2 text-right font-medium">{cell(r.sgTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Did the focus work? (stored before/after, no causal claim)
 * ──────────────────────────────────────────────────────────────────────── */

function formatMetric(v: number, unit: string | null): string {
  if (unit === 'percent') return `${Math.round(v)}%`;
  if (unit === 'strokes') return formatStrokes(v, { signed: true });
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

const TONE_STROKE: Record<FocusSlopeRow['tone'], string> = {
  better: 'var(--fw-viz-div-pos)',
  worse: 'var(--fw-viz-div-neg)',
  flat: 'var(--fw-viz-benchmark)',
  neutral: 'var(--fw-color-text-primary)',
};

function FocusSlopes({
  slopes,
  hrefFor,
  navigate,
}: {
  slopes: FocusSlopeRow[] | null;
  hrefFor: TeamRootsViewProps['hrefFor'];
  navigate: TeamRootsViewProps['navigate'];
}) {
  return (
    <section aria-labelledby="team-focus-heading" className="flex flex-col gap-2">
      <SectionHead id="team-focus-heading" title="Did the focus work?" note="stored before and after" />
      {slopes === null ? (
        <p className="text-body-sm text-text-secondary">Focus before-and-after reads are not available right now.</p>
      ) : slopes.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          None of the before-and-after reads you can see has three or more measured rounds on both sides yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2">
          {slopes.map((s) => {
            const lo = Math.min(s.baseline, s.post);
            const hi = Math.max(s.baseline, s.post);
            const span = hi - lo || 1;
            const y = (v: number) => 34 - ((v - lo) / span) * 28;
            const spoken = `${s.playerName}, ${s.title}: ${s.metricLabel} ${formatMetric(s.baseline, s.unit)} over ${s.nBefore} rounds before, ${formatMetric(s.post, s.unit)} over ${s.nAfter} rounds after. ${s.methodDescription}.`;
            return (
              <li key={s.focusAreaId} className="flex flex-col gap-1">
                <NavLink
                  update={{ view: 'players', player: s.playerId, playersTab: 'areas' }}
                  hrefFor={hrefFor}
                  navigate={navigate}
                  className="flex min-h-11 flex-col gap-1 rounded-fw-sm outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <span className="text-body-sm text-text-primary">
                    <span className="font-medium">{s.playerName}</span> · {s.title}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-right font-fw-mono text-body-sm tabular-nums text-text-secondary">
                      {formatMetric(s.baseline, s.unit)}
                    </span>
                    <svg role="img" aria-label={spoken} viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 min-w-0 flex-1">
                      <line
                        x1={4}
                        x2={96}
                        y1={y(s.baseline)}
                        y2={y(s.post)}
                        style={{ stroke: TONE_STROKE[s.tone] }}
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle cx={4} cy={y(s.baseline)} r={3} style={{ fill: 'var(--fw-color-text-secondary)' }} />
                      <circle cx={96} cy={y(s.post)} r={3} style={{ fill: TONE_STROKE[s.tone] }} />
                    </svg>
                    <span className="w-16 font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                      {formatMetric(s.post, s.unit)}
                    </span>
                  </div>
                  <span className="text-caption text-text-tertiary">
                    {s.metricLabel} · {s.nBefore} rounds before, {s.nAfter} after · {s.methodDescription}
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
