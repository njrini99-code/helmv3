'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type CSSProperties, type KeyboardEvent } from 'react';
import type { ChTeamStats } from '../../data/stats-team';
import { basisWords, type ChFilter } from '../../data/stats-filter';
import { changeInk, changeTone, NO_DATA } from '../../lib/format';
import { useChSessionState } from '../../lib/session-state';
import { useChartPin } from '../../lib/use-chart-pin';
import { EmptyState } from '../../ui/States';
import { Select } from '../../ui/Select';
import { teamPlayerHref } from './links';
import { formatRankValue, metricDef, rankLabel, rankReadout, rankScale, rankSummary, teamMeanFor, teamRankRows, TEAM_RANK_METRICS, type TeamRankMetric } from './team-rank';

export type TeamRankData = Pick<ChTeamStats, 'grid' | 'team' | 'legTotals' | 'filter'>;

const pct = (v: number) => `${v.toFixed(2)}%`;

/**
 * P004: who gains and who loses strokes, as a ranked dot plot (stats-visuals spec 4.5, decision Q10). One row per player, one
 * figure at a time from a compact menu (strokes gained in total or by leg, or the scoring average), each player's mean as a dot
 * with a whisker of one standard error, and the team's mean as a dashed line. Better is to the right for every figure (the
 * scoring average, where lower is better, runs the other way and says so). Rows are in order of the dot; a player closer
 * than one standard error of the difference to the head of the run above shares its rank ("T3") and keep their order. An early read is a hollow dot with
 * no gain or loss color; a player under the floor has a row that says what they need and no dot.
 *
 * A pointer over a row, a tap, or the arrow keys read a player in the line above; a tap or a key pins them and offers
 * "Open player", and a second tap on the pinned row (or Enter) opens them. The grid ledger below stays the table and the CSV.
 * `phone` draws the same plot as an inset panel with 44px rows.
 */
export function TeamRank({ data, phone = false }: { data: TeamRankData; phone?: boolean }) {
  const router = useRouter();
  const [stored, setMetric] = useChSessionState<TeamRankMetric>('team-rank-metric', 'sg');
  const metric = metricDef(stored).value;
  const def = metricDef(metric);
  const rows = teamRankRows(data.grid, metric);
  const mean = teamMeanFor(metric, data.team, data.legTotals);
  const scale = rankScale(rows, mean, metric, phone ? 3 : 5);
  const pin = useChartPin(rows.length, 'y');
  // The pin is a row index, so a new order (another figure, a new window) must let go of it or it would point at someone else.
  const order = rows.map((r) => r.id).join('|');
  const { clear } = pin;
  useEffect(() => clear(), [order, clear]);
  const ranked = rows.filter((r) => r.rank != null).length;
  const href = (i: number) => teamPlayerHref(rows[i]!.id, data.filter);
  const readout = (i: number | null) => (i == null ? null : rankReadout(rows[i]!, metric, ranked, mean));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  const early = rows.filter((r) => r.state === 'early');
  const sg = !def.lowerIsBetter;
  const fmt = (v: number) => formatRankValue(metric, v);
  const tone = (v: number) => (sg ? ' ' + changeTone(v, false, 1) : '');

  const row = (r: (typeof rows)[number], i: number) => {
    const item = pin.item(i);
    // A second tap on the pinned player opens them; the first pins (the row is aria-hidden: the group's keys and the grid's links reach the same).
    const press = { ...item, onClick: () => (pin.pinned === i ? router.push(href(i)) : item.onClick()) };
    const lo = r.value != null && r.se != null ? scale.at(r.value - r.se) : null;
    const hi = r.value != null && r.se != null ? scale.at(r.value + r.se) : null;
    return (
      <div
        key={r.id}
        className={'ch-sv-tr__r ch-sv-row' + (r.state === 'early' ? ' is-early' : '') + (r.value == null ? ' is-none' : '')}
        {...press}
      >
        <span className="ch-sv-tr__rank ch-num">{rankLabel(r)}</span>
        <span className="ch-sv-tr__who">{phone ? r.short : r.name}</span>
        <span className="ch-sv-tr__track">
          {lo != null && hi != null && <i className="ch-sv-whisk" style={{ left: pct(Math.min(lo, hi)), width: pct(Math.abs(hi - lo)) }} />}
          {r.value != null && <b className={'ch-sv-tr__dot' + (r.state === 'early' ? '' : tone(r.value))} style={{ left: pct(scale.at(r.value)) }} />}
          {r.value == null && <span className="ch-sv-tr__needs">{r.tag}</span>}
        </span>
        <span className={'ch-sv-tr__v ch-num ' + (r.state === 'early' || !sg ? '' : changeInk(r.value))}>{r.value == null ? NO_DATA : fmt(r.value)}</span>
      </div>
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && pin.pinned != null) {
      e.preventDefault();
      router.push(href(pin.pinned));
      return;
    }
    pin.container.onKeyDown(e);
  };

  const group = { ...pin.container, onKeyDown };

  const menu = (
    <span className="ch-sv-tr__menu">
      <Select<TeamRankMetric> label="Rank players by" value={metric} options={TEAM_RANK_METRICS.map((m) => ({ value: m.value, label: m.label }))} onChange={setMetric} />
    </span>
  );
  const sub = `${sg ? 'Per round' : 'Per 18 holes'} · ${basis(data.filter)}${sg ? '' : ' · lower is better, so better is to the right'}`;

  const body =
    rows.length === 0 ? (
      <EmptyState code="CH-4305" compact title="No player rounds in this window." />
    ) : (
      <div
        className="ch-sv-tr__plot"
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each player, as a scroll region is focusable to scroll
        tabIndex={0}
        aria-label={`${rankSummary(rows, metric, mean)} Use the arrow keys to read each player and Enter to open one.`}
        {...group}
      >
        <div className="ch-sv-tr__top">
          <p className={'ch-sv-read' + (shown ? ' is-on' : '')} aria-hidden="true">
            {shown ?? (phone ? 'Tap a player to read them; tap again to open.' : 'Select a player to read how sure their figure is; select again to open them.')}
          </p>
          {pin.pinned != null && (
            <Link href={href(pin.pinned)} className="ch-sv-open" data-ch-press="">
              Open player
            </Link>
          )}
        </div>
        <p className="ch-sr-only" aria-live="polite">
          {spoken}
        </p>
        <div className="ch-sv-tr__body" aria-hidden="true" style={{ '--ch-tr-none': rows.length - ranked } as CSSProperties}>
          <div className="ch-sv-tr__field">
            {scale.ticks.map((t) => (
              <i key={t} className={'ch-sv-tr__grid' + (sg && t === 0 ? ' is-zero' : '')} style={{ left: pct(scale.at(t)) }} />
            ))}
            {sg && !scale.ticks.includes(0) && <i className="ch-sv-tr__grid is-zero" style={{ left: pct(scale.at(0)) }} />}
            {mean != null && <u className="ch-sv-tr__mean" style={{ left: pct(scale.at(mean)) }} />}
          </div>
          <div className="ch-sv-tr__r is-cap">
            <span />
            <span />
            <span className="ch-sv-tr__track">
              {mean != null && (
                <span className="ch-sv-tr__meanlab ch-num" style={{ '--ch-tr-at': pct(scale.at(mean)) } as CSSProperties}>
                  Team {fmt(mean)}
                </span>
              )}
            </span>
            <span />
          </div>
          {rows.slice(0, ranked).map((r, i) => row(r, i))}
          <div className="ch-sv-tr__r is-axis">
            <span />
            <span />
            <span className="ch-sv-tr__track">
              {scale.ticks.map((t) => (
                <span key={t} className="ch-sv-tr__tick ch-num" style={{ '--ch-tr-at': pct(scale.at(t)) } as CSSProperties}>
                  {fmt(t).replace(/\.0$/, '')}
                </span>
              ))}
            </span>
            <span />
          </div>
          {/* Players under the floor follow the axis: no dot, so the plot's lines stop above them. */}
          {rows.slice(ranked).map((r, k) => row(r, ranked + k))}
        </div>
        <p className="ch-sv-tr__key" aria-hidden="true">
          <span>
            <b className="ch-sv-tr__kdot" />
            {sg ? 'Player, a round' : 'Player’s average'}
          </span>
          <span>
            <i className="ch-sv-tr__kwhisk" />
            Likely range
          </span>
          {mean != null && (
            <span>
              <u className="ch-sv-tr__kmean" />
              Team
            </span>
          )}
          {rows.some((r) => r.tied) && <span>T: tied, closer than their likely ranges can tell apart</span>}
        </p>
        {early.length > 0 && (
          <p className="ch-sv-note" aria-hidden="true">
            Hollow dots are early reads ({early.map((r) => (phone ? r.short : r.name)).join(', ')}) and can still move a lot.
          </p>
        )}
      </div>
    );

  if (phone)
    return (
      <section className="ch-stm-panel ch-sv-tr is-phone" aria-labelledby="ch-stm-rank">
        <div className="ch-stm-panel__h">
          <h2 id="ch-stm-rank">Who gains and loses</h2>
          {menu}
        </div>
        <div className="ch-stm-group ch-sv-tr__inset">{body}</div>
        <p className="ch-stm-note">{sub}.</p>
      </section>
    );
  return (
    <section className="ch-sv-tr" aria-labelledby="ch-sv-tr-h">
      <div className="ch-sgt__head">
        <div>
          <h2 id="ch-sv-tr-h">Who gains and loses</h2>
          <span>{sub}</span>
        </div>
        {menu}
      </div>
      {body}
    </section>
  );
}

/** Which rounds the plot reads, in a clause: the window's own words, or what the filter selects. */
function basis(filter: ChFilter): string {
  const b = basisWords(filter);
  return b.charAt(0).toLowerCase() + b.slice(1);
}
