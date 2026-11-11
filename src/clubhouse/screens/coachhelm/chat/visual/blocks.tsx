'use client';
import { formatFixed } from '../../../../lib/format';

import type { HoleStripBlock, MissPatternBlock, SeasonCompareBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';

/** S-ASK.toolcard.ask-about: a mark fills the composer and never sends. */
export function askAbout(label: string) {
  window.dispatchEvent(new CustomEvent('ch-ask-fill', { detail: `Ask about this: ${label}` }));
}

const ANGLE: Record<string, number> = { long: 0, long_right: 45, right: 90, short_right: 135, short: 180, short_left: 225, left: 270, long_left: 315 };
const said = (direction: string) => direction.replace('_', ' ');

/**
 * Eight wedges by miss direction (shots store a direction and a distance, so nothing is placed on a map), in the yardage
 * book's hand: a ruled ring around the pin, each wedge as long as its share of the misses, the commonest one in the loss
 * ink, and a dot for how far those shots finished. The four sides are named at the ring, so nothing has to be decoded.
 */
export function MissPattern({ block }: { block: MissPatternBlock }) {
  const max = Math.max(1, ...block.wedges.map((w) => w.count));
  const R = 70;
  const C = 104;
  const far = Math.max(1, ...block.wedges.map((w) => w.avg_left_ft ?? 0));
  const at = (deg: number, r: number) => `${Math.round((C + r * Math.sin((deg * Math.PI) / 180)) * 10) / 10},${Math.round((C - r * Math.cos((deg * Math.PI) / 180)) * 10) / 10}`;
  const wedge = (deg: number, r: number) => `M${C},${C} L${at(deg - 22, r)} A${r},${r} 0 0 1 ${at(deg + 22, r)} Z`;
  return (
    <figure className="ch-aks-miss">
      <svg viewBox="-14 0 236 208" role="img" aria-label={`${block.total} shots by miss direction: ${block.wedges.map((w) => `${said(w.direction)} ${w.count}`).join(', ')}`}>
        <circle cx={C} cy={C} r={R} className="ch-aks-miss__ring" />
        <circle cx={C} cy={C} r={R / 2} className="ch-aks-miss__ring is-minor" />
        {block.wedges.map((w) => (
          <path key={w.direction} d={wedge(ANGLE[w.direction] ?? 0, 14 + (w.count / max) * (R - 14))} className={'ch-aks-miss__wedge' + (w.count === max && w.count > 0 ? ' is-most' : '')} role="button" tabIndex={0} aria-label={`Ask about ${said(w.direction)} misses, ${w.count}`} onClick={() => askAbout(`${said(w.direction)} misses, ${w.count} shots`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); askAbout(`${said(w.direction)} misses, ${w.count} shots`); } }} />
        ))}
        {/* Dots by distance left: the wedge says how often, the dot how far (ASK_REDESIGN 3.4). */}
        {block.wedges.map((w) => {
          if (w.avg_left_ft == null || w.count === 0) return null;
          const [x, y] = at(ANGLE[w.direction] ?? 0, 14 + (w.avg_left_ft / far) * (R - 14)).split(',');
          return <circle key={`d-${w.direction}`} cx={x} cy={y} r="3" className="ch-aks-miss__dot" aria-hidden="true" />;
        })}
        <circle cx={C} cy={C} r="2.5" className="ch-aks-miss__pin" />
        <g className="ch-aks-miss__side" aria-hidden="true">
          <text x={C} y="22" textAnchor="middle">Long</text>
          <text x={C} y="198" textAnchor="middle">Short</text>
          <text x="26" y={C + 4} textAnchor="end">Left</text>
          <text x="182" y={C + 4}>Right</text>
        </g>
      </svg>
      <figcaption className="ch-num">
        {block.total} shots · {block.inside_15} inside 15 ft · {block.inside_25} inside 25 ft{block.no_direction ? ` · ${block.no_direction} with no miss logged` : ''}
      </figcaption>
    </figure>
  );
}

/**
 * This season's mean against last season's usual range: each season a ruled row with its interval drawn on one shared
 * scale (the range as a line, the mean as its dot) and its figure at the end. A range only: there's no round-by-round
 * line in the read, so none is drawn. With one season there is nothing to set it against, so only its figure is said.
 */
export function SeasonCompare({ block }: { block: SeasonCompareBlock }) {
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatFixed(Math.abs(v), 1)}`;
  const t = block.this_season;
  const l = block.last_season;
  const edges = [t?.lo, t?.hi, t?.mean, l?.lo, l?.hi, l?.mean].filter((v): v is number => v != null);
  const lo = edges.length ? Math.min(...edges) : 0;
  const hi = edges.length ? Math.max(...edges) : 1;
  const pad = Math.max(0.1, (hi - lo) * 0.1);
  const x = (v: number) => Math.round((6 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 108) * 10) / 10;
  const both = !!t && !!l;
  const row = (name: string, band: NonNullable<SeasonCompareBlock['this_season']> | null, now: boolean) => (
    <li>
      <button type="button" className={'ch-aks-season__row ch-aks-ask is-key' + (now ? ' is-now' : '')} data-ch-press="" onClick={() => askAbout(`${name.toLowerCase()}${band ? `, ${fmt(band.mean)}` : ''}`)}>
        <span className="ch-aks-season__name">
          {name}
          {band && <small className="ch-num">{band.n} rounds</small>}
        </span>
        {both && band && (
          <svg className="ch-aks-season__scale" viewBox="0 0 120 20" aria-hidden="true" focusable="false">
            <line className="ch-aks-season__range" x1={x(band.lo)} x2={x(band.hi)} y1="10" y2="10" />
            <line className="ch-aks-season__cap" x1={x(band.lo)} x2={x(band.lo)} y1="6" y2="14" />
            <line className="ch-aks-season__cap" x1={x(band.hi)} x2={x(band.hi)} y1="6" y2="14" />
            <circle className="ch-aks-season__mean" cx={x(band.mean)} cy="10" r="4" />
          </svg>
        )}
        <b className="ch-aks-season__val ch-num">{band ? fmt(band.mean) : '—'}</b>
      </button>
    </li>
  );
  return (
    <div className="ch-aks-season">
      <ul className="ch-aks-rows" aria-label={both ? `This season ${fmt(t.mean)} against last season’s usual range of ${fmt(l.lo)} to ${fmt(l.hi)}` : undefined}>
        {row('This season', t, true)}
        {row('Last season', l, false)}
      </ul>
      {l && (
        <p className="ch-aks-foot ch-num">
          Usual range last season {fmt(l.lo)} to {fmt(l.hi)}. {block.method}
        </p>
      )}
    </div>
  );
}

const toParSaid = (n: number | null) => (n == null ? 'no score' : n === 0 ? 'par' : `${n > 0 ? '+' : ''}${n}`);

/**
 * A round hole by hole, to par: the two nines as ruled lines of figures under their hole numbers, flat on the paper.
 * Red only under par (D-42); over par is plain ink. Each hole asks about itself.
 */
export function HoleStrip({ block }: { block: HoleStripBlock }) {
  const nines = [block.holes.filter((h) => h.hole_number <= 9), block.holes.filter((h) => h.hole_number > 9)].filter((n) => n.length > 0);
  return (
    <div className="ch-aks-strip" role="group" aria-label={block.holes.map((h) => `Hole ${h.hole_number}: ${toParSaid(h.to_par)}`).join(', ')}>
      {nines.map((nine) => (
        <div key={nine[0]!.hole_number} className="ch-aks-strip__nine">
          {nine.map((h) => (
            <button type="button" key={h.hole_number} className={'ch-aks-strip__hole' + (h.to_par != null && h.to_par < 0 ? ' is-under' : '')} data-ch-press="" onClick={() => askAbout(`hole ${h.hole_number}`)}>
              <small className="ch-num">{h.hole_number}</small>
              <b className="ch-num">{h.to_par == null ? '—' : h.to_par > 0 ? `+${h.to_par}` : h.to_par === 0 ? 'E' : `−${Math.abs(h.to_par)}`}</b>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
