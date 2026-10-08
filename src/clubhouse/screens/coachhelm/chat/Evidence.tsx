'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { CircleAlert, Table2 } from 'lucide-react';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { evidenceBlocks, formatValue, type AskEvidence, type AskTable, type EvidenceTile } from '../../../data/coachhelm-chat-thread';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { playerStatsHref } from './Prose';

/** One tool's evidence, as the blocks its shape calls for. Drawn with Clubhouse pieces (the Stats charts depend on stats.css, which this page does not load). */
export function AskEvidenceView({ envelope }: { envelope: ToolEnvelope }) {
  const blocks = evidenceBlocks(envelope);
  return (
    <div className="ch-th-evidence">
      {blocks.map((block, i) => (
        <AskEvidenceBlock key={i} block={block} />
      ))}
    </div>
  );
}

export function DataTable({ table }: { table: AskTable }) {
  return (
    <div className="ch-th-tablewrap">
      <table className="ch-th-table">
        <caption className="ch-th-sr">{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className={i === 0 ? undefined : 'is-num'}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j} className="is-num">{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AskEvidenceBlock({ block, bare = false }: { block: AskEvidence; bare?: boolean }) {
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
  return <Figure block={block} bare={bare} />;
}

/** The figure's chrome: a title, "View as table", the drawing, then the notes and the source. */
function Figure({ block, bare }: { block: Exclude<AskEvidence, { kind: 'unavailable' | 'empty' }>; bare: boolean }) {
  const [asTable, setAsTable] = useState(false);
  // A table or a comparison is already a table: there is nothing to switch to.
  const isTable = block.kind === 'table' || block.kind === 'compare';
  return (
    <figure className={'ch-th-fig' + (bare ? ' ch-th-fig--bare' : '')} data-kind={block.kind}>
      <div className="ch-th-fig__head">
        <figcaption>{block.title}</figcaption>
        {!isTable && (
          <button type="button" className="ch-th-toggle" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} data-ch-code="CH-13852">
            <Icon icon={Table2} size={14} />
            View as table
          </button>
        )}
      </div>
      {isTable || asTable ? <DataTable table={block.table} /> : <Drawing block={block} />}
      {block.note && <p className="ch-th-fig__note">{block.note}</p>}
      {block.bench && <p className="ch-th-fig__note">{block.bench}</p>}
      {block.source && <p className="ch-th-fig__src">{block.source}</p>}
    </figure>
  );
}

function Drawing({ block }: { block: Exclude<AskEvidence, { kind: 'unavailable' | 'empty' | 'table' | 'compare' }> }) {
  switch (block.kind) {
    case 'bars':
      return (
        <div className="ch-th-bars" role="list" aria-label={block.title}>
          {block.rows.map((r) => (
            <div key={r.label} className="ch-th-bar" role="listitem" data-tone={r.tone}>
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
      return (
        <ol className="ch-th-rank" aria-label={block.title}>
          {block.rows.map((r) => {
            const href = playerStatsHref(r.id);
            return (
              <li key={r.id}>
                <span className="ch-th-rank__n">{r.rank}</span>
                <Avatar name={r.label} size={30} />
                {href ? (
                  <Link href={href} className="ch-th-rank__name">
                    {r.label}
                  </Link>
                ) : (
                  <span className="ch-th-rank__name">{r.label}</span>
                )}
                <span className="ch-th-rank__val">
                  <b>{r.display}</b>
                  {r.of && <span> {r.of}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      );
    case 'tiles':
      return <Tiles tiles={block.tiles} />;
    case 'legs':
      return <Legs block={block} />;
    case 'trend':
      return <Trend block={block} />;
  }
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
        {block.rows.map((r) => (
          <div key={r.label} className="ch-th-leg" role="listitem" data-sign={r.value < 0 ? 'loss' : 'gain'}>
            <span className="ch-th-leg__label">{r.label}</span>
            <span className="ch-th-leg__track" aria-hidden="true">
              <span style={{ width: `${(Math.abs(r.value) / max) * 50}%` }} />
            </span>
            <span className="ch-th-leg__val">{r.display}</span>
          </div>
        ))}
      </div>
      <p className="ch-th-fig__take">{block.takeaway}</p>
    </div>
  );
}

/** The width the trend is drawn at before it is measured (and in tests): the phone's column. */
const W0 = 360;
const H = 150;
const PAD = { l: 38, r: 10, t: 16, b: 26 };
/** The reference label's type: 10.5px on desktop, 12px on the phone (the CSS); its width is estimated from the larger. */
const REF_CHAR = 6.6;

/**
 * Where the reference label goes so it never sits on the line or a point (P013 D3): above the dashed line at the right, else
 * below it, else the same two at the left; when all four would touch the line, `null`, and the label is set as a key under
 * the chart instead. `pts` are the drawn points in viewBox units, `w` the label's estimated width.
 */
export function placeRefLabel(pts: Array<{ x: number; y: number }>, ry: number, w: number, width: number): { x: number; y: number; anchor: 'start' | 'end' } | null {
  const R = 5; // a point's radius plus its stroke
  const lineSpan = (x0: number, x1: number): [number, number] | null => {
    const ys: number[] = [];
    pts.forEach((p, i) => {
      if (p.x >= x0 && p.x <= x1) ys.push(p.y);
      const q = pts[i + 1];
      if (!q) return;
      for (const x of [x0, x1]) {
        if ((p.x <= x && x <= q.x) || (q.x <= x && x <= p.x)) ys.push(q.x === p.x ? p.y : p.y + ((x - p.x) * (q.y - p.y)) / (q.x - p.x));
      }
    });
    return ys.length ? [Math.min(...ys) - R, Math.max(...ys) + R] : null;
  };
  const right = { x0: width - PAD.r - w, x1: width - PAD.r, x: width - PAD.r, anchor: 'end' as const };
  const left = { x0: PAD.l + 4, x1: PAD.l + 4 + w, x: PAD.l + 4, anchor: 'start' as const };
  for (const side of [right, left]) {
    const span = lineSpan(side.x0, side.x1);
    // The text's box: about 11px above its baseline and 3px below it.
    for (const base of [ry - 5, ry + 15]) {
      if (!span || span[1] < base - 11 || span[0] > base + 3) return { x: side.x, y: base, anchor: side.anchor };
    }
  }
  return null;
}

/**
 * Movement over time, with the reference drawn dashed so a last point reads against something. The text equivalent is the label
 * and the table. Drawn at the width it is given (measured), so its type stays at the token size instead of scaling with the
 * column (P013 D3).
 */
export function Trend({ block }: { block: Extract<AskEvidence, { kind: 'trend' }> }) {
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
    const ro = new ResizeObserver(read);
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
  lo -= pad;
  hi += pad;
  const n = block.points.length;
  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
  const last = values[n - 1] as number;
  const ref = block.reference;
  // Amber when the last point is on the wrong side of the reference for a metric whose direction is known; never red.
  const worse = ref && block.goodDirection ? (block.goodDirection === 'up' ? last < ref.value : last > ref.value) : false;
  const stroke = worse ? 'var(--ch-chart-loss)' : 'var(--ch-green-600)';
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
  const showAll = n <= 6;
  const label = `${block.summary} ${block.points.map((p) => `${p.label} ${formatValue(p.value, block.unit)}`).join(', ')}.`;
  const refText = ref ? (ref.label.startsWith('Team') ? ref.label : `${ref.label} ${formatValue(ref.value, block.unit)}`) : '';
  const refAt = ref ? placeRefLabel(values.map((v, i) => ({ x: x(i), y: y(v) })), y(ref.value), refText.length * REF_CHAR, W) : null;
  return (
    <div ref={box} className="ch-th-trendbox">
      <svg className="ch-th-trend" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="ch-th-grid" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="ch-th-ax">
              {formatValue(Math.round(t * 10) / 10, block.unit)}
            </text>
          </g>
        ))}
        {ref && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(ref.value)} y2={y(ref.value)} className="ch-th-ref" />
            {refAt && (
              <text x={refAt.x} y={refAt.y} textAnchor={refAt.anchor} className="ch-th-ref-label">
                {refText}
              </text>
            )}
          </g>
        )}
        {n > 1 && <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />}
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={i === n - 1 ? stroke : 'var(--ch-ivory-25)'} stroke={stroke} strokeWidth="2" />
        ))}
        {block.points.map((p, i) =>
          showAll || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2) ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="ch-th-ax">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      {ref && !refAt && (
        <p className="ch-th-refkey" aria-hidden="true">
          <i />
          {refText}
        </p>
      )}
    </div>
  );
}
