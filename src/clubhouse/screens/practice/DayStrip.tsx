import { plural } from '../../lib/plural';
import { fmtMinutes } from './builder/builder-model';

export type DayTone = 'skill' | 'random' | 'pressure' | 'plain' | 'ghost' | 'open';
export interface DaySeg {
  id: string;
  /** Minutes: the segment's width is its share of the day. */
  min: number;
  tone?: DayTone;
}

/** The strip in words, for a screen reader and for the test: what is drawn is what is said. */
export function dayStripLabel(segs: readonly DaySeg[]): string {
  const planned = segs.filter((s) => s.tone !== 'open' && s.tone !== 'ghost');
  const total = planned.reduce((n, s) => n + s.min, 0);
  const open = segs.filter((s) => s.tone === 'open').reduce((n, s) => n + s.min, 0);
  const ghost = segs.filter((s) => s.tone === 'ghost').reduce((n, s) => n + s.min, 0);
  return [`${plural(planned.length, 'block')}, ${fmtMinutes(total)}`, ghost ? `${fmtMinutes(ghost)} suggested` : '', open ? `${fmtMinutes(open)} open` : ''].filter(Boolean).join(', ');
}

/**
 * The day drawn to scale (the design's strip): one segment a block, its width its minutes, its colour the kind of work where a drill says so.
 * Drawn whole at first paint; nothing grows (owner Q-153). The ends can carry the clock.
 */
export function DayStrip({ segs, from, to }: { segs: readonly DaySeg[]; from?: string; to?: string }) {
  const shown = segs.filter((s) => s.min > 0);
  if (shown.length === 0) return null;
  return (
    <div className="ch-prc-day">
      <div className="ch-prc-day__bar" role="img" aria-label={dayStripLabel(shown)}>
        {shown.map((s) => (
          <i key={s.id} data-tone={s.tone ?? 'plain'} style={{ flexGrow: s.min }} />
        ))}
      </div>
      {(from || to) && (
        <div className="ch-prc-day__ends ch-num" aria-hidden="true">
          <span>{from}</span>
          <span>{to}</span>
        </div>
      )}
    </div>
  );
}

const KIND_WORD = { skill: 'Skill', random: 'Random', pressure: 'Pressure' } as const;

/**
 * The strip's key: each kind of work drawn, with its minutes. It counts the same clock minutes the strip draws (a rotation's hour is shared
 * between its stations), so the two can't disagree. A day with no drill kinds has no key.
 */
export function DayLegend({ segs }: { segs: readonly DaySeg[] }) {
  const min = { skill: 0, random: 0, pressure: 0 };
  for (const seg of segs) if (seg.tone === 'skill' || seg.tone === 'random' || seg.tone === 'pressure') min[seg.tone] += Math.round(seg.min);
  if (min.skill + min.random + min.pressure === 0) return null;
  return (
    <p className="ch-prc-ribbon__mix ch-num">
      {(['skill', 'random', 'pressure'] as const).map((k) =>
        min[k] > 0 ? (
          <span key={k} data-tone={k}>
            {KIND_WORD[k]} {fmtMinutes(min[k])}
          </span>
        ) : null,
      )}
    </p>
  );
}
