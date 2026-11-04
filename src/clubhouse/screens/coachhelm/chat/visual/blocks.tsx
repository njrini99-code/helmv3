'use client';
import { formatFixed } from '../../../../lib/format';

import type { HoleStripBlock, MissPatternBlock, PuttProfileBlock, SeasonCompareBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';

const ANGLE: Record<string, number> = { long: 0, long_right: 45, right: 90, short_right: 135, short: 180, short_left: 225, left: 270, long_left: 315 };

/** Eight wedges by miss direction (shots store a direction and a distance, so nothing is placed on a map). */
export function MissPattern({ block }: { block: MissPatternBlock }) {
  const max = Math.max(1, ...block.wedges.map((w) => w.count));
  const R = 70;
  const wedge = (deg: number, r: number) => {
    const a = ((deg - 22) * Math.PI) / 180;
    const b = ((deg + 22) * Math.PI) / 180;
    return `M90,90 L${90 + r * Math.sin(a)},${90 - r * Math.cos(a)} A${r},${r} 0 0 1 ${90 + r * Math.sin(b)},${90 - r * Math.cos(b)} Z`;
  };
  return (
    <figure className="ch-ak-miss">
      <svg viewBox="0 0 180 180" role="img" aria-label={`${block.total} shots by miss direction: ${block.wedges.map((w) => `${w.direction.replace('_', ' ')} ${w.count}`).join(', ')}`}>
        <circle cx="90" cy="90" r={R} className="trk" />
        {block.wedges.map((w) => (
          <path key={w.direction} d={wedge(ANGLE[w.direction] ?? 0, 14 + (w.count / max) * (R - 14))} className={w.count === max && w.count > 0 ? 'w hi' : 'w'} />
        ))}
        <circle cx="90" cy="90" r="3" className="flag" />
      </svg>
      <figcaption className="ch-num">
        {block.total} shots · {block.inside_15} inside 15 ft · {block.inside_25} inside 25 ft{block.no_direction ? ` · ${block.no_direction} with no miss logged` : ''}
      </figcaption>
    </figure>
  );
}

export function PuttProfile({ block }: { block: PuttProfileBlock }) {
  return (
    <div className="ch-ak-putts">
      {block.buckets.map((b) => (
        <div key={b.id}>
          <span>{b.label}</span>
          <span className="t">{b.rate != null && <i style={{ transform: `scaleX(${b.rate / 100})` }} />}</span>
          <b className="ch-num">{b.rate == null ? '—' : `${Math.round(b.rate)}%`}</b>
          <small className="ch-num">{b.attempts}</small>
        </div>
      ))}
    </div>
  );
}

export function SeasonCompare({ block }: { block: SeasonCompareBlock }) {
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatFixed(Math.abs(v), 1)}`;
  const t = block.this_season;
  const l = block.last_season;
  return (
    <div className="ch-ak-season">
      <div>
        <b className="ch-num">{t ? fmt(t.mean) : '—'}</b>
        <span>This season{t ? ` · ${t.n} rounds` : ''}</span>
      </div>
      <div>
        <b className="ch-num">{l ? fmt(l.mean) : '—'}</b>
        <span>Last season{l ? ` · ${l.n} rounds` : ''}</span>
      </div>
      {l && (
        <p className="ch-num">
          Usual range last season {fmt(l.lo)} to {fmt(l.hi)}. {block.method}
        </p>
      )}
    </div>
  );
}

/** Red only under par; over par is plain ink on this block, per the design. */
export function HoleStrip({ block }: { block: HoleStripBlock }) {
  return (
    <div className="ch-ak-holes" role="img" aria-label={block.holes.map((h) => `Hole ${h.hole_number}: ${h.to_par == null ? 'no score' : h.to_par === 0 ? 'par' : `${h.to_par > 0 ? '+' : ''}${h.to_par}`}`).join(', ')}>
      {block.holes.map((h) => (
        <span key={h.hole_number} className={h.to_par != null && h.to_par < 0 ? 'u' : ''}>
          <small className="ch-num">{h.hole_number}</small>
          <b className="ch-num">{h.to_par == null ? '—' : h.to_par > 0 ? `+${h.to_par}` : h.to_par === 0 ? 'E' : `−${Math.abs(h.to_par)}`}</b>
        </span>
      ))}
    </div>
  );
}
