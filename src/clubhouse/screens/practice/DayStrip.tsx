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
  return [`${planned.length} ${planned.length === 1 ? 'block' : 'blocks'}, ${fmtMinutes(total)}`, ghost ? `${fmtMinutes(ghost)} suggested` : '', open ? `${fmtMinutes(open)} open` : ''].filter(Boolean).join(', ');
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
