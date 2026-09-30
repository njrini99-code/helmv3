'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Flag } from 'lucide-react';
import type { DistancePreference } from '@/lib/golf/distance-units';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { formatToPar } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { ScoreMark } from '../../../ui/ScoreMark';
import { distanceText, RESULT_LABEL, roundSoFar, shotLine, shotTitle } from './labels';

/** A one-of-several choice (radiogroup, CH-11806: named for what it chooses). A `rare` option is drawn quieter; `note` is its small second line. */
export function Seg<T extends string>({
  label,
  value,
  onChange,
  options,
  cols,
}: {
  label: string;
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; note?: string | null; rare?: boolean }>;
  cols?: number;
}) {
  return (
    <div className={'ch-rt-seg' + (cols ? ' ch-rt-seg--grid' : '')} role="radiogroup" aria-label={label} style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={o.rare ? 'is-rare' : undefined}
          onClick={() => {
            // CH-11705: a choice is a selection tick.
            haptic('select');
            onChange(o.value);
          }}
        >
          {o.label}
          {o.note && <em>{o.note}</em>}
        </button>
      ))}
    </div>
  );
}

/** A section of the entry panel, with its label and an optional Optional / Required hint. */
export function Sec({ label, hint, tint, htmlFor, children }: { label: string; hint?: 'Optional' | 'Required'; tint?: boolean; htmlFor?: string; children: ReactNode }) {
  return (
    <section className={'ch-rt-sec' + (tint ? ' is-tint' : '')} aria-label={htmlFor ? undefined : label}>
      <div className="ch-rt-sec__h">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {hint && <em className={'ch-rt-hint' + (hint === 'Required' ? ' is-required' : '')}>{hint}</em>}
      </div>
      {children}
    </section>
  );
}

/**
 * The hole strip under the top bar: each hole's score against par, the current
 * hole ringed, the round's score to par at the end. A hole you can go to is a
 * button (any earlier hole, a later one with a score, and the next unplayed);
 * the rest are marks. CH-11805: each is named "Hole 4, 5 strokes" or "Hole 6".
 */
export function TrackStrip({ holes, current, onJump }: { holes: RoundHole[]; current: number; onJump?: (index: number) => void }) {
  const frontier = holes.findIndex((h) => h.score === null);
  const soFar = roundSoFar(holes);
  return (
    <div className="ch-rt-strip" style={{ ['--ch-rt-holes' as string]: holes.length }}>
      {holes.map((h, i) => {
        const cls = 'ch-rt-strip__h' + (i === current ? ' is-cur' : '') + (h.score != null ? ' is-done' : '');
        const name = `Hole ${h.number}${h.score != null ? `, ${h.score} strokes` : ''}${i === current ? ', current hole' : ''}`;
        const inner = (
          <>
            <em>{h.number}</em>
            {h.score != null ? <ScoreMark score={h.score} par={h.par} size="sm" /> : <b aria-hidden="true">{i === current ? '•' : ''}</b>}
          </>
        );
        const canGo = !!onJump && i !== current && (i < current || h.score != null || i === frontier);
        return canGo ? (
          <button key={h.number} type="button" className={cls} aria-label={`Go to hole ${h.number}${h.score != null ? `, ${h.score} strokes` : ''}`} onClick={() => onJump!(i)}>
            {inner}
          </button>
        ) : (
          <span key={h.number} className={cls} role="img" aria-label={name} aria-current={i === current ? 'step' : undefined}>
            {inner}
          </span>
        );
      })}
      <div className="ch-rt-strip__tot">
        <em>Thru {soFar.thru}</em>
        <b>{soFar.toPar == null ? 'E' : formatToPar(soFar.toPar)}</b>
      </div>
    </div>
  );
}

/** Where a shot finished, as the log and the map colour it. */
export function lieClass(shot: ShotRecord): string {
  if (shot.isPenalty) return 'is-penalty';
  return `is-${shot.result}`;
}

/**
 * The hole, drawn as a schematic: tee at the bottom, green and flag at the
 * top, each shot a numbered stop at its distance left, pushed to the side it
 * missed. There is no hole geometry in the data (Q-72c), so the fairway is the
 * par's shape and the caption says so. CH-11808: named in words.
 */
export function HoleMap({ hole, shots, pending }: { hole: RoundHole; shots: ShotRecord[]; pending: boolean }) {
  const id = useId().replace(/:/g, '');
  const W = 160;
  const H = 300;
  const gx = 80;
  const gy = 34;
  const ty = 276;
  const total = Math.max(1, hole.yardage || 1);
  const pts: Array<[number, number]> = [[gx, ty]];
  const played = shots.filter((s) => !s.isPenalty);
  played.forEach((s, i) => {
    const left = s.result === 'hole' ? 0 : s.distanceUnitAfter === 'feet' ? s.distanceToHoleAfter / 3 : s.distanceToHoleAfter;
    const f = Math.max(0, Math.min(1, left / total));
    const dir = `${s.approachMissDirection ?? ''} ${s.missDirection ?? ''}`;
    const side = dir.includes('left') ? -1 : dir.includes('right') ? 1 : 0;
    const off = s.result === 'green' ? (i % 2 ? 6 : -6) : s.result === 'hole' ? 0 : side * 34;
    pts.push([gx + off * Math.min(1, f * 3), gy + (ty - gy) * f]);
  });
  const d =
    hole.par === 3
      ? 'M70,288 C66,220 64,120 62,60 C58,30 102,30 98,60 C96,120 94,220 90,288 Z'
      : hole.par === 5
        ? 'M64,290 C58,230 90,180 86,130 C82,90 60,70 62,48 C64,22 104,22 100,52 C98,78 112,100 108,140 C104,190 84,230 96,290 Z'
        : 'M66,290 C60,220 58,140 60,70 C60,30 100,30 100,70 C102,140 100,220 94,290 Z';
  const last = pts.length - 1;
  return (
    <figure className="ch-rt-mapw">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ch-rt-map"
        role="img"
        aria-label={`Hole ${hole.number}, par ${hole.par}: ${played.length === 0 ? 'no shots yet' : `${played.length} shot${played.length === 1 ? '' : 's'} so far`}`}
      >
        <defs>
          <pattern id={`ch-rt-mow-${id}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
            <rect width="8" height="8" className="ch-rt-map__mow-a" />
            <rect width="4" height="8" className="ch-rt-map__mow-b" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} rx="14" className="ch-rt-map__bg" />
        <path d={d} fill={`url(#ch-rt-mow-${id})`} className="ch-rt-map__fairway" />
        {hole.par !== 3 && <ellipse cx="112" cy={hole.par === 5 ? 118 : 150} rx="10" ry="7" className="ch-rt-map__sand" />}
        <ellipse cx="54" cy="58" rx="8" ry="6" className="ch-rt-map__sand" />
        <ellipse cx={gx} cy={gy + 4} rx="22" ry="16" className="ch-rt-map__green" />
        <line x1={gx} y1={gy + 4} x2={gx} y2={gy - 16} className="ch-rt-map__pole" />
        <path d={`M${gx},${gy - 16} l12,4 l-12,4 z`} className="ch-rt-map__flag" />
        <circle cx={gx} cy={gy + 4} r="2.2" className="ch-rt-map__cup" />
        <rect x={gx - 8} y={ty + 4} width="16" height="6" rx="2" className="ch-rt-map__tee" />
        {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} className="ch-rt-map__path" />}
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={i === last ? 6.5 : 5} className={'ch-rt-map__stop' + (i === last && pending ? ' is-cur' : '')} />
            {i > 0 && (
              <text x={x} y={y + 3} textAnchor="middle" className={'ch-rt-map__n' + (i === last && pending ? ' is-cur' : '')}>
                {i}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption>Schematic</figcaption>
    </figure>
  );
}

/**
 * The hole's shots so far, folded to one line (dots and the last shot) and
 * opened to every shot. CH-11308: before the first shot it says so. CH-11602:
 * the rows show at once (hidden from a screen reader while folded) and the
 * chevron turns (base, ease-out); it doesn't turn with reduced motion.
 */
export function ShotLog({ shots, pref }: { shots: ShotRecord[]; pref: DistancePreference }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!shots.length)
    return (
      <div className="ch-rt-log is-empty" data-ch-code="CH-11308">
        <Icon icon={Flag} size={14} />
        No shots yet on this hole
      </div>
    );
  const last = shots[shots.length - 1]!;
  const penalties = shots.filter((s) => s.isPenalty).length;
  const lastText = last.isPenalty
    ? shotTitle(last)
    : `${shotTitle(last)} → ${RESULT_LABEL[last.result]}${last.result !== 'hole' ? `, ${distanceText(last.distanceToHoleAfter, last.distanceUnitAfter, pref)}` : ''}`;
  return (
    <div className={'ch-rt-log' + (open ? ' is-open' : '')}>
      <button type="button" className="ch-rt-log__h" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span className="ch-rt-log__dots" aria-hidden="true">
          {shots.map((s, i) => (
            <i key={i} className={lieClass(s)}>
              {s.isPenalty ? 'P' : s.shotNumber}
            </i>
          ))}
        </span>
        <span className="ch-rt-log__t">
          <b>
            {shots.length} stroke{shots.length === 1 ? '' : 's'}
            {penalties ? ` · ${penalties} penalt${penalties === 1 ? 'y' : 'ies'}` : ''}
          </b>
          <em>Last: {lastText}</em>
        </span>
        <Icon icon={ChevronDown} size={16} className="ch-rt-log__chev" />
      </button>
      <div className="ch-rt-log__b" id={bodyId} hidden={!open}>
        <ol>
          {shots.map((s, i) => (
            <li key={i} className="ch-rt-log__r">
              <span className={'ch-rt-log__n ' + lieClass(s)} aria-hidden="true">
                {s.isPenalty ? 'P' : s.shotNumber}
              </span>
              <span className="ch-rt-log__rb">
                <b>{shotTitle(s)}</b>
                <em>{shotLine(s, pref)}</em>
              </span>
              {s.isPenalty && <strong>+1</strong>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
