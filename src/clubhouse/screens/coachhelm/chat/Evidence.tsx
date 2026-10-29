'use client';

import Link from 'next/link';
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronRight, CircleAlert, Table2 } from 'lucide-react';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { evidenceBlocks, formatValue, readAreaWord, type AskEvidence, type AskRankRow, type AskTable, type AskTeamTable, type EvidenceTile } from '../../../data/coachhelm-chat-thread';
import { coachReadHref } from '../../../data/coachhelm-views-shape';
import { Icon } from '../../../ui/Icon';
import { playerStatsHref } from './Prose';
import { afterRailMove } from '../../../lib/rail-fold';
import { Line } from '../../../ui/charts/Line';
import { changeTone, formatToPar } from '../../../lib/format';
import { plural } from '../../../lib/plural';

/** Who is on the coach's team: a read about anyone else is drawn, never linked. */
type Roster = ReadonlyArray<{ id: string }>;

/**
 * One tool's evidence, as the blocks its shape calls for. Drawn with Clubhouse pieces (the Stats charts depend on stats.css, which this
 * page does not load). `roster`: the coach's own players, so a read the answer names opens that player's Deep dive (CH-13914).
 */
export function AskEvidenceView({ envelope, roster = [] }: { envelope: ToolEnvelope; roster?: Roster }) {
  const blocks = evidenceBlocks(envelope);
  return (
    <div className="ch-th-evidence">
      {blocks.map((block, i) => (
        <AskEvidenceBlock key={i} block={block} roster={roster} />
      ))}
    </div>
  );
}

/** A figure cell: "58%", "−0.4", "+3.1", "E", "—", "6 of 9", "126 attempts", "27 ft". */
const FIGURE = /^(?:[−+-]?[\d.,]+(?:%| ?(?:ft|yds|of \d+|[a-z]+))?(?: \([^)]*\))?|E|—)$/;

/**
 * A table of the figures. `labelledBy`: the id of a visible title that already says what the caption would; the table takes
 * its name from that title instead of repeating it in a hidden caption (a screen reader and a copied transcript read it twice).
 */
export function DataTable({ table, labelledBy }: { table: AskTable; labelledBy?: string }) {
  // A column of figures is set right on tabular numbers; a column of words (a title, a status, a day) reads left, at body weight.
  const numeric = table.columns.map((_, c) => c > 0 && table.rows.length > 0 && table.rows.every((r) => FIGURE.test((r[c] ?? '').trim())));
  return (
    <div className="ch-th-tablewrap">
      <table className="ch-th-table" aria-labelledby={labelledBy}>
        {!labelledBy && <caption className="ch-th-sr">{table.caption}</caption>}
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className={numeric[i] ? 'is-num' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j} className={numeric[j] ? 'is-num' : 'is-text'}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AskEvidenceBlock({ block, bare = false, roster = [] }: { block: AskEvidence; bare?: boolean; roster?: Roster }) {
  if (block.kind === 'unavailable') {
    // A failed read is never "no data": it says it could not read this.
    return (
      <div className="ch-th-read ch-th-read--error" role="status" data-ch-code="CH-13250">
        <Icon icon={CircleAlert} size={15} className="ch-th-read__icon" />
        <p>
          <b>Could not read this:</b> {block.note}
        </p>
      </div>
    );
  }
  if (block.kind === 'empty') {
    return (
      <div className="ch-th-read" data-ch-code="CH-13350">
        <p>
          <b>Nothing recorded for this yet.</b> {block.note}
        </p>
      </div>
    );
  }
  return <Figure block={block} bare={bare} roster={roster} />;
}

/**
 * "View as table": a quiet secondary control (owner, 2026-10-29: the green link on every card was noise). It reads "Table"
 * beside its icon and keeps its full name for a screen reader.
 */
export function TableToggle({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="ch-th-toggle" aria-pressed={pressed} aria-label="View as table" onClick={onToggle} data-ch-code="CH-13852">
      <Icon icon={Table2} size={13} />
      <span aria-hidden="true">Table</span>
    </button>
  );
}

/** The figure's chrome: a title, "View as table", the drawing, then the notes and the source. */
function Figure({ block, bare, roster }: { block: Exclude<AskEvidence, { kind: 'unavailable' | 'empty' }>; bare: boolean; roster: Roster }) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  // A table is already a table: there is nothing to switch to. A comparison draws as a table, and switches to its plain rows.
  const isTable = block.kind === 'table';
  const sameName = Boolean(block.table?.caption) && block.table.caption.trim() === block.title?.trim();
  return (
    <figure className={'ch-th-fig' + (bare ? ' ch-th-fig--bare' : '')} data-kind={block.kind}>
      <div className="ch-th-fig__head">
        <figcaption id={titleId}>{block.title}</figcaption>
        {!isTable && <TableToggle pressed={asTable} onToggle={() => setAsTable((v) => !v)} />}
      </div>
      {isTable || asTable ? <DataTable table={block.table} labelledBy={sameName ? titleId : undefined} /> : <Drawing block={block} roster={roster} />}
      {block.note && <p className="ch-th-fig__note">{block.note}</p>}
      {block.bench && <p className="ch-th-fig__note">{block.bench}</p>}
      {block.source && <p className="ch-th-fig__src">{block.source}</p>}
    </figure>
  );
}

/** One evidence block's drawing alone, without its figure chrome (the composition puts its own heading over it). */
export function Drawing({ block, roster = [] }: { block: Exclude<AskEvidence, { kind: 'unavailable' | 'empty' | 'table' }>; roster?: Roster }) {
  switch (block.kind) {
    case 'compare':
      return <TeamTable team={block.team} label={block.title} />;
    case 'reads':
      return <Reads block={block} roster={roster} />;
    case 'bars':
      return (
        <div className="ch-th-bars" role="list" aria-label={block.title}>
          {block.rows.map((r, i) => (
            <div key={r.label} style={{ '--ch-i': i } as CSSProperties} className={'ch-th-bar' + (r.highlight ? ' is-on' : '')} role="listitem" data-tone={r.tone}>
              <span className="ch-th-bar__label">{r.label}</span>
              <span className="ch-th-bar__track" aria-hidden="true">
                <span style={{ width: `${r.pct}%` }} />
              </span>
              <span className="ch-th-bar__val">
                {r.display}
                {r.of && <span> {r.of}</span>}
              </span>
            </div>
          ))}
        </div>
      );
    case 'ranking':
      return <Ranking rows={block.rows} signed={block.signed} label={block.title} />;
    case 'tiles':
      return <Tiles tiles={block.tiles} />;
    case 'legs':
      return <Legs block={block} />;
    case 'trend':
      return <Trend block={block} />;
  }
}

/**
 * The reads an answer names for one player (CH-13914): each opens that player's Deep dive on the coach Player page, on that read
 * (`?view=deep-dive&player=&insight=`). Only for a player on the coach's own team; anyone else's reads are drawn as plain rows,
 * never a link to a page that would only say "isn't on your team".
 */
function Reads({ block, roster }: { block: Extract<AskEvidence, { kind: 'reads' }>; roster: Roster }) {
  return (
    <ul className="ch-th-reads" aria-label={block.title} data-ch-code="CH-13914">
      {block.rows.map((r) => {
        const href = coachReadHref(block.playerId, r.id, roster);
        const body = (
          <>
            <span className="ch-th-reads__b">
              {r.category && <small>{readAreaWord(r.category)}</small>}
              <b>{r.title}</b>
            </span>
            {r.value && <span className="ch-th-reads__v">{r.value}</span>}
          </>
        );
        return (
          <li key={r.id}>
            {href ? (
              <Link href={href} className="ch-th-reads__r">
                {body}
                <Icon icon={ChevronRight} size={15} />
              </Link>
            ) : (
              <span className="ch-th-reads__r">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Tiles({ tiles }: { tiles: EvidenceTile[] }) {
  return (
    <div className="ch-th-tiles">
      {tiles.map((t, i) => (
        <div key={i} className="ch-th-tile" data-tone={t.tone}>
          <span className="ch-th-tile__label">{t.label}</span>
          <b className="ch-th-tile__value">{t.value}</b>
          {t.sub && <span className="ch-th-tile__sub">{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function Legs({ block }: { block: Extract<AskEvidence, { kind: 'legs' }> }) {
  const max = Math.max(0.01, ...block.rows.map((r) => Math.abs(r.value)));
  return (
    <div>
      <div className="ch-th-legs" role="list" aria-label={block.title}>
        {block.rows.map((r) => {
          // The side and the tone come from the value as it prints (one decimal): a leg shown as 0.0 draws no bar (A2).
          const tone = changeTone(r.value, false, 1);
          return (
            <div key={r.label} className="ch-th-leg" role="listitem" data-sign={tone === 'is-gain' ? 'gain' : tone === 'is-loss' ? 'loss' : undefined}>
              <span className="ch-th-leg__label">{r.label}</span>
              <span className="ch-th-leg__track" aria-hidden="true">
                {tone && <span style={{ width: `${(Math.abs(r.value) / max) * 50}%` }} />}
              </span>
              <span className="ch-th-leg__val">{r.display}</span>
            </div>
          );
        })}
      </div>
      <p className="ch-th-fig__take">{block.takeaway}</p>
    </div>
  );
}

/** The width the trend is drawn at before it is measured (and in tests): the phone's column. */
const W0 = 360;
const H = 150;
/** Where the reference's words go so they never sit on the line (P013 D3); it lives with the one line chart now (B5). */
export { placeRefLabel } from '../../../ui/charts/Line';

/**
 * Movement over time, on the one line chart (ui/charts/Line, B5), with the reference drawn dashed so a last point reads
 * against something; a finger or the arrow keys read each point. The text equivalent is the label and the table. Drawn at
 * the width it is given (measured), so its type stays at the token size instead of scaling with the column (P013 D3).
 */
export function Trend({ block, drawIn = false }: { block: Extract<AskEvidence, { kind: 'trend' }>; drawIn?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(W0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setW(w);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    // Once the sidebar's fold has settled, not on every frame of it (lib/rail-fold.ts).
    const ro = new ResizeObserver(() => afterRailMove(read));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const values = block.points.map((p) => p.value);
  const all = block.reference ? [...values, block.reference.value] : values;
  let lo = block.unit === 'percent' ? 0 : Math.min(...all);
  let hi = block.unit === 'percent' ? 100 : Math.max(...all);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const pad = block.unit === 'percent' ? 0 : (hi - lo) * 0.12;
  // A lower-is-better metric (scoring, putts) is drawn with lower values higher, so better is always up (A8.1).
  const down = block.goodDirection === 'down';
  const last = values[values.length - 1] as number;
  const ref = block.reference;
  // Amber when the last point is on the wrong side of the reference for a metric whose direction is known; never red.
  const worse = ref && block.goodDirection ? (block.goodDirection === 'up' ? last < ref.value : last > ref.value) : false;
  // A to-par score is signed, with E for even ("+3", "E", "−1"), on the line and its reference alike.
  const fmt = (v: number) => (block.toPar ? formatToPar(v, Number.isInteger(v) ? 0 : 1) : formatValue(v, block.unit));
  const label = `${block.summary}${down ? ' Lower is better.' : ''} ${block.points.map((p) => `${p.label} ${fmt(p.value)}`).join(', ')}.`;
  const refText = ref ? (ref.label.startsWith('Team') ? ref.label : `${ref.label} ${fmt(ref.value)}`) : '';
  return (
    <div ref={box} className="ch-th-trendbox">
      <Line
        className={'ch-th-trend' + (worse ? ' is-loss' : '')}
        label={label}
        points={block.points.map((p) => ({ x: p.label, y: p.value }))}
        lowerIsBetter={down}
        domain={[lo - pad, hi + pad]}
        baseline={ref ? { value: ref.value, label: refText, dashed: true } : undefined}
        format={fmt}
        marks="trail"
        ends="spread"
        readAt="tip"
        // The block's own "as a table" view is its data table (DataTable).
        table={false}
        width={W}
        height={H}
        drawIn={drawIn}
      />
      {down && (
        <p className="ch-th-dir" aria-hidden="true">
          Lower is better
        </p>
      )}
    </div>
  );
}

/**
 * Players ranked on one metric (playbook §1, owner 2026-10-29: the initials list was the only team visual): rank, name, the
 * sample in words, the figure, and a bar on one fitted axis. Strokes gained runs either side of zero, green above and amber
 * below; any other metric marks its best by the metric's own direction.
 */
export function Ranking({ rows, signed, label, highlight }: { rows: AskRankRow[]; signed: boolean; label: string; highlight?: string | null }) {
  return (
    <ol className={'ch-th-rank' + (signed ? ' is-signed' : '')} aria-label={label}>
      {rows.map((r, i) => {
        const href = playerStatsHref(r.id);
        const side = r.value < 0 ? 'neg' : 'pos';
        return (
          <li key={r.id} data-tone={r.tone} className={highlight && highlight === r.id ? 'is-on' : undefined} style={{ '--ch-i': i } as CSSProperties}>
            <span className="ch-th-rank__n">{r.rank}</span>
            <span className="ch-th-rank__who">
              {href ? (
                <Link href={href} className="ch-th-rank__name">
                  {r.label}
                </Link>
              ) : (
                <span className="ch-th-rank__name">{r.label}</span>
              )}
              {r.of && <span className="ch-th-rank__of">{r.of}</span>}
            </span>
            <span className="ch-th-rank__track" aria-hidden="true">
              <span className="ch-th-rank__bar" data-side={signed ? side : undefined} style={{ width: `${signed ? r.pct / 2 : r.pct}%` }} />
            </span>
            <b className="ch-th-rank__val ch-num">{r.display}</b>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Players across the same metrics (owner, 2026-10-29: a team table, up to 12 players). With more players than metrics the
 * players are rows and the metrics columns; otherwise the other way round. The best figure in each metric is marked by that
 * metric's own direction, and strokes gained is coloured by its sign against the baseline.
 */
export function TeamTable({ team, label }: { team: AskTeamTable; label: string }) {
  const anySg = team.metrics.some((m) => m.strokes);
  const cell = (pi: number, mi: number) => {
    const c = team.cells[pi]?.[mi];
    const best = team.best[mi] === team.players[pi]?.id;
    return (
      <td key={`${pi}-${mi}`} className="is-num" data-tone={c?.tone === 'plain' ? undefined : c?.tone}>
        <span className={'ch-th-team__v ch-num' + (best ? ' is-best' : '')}>
          {best && <span className="ch-th-team__dot" aria-hidden="true" />}
          {c?.display ?? '—'}
          {best && <span className="ch-th-sr"> (best)</span>}
        </span>
      </td>
    );
  };
  return (
    <div className="ch-th-team">
      <div className="ch-th-tablewrap">
        <table className="ch-th-table ch-th-team__table">
          <caption className="ch-th-sr">{`${label}: ${plural(team.players.length, 'player')} across ${plural(team.metrics.length, 'metric')}; the best in each is marked.`}</caption>
          {team.playersAsRows ? (
            <>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  {team.metrics.map((m) => (
                    <th key={m.id} scope="col" className="is-num" title={m.label}>
                      {m.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.players.map((p, pi) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className="ch-th-team__name">{p.label}</span>
                      {p.sample && <span className="ch-th-team__of">{p.sample}</span>}
                    </th>
                    {team.metrics.map((_, mi) => cell(pi, mi))}
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {team.players.map((p) => (
                    <th key={p.id} scope="col" className="is-num">
                      <span className="ch-th-team__name">{p.label}</span>
                      {p.sample && <span className="ch-th-team__of">{p.sample}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.metrics.map((m, mi) => (
                  <tr key={m.id}>
                    <th scope="row">{m.label}</th>
                    {team.players.map((_, pi) => cell(pi, mi))}
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      {anySg && <p className="ch-th-team__key">Strokes gained is against the baseline: above zero gains strokes on it, below zero loses them.</p>}
    </div>
  );
}
