'use client';

/**
 * ============================================================================
 * TeamRootsView: the coach landing view of the CoachHelm desk (?view=team)
 * ----------------------------------------------------------------------------
 * Team trend (diverging stacked area) → team root map (shared causes only)
 * with ONE primary action → "Who carries which root" matrix → "Did the focus
 * work?" before/after slopes → a short "Needs you" list.
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
  ROOT_STYLE_LABEL,
  findBranch,
  formatStrokes,
  type CauseBranch,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { TeamTrendWeek } from '@/lib/coachhelm/root-map/area-trends';
import type { TeamRootCell, TeamRootsModel } from '@/lib/coachhelm/root-map/build-team-roots';
import type { FocusSlopeRow, NeedsYouItem } from '@/lib/coachhelm/root-map/build-team-extras';
import { RootLegend, RootMap, rootStyleCss } from './RootMap';
import { TeamTrendChart } from './TeamTrendChart';

export interface TeamNavUpdate {
  view?: string;
  filter?: string | null;
  signal?: string | null;
  player?: string | null;
  playersTab?: 'roster' | 'areas' | null;
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
}

export interface TeamRootsViewProps extends TeamRootsData {
  hrefFor: (update: TeamNavUpdate) => string;
  navigate: (update: TeamNavUpdate) => void;
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

function areaOf(branch: CauseBranch | null, model: TeamRootsModel): string | null {
  if (branch) return branch.area;
  return model.map.losses[0]?.area ?? null;
}

export function TeamRootsView({ model, headline, trend, slopes, needsYou, signalsFailed, hrefFor, navigate }: TeamRootsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(model.map.defaultSelectedId);
  const selected = selectedId ? findBranch(model.map, selectedId) : null;
  const primaryArea = areaOf(selected, model);
  const hasSg = model.playersWithSg > 0;
  const hasSharedCause = model.map.losses.some((a) => a.causes.length > 0);

  const mapSummary = hasSg
    ? `Team root map. ${model.map.losses
        .map((a) => `${a.label} ${formatStrokes(a.sg, { signed: true })} a round${a.causes.length > 0 ? `, shared: ${a.causes.map((c) => `${c.label} ${formatStrokes(c.strokes)}`).join(', ')}` : ''}`)
        .join('; ')}${model.map.gains.length > 0 ? `. Gaining: ${model.map.gains.map((g) => `${g.label} ${formatStrokes(g.sg, { signed: true })}`).join(', ')}` : ''}.`
    : 'Team root map: no strokes-gained data yet.';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Eyebrow as="p">
          Team roots · {model.rosterSize} {model.rosterSize === 1 ? 'player' : 'players'}
          {hasSg ? ` · ${model.playersWithSg} with strokes gained` : ''}
        </Eyebrow>
        <h2 className="font-fw-display text-title-1 font-semibold text-text-primary md:text-h1">
          {headline ?? 'Team roots'}
        </h2>
      </header>

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

      <section aria-labelledby="team-map-heading" className="flex flex-col gap-3">
        <SectionHead id="team-map-heading" title="Team root map" note="team average per round" />
        {hasSg ? (
          <>
            <RootMap
              model={model.map}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showWhy={false}
              summary={mapSummary}
              lossEyebrow="Team losing · where"
              whatEyebrow="Shared causes"
              figureLabel="Team root map"
            />
            <RootLegend showWhy={false} />
            {!hasSharedCause && !signalsFailed ? (
              <p className="text-body-sm text-text-secondary">
                No cause is carried by three or more players with a stored stroke value yet. Causes without a stroke
                value still show in the matrix below as open rings.
              </p>
            ) : null}
            {selected ? (
              <p className="text-body-sm text-text-secondary">
                <span className="font-medium text-text-primary">{selected.label}</span> under{' '}
                {ROOT_AREA_LABEL[selected.area]}: {formatStrokes(selected.strokes)} a round across the team
                {' · '}
                {ROOT_STYLE_LABEL[selected.style]}
                {selected.tier ? ` · ${CONFIDENCE_LABEL[selected.tier]}` : ''}
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

      <CarriersMatrix model={model} signalsFailed={signalsFailed} hrefFor={hrefFor} navigate={navigate} />

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
  const where = cell.contextPath ? ` Misses concentrate: ${cell.contextPath}, observed, not a cause.` : '';
  return `${name}: ${label}, ${size}, ${ROOT_STYLE_LABEL[cell.style]}${tier}.${where} Open the signal.`;
}

function CarriersMatrix({
  model,
  signalsFailed,
  hrefFor,
  navigate,
}: {
  model: TeamRootsModel;
  signalsFailed: boolean;
  hrefFor: TeamRootsViewProps['hrefFor'];
  navigate: TeamRootsViewProps['navigate'];
}) {
  const { columns, rows } = model;
  const maxStrokes = Math.max(
    0,
    ...rows.flatMap((r) => Object.values(r.cells).map((c) => c.strokes ?? 0)),
  );
  return (
    <section aria-labelledby="team-matrix-heading" className="flex flex-col gap-2">
      <SectionHead id="team-matrix-heading" title="Who carries which root" note="grouped by the stored metric" />
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
                      className={cn(
                        'w-16 max-w-16 px-1 py-2 align-bottom text-caption font-medium',
                        c.shared ? 'text-text-primary' : 'text-text-secondary',
                      )}
                    >
                      <span className="line-clamp-3 block break-words" title={c.label}>
                        {c.label}
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
                      className="sticky left-0 z-10 max-w-[9rem] truncate border-t border-border-subtle bg-canvas py-1 pr-3 text-left font-normal text-text-primary"
                    >
                      {r.name}
                      <span className="block font-fw-mono text-caption tabular-nums text-text-tertiary">
                        {r.sgTotal !== null ? `${formatStrokes(r.sgTotal, { signed: true })} total` : 'no SG yet'}
                      </span>
                    </th>
                    {columns.map((c) => {
                      const cell = r.cells[c.metric];
                      return (
                        <td
                          key={c.metric}
                          className={cn('border-t border-border-subtle p-0 text-center', c.shared && 'bg-surface-sunken')}
                        >
                          {cell ? (
                            <NavLink
                              update={{ view: 'signals', signal: cell.insightId }}
                              hrefFor={hrefFor}
                              navigate={navigate}
                              ariaLabel={cellSpoken(r.name, c.label, cell)}
                              className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            >
                              <Bubble cell={cell} max={maxStrokes} />
                              {cell.contextPath ? (
                                <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-text-primary" />
                              ) : null}
                            </NavLink>
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
                Misses concentrate by par or shape (open the signal)
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
