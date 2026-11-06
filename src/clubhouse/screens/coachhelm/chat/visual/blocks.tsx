'use client';
import { formatFixed } from '../../../../lib/format';

import type { HoleStripBlock, MissPatternBlock, PuttProfileBlock, SeasonCompareBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';

/** S-ASK.toolcard.ask-about: a mark fills the composer and never sends. */
export function askAbout(label: string) {
  window.dispatchEvent(new CustomEvent('ch-ask-fill', { detail: `Ask about this: ${label}` }));
}

const ANGLE: Record<string, number> = { long: 0, long_right: 45, right: 90, short_right: 135, short: 180, short_left: 225, left: 270, long_left: 315 };

/** Eight wedges by miss direction (shots store a direction and a distance, so nothing is placed on a map). */
export function MissPattern({ block }: { block: MissPatternBlock }) {
  const max = Math.max(1, ...block.wedges.map((w) => w.count));
  const R = 70;
  const far = Math.max(1, ...block.wedges.map((w) => w.avg_left_ft ?? 0));
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
          <path key={w.direction} d={wedge(ANGLE[w.direction] ?? 0, 14 + (w.count / max) * (R - 14))} className={w.count === max && w.count > 0 ? 'w hi' : 'w'} role="button" tabIndex={0} aria-label={`Ask about ${w.direction.replace('_', ' ')} misses, ${w.count}`} onClick={() => askAbout(`${w.direction.replace('_', ' ')} misses, ${w.count} shots`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); askAbout(`${w.direction.replace('_', ' ')} misses, ${w.count} shots`); } }} />
        ))}
        {/* Dots by distance left: the wedge says how often, the dot how far (ASK_REDESIGN 3.4). */}
        {block.wedges.map((w) => {
          if (w.avg_left_ft == null || w.count === 0) return null;
          const at = 14 + (w.avg_left_ft / far) * (R - 14);
          const a = ((ANGLE[w.direction] ?? 0) * Math.PI) / 180;
          return <circle key={`d-${w.direction}`} cx={90 + at * Math.sin(a)} cy={90 - at * Math.cos(a)} r="3" className="dot" aria-hidden="true" />;
        })}
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
        <button type="button" key={b.id} className="ch-ak-mark" onClick={() => askAbout(`putts from ${b.label}${b.rate != null ? `, ${Math.round(b.rate)}%` : ''}`)}>
          <span>{b.label}</span>
          <span className="t">
            {b.rate != null && <i style={{ transform: `scaleX(${b.rate / 100})` }} />}
            {b.season_rate != null && <em className="tick" style={{ left: `${b.season_rate}%` }} title={`Season ${Math.round(b.season_rate)}%`} />}
          </span>
          <b className="ch-num">{b.rate == null ? '—' : `${Math.round(b.rate)}%`}</b>
          <small className="ch-num">{b.attempts}</small>
        </button>
      ))}
    </div>
  );
}

/** This season's mean against last season's usual range, on one scale. A band only: there's no round-by-round line in the read, so none is drawn. */
export function SeasonCompare({ block }: { block: SeasonCompareBlock }) {
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatFixed(Math.abs(v), 1)}`;
  const t = block.this_season;
  const l = block.last_season;
  const edges = [t?.lo, t?.hi, t?.mean, l?.lo, l?.hi, l?.mean].filter((v): v is number => v != null);
  const lo = edges.length ? Math.min(...edges) : 0;
  const hi = edges.length ? Math.max(...edges) : 1;
  const pad = Math.max(0.1, (hi - lo) * 0.1);
  const x = (v: number) => 8 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 304;
  return (
    <div className="ch-ak-season">
      {t && l && (
        <svg className="scale" viewBox="0 0 320 44" role="img" aria-label={`This season ${fmt(t.mean)} against last season's usual range of ${fmt(l.lo)} to ${fmt(l.hi)}`}>
          <rect className="band" x={x(l.lo)} y="10" width={Math.max(2, x(l.hi) - x(l.lo))} height="24" rx="6" />
          <line className="last" x1={x(l.mean)} x2={x(l.mean)} y1="10" y2="34" />
          <line className="range" x1={x(t.lo)} x2={x(t.hi)} y1="22" y2="22" />
          <circle className="now" cx={x(t.mean)} cy="22" r="6" />
        </svg>
      )}
      <button type="button" className="ch-ak-mark" onClick={() => askAbout(`this season${t ? `, ${fmt(t.mean)}` : ''}`)}>
        <b className="ch-num">{t ? fmt(t.mean) : '—'}</b>
        <span>This season{t ? ` · ${t.n} rounds` : ''}</span>
      </button>
      <button type="button" className="ch-ak-mark" onClick={() => askAbout(`last season${l ? `, ${fmt(l.mean)}` : ''}`)}>
        <b className="ch-num">{l ? fmt(l.mean) : '—'}</b>
        <span>Last season{l ? ` · ${l.n} rounds` : ''}</span>
      </button>
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
    <div className="ch-ak-holes" role="group" aria-label={block.holes.map((h) => `Hole ${h.hole_number}: ${h.to_par == null ? 'no score' : h.to_par === 0 ? 'par' : `${h.to_par > 0 ? '+' : ''}${h.to_par}`}`).join(', ')}>
      {block.holes.map((h) => (
        <button type="button" key={h.hole_number} className={'ch-ak-mark' + (h.to_par != null && h.to_par < 0 ? ' u' : '')} onClick={() => askAbout(`hole ${h.hole_number}`)}>
          <small className="ch-num">{h.hole_number}</small>
          <b className="ch-num">{h.to_par == null ? '—' : h.to_par > 0 ? `+${h.to_par}` : h.to_par === 0 ? 'E' : `−${Math.abs(h.to_par)}`}</b>
        </button>
      ))}
    </div>
  );
}
