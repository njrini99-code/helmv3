'use client';

/**
 * ============================================================================
 * TeamRootsView: the coach landing view of the CoachHelm desk (?view=team)
 * ----------------------------------------------------------------------------
 * Team root map (Where → What: the top causes per losing area by summed team
 * strokes, sized or outlined) with ONE primary action → "Who carries which
 * root" matrix → team trend (diverging stacked area) → "Did the focus work?"
 * before/after slopes → a short "Needs you" list.
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
import { Button, EmptyState, Eyebrow } from '@/components/fairway';
import {
  CONFIDENCE_LABEL,
  ROOT_AREA_LABEL,
  findBranch,
  formatStrokes,
  rootStyleLabel,
  type CauseBranch,
  type UnsizedCause,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { CoachPlayerDrill } from '@/lib/coachhelm/root-map/coach-player-drill';
import type { TeamTrendWeek } from '@/lib/coachhelm/root-map/area-trends';
import type { TeamRootCell, TeamRootsModel } from '@/lib/coachhelm/root-map/build-team-roots';
import type { FocusSlopeRow, NeedsYouItem } from '@/lib/coachhelm/root-map/build-team-extras';
import { RootBranchList, RootMap, playersText, rootStyleCss } from './RootMap';
import { TeamTrendChart } from './TeamTrendChart';
import { TeamPlayerDrill } from './TeamPlayerDrill';

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

function areaOf(branch: Pick<CauseBranch, 'area'> | null, model: TeamRootsModel): string | null {
  if (branch) return branch.area;
  return model.map.losses[0]?.area ?? null;
}

export function TeamRootsView(props: TeamRootsViewProps) {
  const { drill, drillOpen, hrefFor, navigate } = props;
  if (drillOpen && drill) return <TeamPlayerDrill drill={drill} hrefFor={hrefFor} navigate={navigate} />;
  return <TeamRootsOverview {...props} />;
}

function TeamRootsOverview({ model, headline, trend, slopes, needsYou, signalsFailed, hrefFor, navigate }: TeamRootsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(model.map.defaultSelectedId);
  const selected = selectedId ? findBranch(model.map, selectedId) : null;
  const selectedUnsized: UnsizedCause | null = selected ? null : model.map.unsized.find((u) => u.id === selectedId) ?? null;
  const primaryArea = areaOf(selected ?? selectedUnsized, model);
  const hasSg = model.playersWithSg > 0;
  const hasCause = model.map.losses.some((a) => a.causes.length > 0) || model.map.unsized.length > 0;

  const mapSummary = hasSg
    ? `Team root map. ${model.map.losses
        .map((a) => {
          const causes = [
            ...a.causes.map((c) => `${c.label} ${formatStrokes(c.strokes)}${c.players !== undefined ? `, ${playersText(c.players)}` : ''}`),
            ...model.map.unsized
              .filter((u) => u.area === a.area)
              .map((u) => `${u.label}, not sized${u.players !== undefined ? `, ${playersText(u.players)}` : ''}`),
          ];
          const rest = a.remainder ? `; unexplained ${formatStrokes(a.remainder.strokes)}` : '';
          return `${a.label} ${formatStrokes(a.sg, { signed: true })} a round${causes.length > 0 ? `, top causes: ${causes.join(', ')}` : ''}${rest}`;
        })
        .join('; ')}${model.map.gains.length > 0 ? `. Gaining: ${model.map.gains.map((g) => `${g.label} ${formatStrokes(g.sg, { signed: true })}`).join(', ')}` : ''}.`
    : 'Team root map: no strokes-gained data yet.';

  return (
    <div className="flex flex-col gap-8" data-slot="team-roots">
      <section aria-labelledby="team-roots-heading" className="flex flex-col gap-4">
        <header className="flex flex-col gap-1.5">
          <Eyebrow as="p">
            {model.rosterSize} {model.rosterSize === 1 ? 'player' : 'players'}
            {hasSg ? ` · ${model.playersWithSg} with strokes gained` : ''} · team average per round
          </Eyebrow>
          <h2 id="team-roots-heading" className="font-fw-display text-title-2 font-semibold text-text-primary md:text-title-1">
            <span className="block">Team roots</span>
            {headline ? (
              <span className="mt-1 block font-fw-sans text-body font-normal text-text-secondary md:text-body-lg">{headline}</span>
            ) : null}
          </h2>
        </header>
        {hasSg ? (
          <>
            <RootMap
              model={model.map}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showWhy={false}
              summary={mapSummary}
              lossEyebrow="Team losing · where"
              whatEyebrow="What · top causes"
              figureLabel="Team root map"
              audience="coach"
              unsizedInRow
            />
            <RootBranchList
              model={model.map}
              selectedId={selectedId}
              onSelect={setSelectedId}
              includeUnsized
              label="Team causes"
            />
            {!hasCause && !signalsFailed ? (
              <p className="text-body-sm text-text-secondary">
                No stored cause sits under a losing area yet. As player reads land, the largest causes show here.
              </p>
            ) : null}
            {selected ? (
              <p className="text-body-sm text-text-secondary">
                <span className="font-medium text-text-primary" title={selected.title}>{selected.label}</span> under{' '}
                {ROOT_AREA_LABEL[selected.area]}: {formatStrokes(selected.strokes)} a round across the team
                {selected.players !== undefined ? ` · ${playersText(selected.players)}` : ''}
                {' · '}
                {rootStyleLabel(selected.style, 'coach')}
                {selected.tier ? ` · ${CONFIDENCE_LABEL[selected.tier]}` : ''}
              </p>
            ) : selectedUnsized ? (
              <p className="text-body-sm text-text-secondary">
                <span className="font-medium text-text-primary" title={selectedUnsized.title}>{selectedUnsized.label}</span> under{' '}
                {ROOT_AREA_LABEL[selectedUnsized.area]}: no stroke value stored
                {selectedUnsized.players !== undefined ? ` · ${playersText(selectedUnsized.players)}` : ''}
                {' · '}
                {rootStyleLabel(selectedUnsized.style, 'coach')}
                {selectedUnsized.tier ? ` · ${CONFIDENCE_LABEL[selectedUnsized.tier]}` : ''}. Open a player in the matrix below
                to see why.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No strokes-gained data yet"
            description="The team map fills in once players have rounds with shot data in the stats cache."
          />
        )}
        <div>
          <Button asChild variant="primary" size="lg" fullWidth>
            <NavLink
              update={{ view: 'signals', filter: primaryArea ? `category:${primaryArea}` : null, signal: null }}
              hrefFor={hrefFor}
              navigate={navigate}
            >
              {primaryArea && primaryArea in ROOT_AREA_LABEL
                ? `Open ${ROOT_AREA_LABEL[primaryArea as keyof typeof ROOT_AREA_LABEL]} signals`
                : 'Open signals'}
            </NavLink>
          </Button>
        </div>
      </section>

      <CarriersMatrix model={model} signalsFailed={signalsFailed} hrefFor={hrefFor} />

      {trend.length >= 2 ? (
        <TeamTrendChart weeks={trend} />
      ) : (
        <section aria-labelledby="team-trend-heading" className="flex flex-col gap-2">
          <SectionHead id="team-trend-heading" title="Team trend" />
          <p className="text-body-sm text-text-secondary">
            A trend needs strokes-gained rounds in at least two weeks. It fills in as players log rounds.
          </p>
        </section>
      )}

      <FocusSlopes slopes={slopes} hrefFor={hrefFor} navigate={navigate} />

      <section aria-labelledby="team-needs-heading" className="flex flex-col gap-2">
        <SectionHead id="team-needs-heading" title="Needs you" />
        {needsYou.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            {signalsFailed ? 'Signals did not load, so this list may be incomplete. Open Signals to retry.' : 'Nothing urgent or changed right now.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {needsYou.map((item) => (
              <li key={item.key}>
                <NavLink
                  update={
                    item.signalId
                      ? { view: 'signals', signal: item.signalId }
                      : { view: 'players', player: item.playerId, playersTab: 'areas' }
                  }
                  hrefFor={hrefFor}
                  navigate={navigate}
                  className="flex min-h-11 flex-col justify-center gap-0.5 py-2 outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <span className="text-body-sm text-text-primary">
                    <span className="font-medium">{item.playerName}</span> · {item.title}
                  </span>
                  <span className="text-caption text-text-secondary">{item.detail}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Who carries which root
 * ──────────────────────────────────────────────────────────────────────── */

function cellSpoken(name: string, label: string, cell: TeamRootCell): string {
  const size = cell.strokes !== null ? `${formatStrokes(cell.strokes)} a round` : 'no stroke value stored';
  const tier = cell.tier ? `, ${CONFIDENCE_LABEL[cell.tier]}` : '';
  const where = cell.contextPath ? ` Where it concentrates: ${cell.contextPath}, observed, not a cause.` : '';
  return `${name}: ${label}, ${size}, ${rootStyleLabel(cell.style, 'coach')}${tier}.${where} Open ${name}'s root map at this cause.`;
}

function CarriersMatrix({
  model,
  signalsFailed,
  hrefFor,
}: {
  model: TeamRootsModel;
  signalsFailed: boolean;
  hrefFor: TeamRootsViewProps['hrefFor'];
}) {
  const { columns, rows } = model;
  const maxStrokes = Math.max(
    0,
    ...rows.flatMap((r) => Object.values(r.cells).map((c) => c.strokes ?? 0)),
  );
  return (
    <section aria-labelledby="team-matrix-heading" className="flex flex-col gap-2">
      <SectionHead id="team-matrix-heading" title="Who carries which root" note="tap a player or a cell" />
      {columns.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          {signalsFailed ? 'Signals did not load, so causes cannot be shown. Open Signals to retry.' : 'No open player insights carry a metric yet.'}
        </p>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <table className="w-max min-w-full border-separate border-spacing-0 text-body-sm">
              <caption className="sr-only">
                Players by cause. Circle area is the stored strokes a round; an open ring has no stored stroke value.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-canvas py-2 pr-3 text-left text-caption font-medium text-text-secondary">
                    Player
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.metric}
                      scope="col"
                      abbr={c.label}
                      title={c.label}
                      className={cn(
                        'w-[4.75rem] max-w-[4.75rem] px-1 py-2 align-bottom text-caption font-medium',
                        c.shared ? 'text-text-primary' : 'text-text-secondary',
                      )}
                    >
                      <span className="line-clamp-2 block text-balance leading-tight">
                        <span aria-hidden>{c.shortLabel}</span>
                        <span className="sr-only">{c.label}</span>
                      </span>
                      <span className="block font-normal text-text-tertiary">
                        {c.players}
                        {c.shared ? ' · shared' : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.playerId}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[9rem] border-t border-border-subtle bg-canvas p-0 pr-3 text-left font-normal text-text-primary"
                    >
                      <DrillLink
                        playerId={r.playerId}
                        cause={null}
                        hrefFor={hrefFor}
                        ariaLabel={`Open ${r.name}'s root map`}
                        className="flex min-h-11 flex-col justify-center py-1 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <span className="truncate">{r.name}</span>
                        <span className="block font-fw-mono text-caption tabular-nums text-text-tertiary">
                          {r.sgTotal !== null ? `${formatStrokes(r.sgTotal, { signed: true })} total` : 'no SG yet'}
                        </span>
                      </DrillLink>
                    </th>
                    {columns.map((c) => {
                      const cell = r.cells[c.metric];
                      return (
                        <td
                          key={c.metric}
                          className={cn('border-t border-border-subtle p-0 text-center', c.shared && 'bg-surface-sunken')}
                        >
                          {cell ? (
                            <DrillLink
                              playerId={r.playerId}
                              cause={cell.insightId}
                              hrefFor={hrefFor}
                              ariaLabel={cellSpoken(r.name, c.label, cell)}
                              className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-full outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus"
                            >
                              <Bubble cell={cell} max={maxStrokes} />
                              {cell.contextPath ? (
                                <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-text-primary" />
                              ) : null}
                            </DrillLink>
                          ) : (
                            <span aria-hidden className="block h-11" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {model.hiddenColumns > 0 ? (
            <p className="text-caption text-text-tertiary">
              {model.hiddenColumns} more {model.hiddenColumns === 1 ? 'cause is' : 'causes are'} carried by fewer
              players; see Signals.
            </p>
          ) : null}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary" aria-label="Matrix legend">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={rootStyleCss('likely')} />
              Sized: area is strokes a round
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-dashed border-text-secondary" />
              No stroke value stored
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-4 rounded-sm bg-surface-sunken" />
              Shared by 3+ players
            </li>
            {rows.some((r) => Object.values(r.cells).some((c) => c.contextPath)) ? (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-text-primary" />
                Concentrates by par or shape (open the cell)
              </li>
            ) : null}
          </ul>
        </>
      )}
    </section>
  );
}

function Bubble({ cell, max }: { cell: TeamRootCell; max: number }) {
  if (cell.strokes === null || max <= 0) {
    return <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border border-dashed border-text-secondary" />;
  }
  // Area proportional to strokes: diameter ∝ sqrt(strokes / max), 8..32px.
  const d = 8 + Math.sqrt(Math.max(0, cell.strokes) / max) * 24;
  return (
    <span
      aria-hidden
      className="inline-block rounded-full"
      style={{ width: d, height: d, ...rootStyleCss(cell.style) }}
    />
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
