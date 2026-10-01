import type { ReactNode } from 'react';
import type { ChWindow } from '../../data/stats-common';
import type { ChSprayGroup } from '../../data/stats-detail';
import { NO_DATA } from '../../lib/format';
import { ScrollRegion } from '../../ui/ScrollRegion';

/**
 * The parts Game detail's "More detail" and the Rounds tab are built from
 * (the parity pass, PARITY.md): tiles, tables, a line per round, the sectors
 * shots finish in, and the disclosure. Server-safe (no hooks). Every table has
 * a caption and a named scroll region; every chart has its values in words;
 * null is a dash, never a zero, and a panel with nothing behind it says so
 * with its catalog code.
 */

export type Tone = 'gain' | 'loss' | undefined;

/** The round-type chip in the Rounds table and the phone's round rows. */
export const ROUND_TYPE = { practice: 'Practice', qualifier: 'Qualifier', tournament: 'Tournament' } as const;

/** Each window as it heads the line saying which rounds a section counts. */
export const RULE_WINDOW: Record<ChWindow, string> = {
  last10: 'Last 10 rounds',
  season: 'This season',
  qualifiers: 'Qualifier rounds',
};

/** A panel of Game detail (a titled block in the two-column body). */
export function Panel({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={'ch-gm-p' + (wide ? ' is-wide' : '')}>
      <div className="ch-gm-p__t">{title}</div>
      {children}
      {note && <p className="ch-gm-p__n">{note}</p>}
    </div>
  );
}

/** What a panel has no data for: one plain line, carrying the catalog code. */
export function Empty({ code, children }: { code: string; children: ReactNode }) {
  return (
    <p className="ch-gm-p__empty" data-ch-code={code}>
      {children}
    </p>
  );
}

/** The window and the rounds a section counts, in one line under its figures. */
export function Rule({ children }: { children: ReactNode }) {
  return <p className="ch-gx-rule">{children}</p>;
}

/** "More detail": a native disclosure (keyboard and screen reader for free), open on the desktop and closed on the phone. */
export function More({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details className="ch-gx-more" open={open}>
      <summary>More detail</summary>
      <div className="ch-gm__body">{children}</div>
    </details>
  );
}

export interface TileItem {
  label: string;
  value: string;
  sub?: string | null;
  tone?: Tone;
  /** This tile has nothing behind it: a dash, dimmed, and the catalog code when it is a state. */
  empty?: boolean;
  code?: string;
}

/** A row of figures, each a label, a value and an optional line under it. */
export function Tiles({ label, items }: { label: string; items: TileItem[] }) {
  return (
    <dl className="ch-gx-tiles" aria-label={label}>
      {items.map((it) => (
        <div key={it.label} className={it.empty ? 'is-empty' : undefined} data-ch-code={it.empty ? it.code : undefined}>
          <dt>{it.label}</dt>
          <dd className={`ch-num${it.tone ? ` ch-${it.tone}` : ''}`}>{it.value}</dd>
          {it.sub && <dd className="ch-gx-sub">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

export interface Cell {
  v: string;
  tone?: Tone;
  dim?: boolean;
}

/** A table with a caption, a row header and a named scroll region for a narrow screen. */
export function DataTable({
  label,
  cols,
  rows,
  note,
}: {
  label: string;
  cols: string[];
  rows: Array<{ key: string; head: string; cells: Array<Cell | string> }>;
  note?: string;
}) {
  return (
    <>
      <ScrollRegion label={`${label}, scrolls sideways`} className="ch-gx-scroll">
        <table className="ch-gx-tbl">
          <caption className="ch-sr-only">{label}</caption>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} scope="col" className={i ? 'r' : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.head}</th>
                {r.cells.map((c, i) => {
                  const cell = typeof c === 'string' ? { v: c } : c;
                  return (
                    <td key={i} className={`r ch-num${cell.tone ? ` ch-${cell.tone}` : ''}${cell.dim ? ' is-dim' : ''}`}>
                      {cell.v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      {note && <p className="ch-gm-p__n">{note}</p>}
    </>
  );
}

/** One figure per round, oldest first, on a line with its average dashed; the values are in the label for a screen reader. */
export function RoundLine({ points, unit = '', digits = 0, label }: { points: Array<{ label: string; value: number }>; unit?: string; digits?: number; label: string }) {
  const w = 690;
  const h = 150;
  const pad = 26;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => 30 + ((hi - v) / span) * (h - 62);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const f = (v: number) => `${v.toFixed(digits)}${unit}`;
  const all = points.length <= 12;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ch-gx-line" role="img" aria-label={`${label}: ${points.map((p) => `${p.label} ${f(p.value)}`).join(', ')}`}>
      <line x1={pad} x2={w - pad} y1={y(avg)} y2={y(avg)} stroke="rgb(28 25 18 / .35)" strokeDasharray="2 3" />
      <text x={w - pad} y={y(avg) - 5} textAnchor="end" className="ch-ax">
        avg {f(avg)}
      </text>
      <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--ch-green-700)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={last ? 4.5 : 3.5} fill={last ? 'var(--ch-green-700)' : 'var(--ch-ivory-25)'} stroke="var(--ch-green-700)" strokeWidth={1.75} />
            {(all || i === 0 || last) && (
              <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" className="ch-ax">
                {f(p.value)}
              </text>
            )}
          </g>
        );
      })}
      <text x={pad} y={h - 6} className="ch-ax">
        {points[0]!.label}
      </text>
      <text x={w - pad} y={h - 6} textAnchor="end" className="ch-ax">
        {points[points.length - 1]!.label}
      </text>
    </svg>
  );
}

const SECTORS: Array<[string, string]> = [
  ['long_left', 'Long left'],
  ['long', 'Long'],
  ['long_right', 'Long right'],
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
  ['short_left', 'Short left'],
  ['short', 'Short'],
  ['short_right', 'Short right'],
];

/**
 * Where shots finish, by sector: a grid (the target is the middle), each cell its count and share, then the
 * averages and the outcomes. Counts, not a scatter: production's dots are placed from the sector and the distance,
 * so they show no measured dispersion.
 */
export function SectorGrid({ g, unit }: { g: ChSprayGroup; unit: string }) {
  const by = new Map(g.bands.map((b) => [b.sector, b]));
  const top = [...g.bands].sort((a, b) => b.count - a.count)[0];
  const summary = SECTORS.map(([k, l]) => `${l} ${by.get(k)?.count ?? 0}`).join(', ');
  const n = (v: number | null) => (v == null ? NO_DATA : `${Math.round(v)} yds`);
  return (
    <>
      <div className="ch-gx-sec" role="img" aria-label={`${g.shots} ${unit} by sector: ${summary}`}>
        {SECTORS.map(([k, l]) => {
          const b = by.get(k);
          const top1 = !!top && top.count > 0 && b?.sector === top.sector;
          return (
            <span key={k} className={'ch-gx-sec__c' + (b && b.count ? '' : ' is-zero') + (top1 ? ' is-top' : '')}>
              <b className="ch-num">{b?.count ?? 0}</b>
              <i className="ch-num">{b && g.shots ? `${Math.round(b.pct)}%` : NO_DATA}</i>
              <em>{l}</em>
            </span>
          );
        })}
      </div>
      <Tiles
        label={`${unit}: distances and outcomes`}
        items={[
          { label: 'Average shot', value: n(g.avgForward) },
          { label: 'Average left to hole', value: n(g.avgRemaining) },
          { label: 'Playable', value: String(g.playable) },
          { label: 'Trouble', value: String(g.trouble) },
          { label: 'Penalty', value: String(g.penalty) },
        ]}
      />
    </>
  );
}
