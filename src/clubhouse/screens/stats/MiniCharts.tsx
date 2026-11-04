import type { CSSProperties } from 'react';
import { formatSigned, NO_DATA } from '../../lib/format';
import { sgScale } from '../../lib/sg';
import { divergeBar, sgTone, type ShsTone } from './shs-figures';

/** Four mini diverging rows: label, a bar from a centre zero, the signed value. The card is the tap, so no whisker and no pin. */
export function MiniDiverging({ rows, ready = true, fixedScale }: { rows: ReadonlyArray<{ label: string; value: number | null }>; ready?: boolean; fixedScale?: number }) {
  if (!ready)
    return (
      <div className="ch-shs-mrows is-wait">
        {rows.map((r) => (
          <div className="ch-shs-mrow" key={r.label}>
            <span className="lab">{r.label}</span>
            <span className="val ch-shs-none">{NO_DATA}</span>
          </div>
        ))}
      </div>
    );
  const scale = fixedScale ?? sgScale(rows.map((r) => r.value));
  return (
    <div className="ch-shs-mrows">
      {rows.map((r) => {
        const tone = sgTone(r.value);
        const bar = r.value == null ? null : divergeBar(r.value, scale);
        return (
          <div className="ch-shs-mrow" key={r.label}>
            <span className="lab">{r.label}</span>
            <span className="ch-shs-rail" aria-hidden="true">
              <span className="ch-shs-zero" />
              {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}`} data-ch-grow="" style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(r.value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
            </span>
            <span className={`val${tone === 'flat' ? '' : ` ch-shs-${tone}`}${r.value == null ? ' ch-shs-none' : ''}`}>{formatSigned(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface MiniRailRow {
  label: string;
  /** 0 to 100, null reads "—" with an empty rail. */
  value: number | null;
  /** The Tour's value: draws a tick and tones the fill; with none, the fill is flat and no tick draws. */
  tour?: number | null;
  /** An early read draws its fill hollow. */
  early?: boolean;
}

/** The rail fill's tone: gain at or past the Tour, loss short of it, flat with no Tour figure (04 "Part cards"). */
export function railTone(value: number | null, tour: number | null | undefined): ShsTone {
  if (value == null || tour == null) return 'flat';
  return value >= tour ? 'gain' : 'loss';
}

/** Labelled rails, one shared grid, 0 to 100. A Tour tick draws only when a Tour value is passed. */
export function MiniRails({ rows, caption }: { rows: readonly MiniRailRow[]; caption?: string }) {
  return (
    <>
      <div className="ch-shs-mrails">
        {rows.map((r) => (
          <div className="ch-shs-mr" key={r.label}>
            <span className="l">{r.label}</span>
            <span className="ch-shs-hrail" aria-hidden="true">
              {r.value != null && <i className={`ch-shs-fill-${railTone(r.value, r.tour)}${r.early ? ' is-early' : ''}`} data-ch-grow="" style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }} />}
              {r.tour != null && <span className="ch-shs-tour" style={{ left: `${Math.max(0, Math.min(100, r.tour))}%` }} />}
            </span>
            <span className={'v ch-num' + (r.value == null ? ' ch-shs-none' : '')}>{r.value == null ? NO_DATA : `${Math.round(r.value)}%`}</span>
          </div>
        ))}
      </div>
      {caption && <div className="ch-shs-mini-cap">{caption}</div>}
    </>
  );
}

export interface TickerRound {
  id: string;
  score: number;
}

/** Bar heights for the ticker: taller is a lower score on one shared range, at least 6; the best is the lowest, and a lone round has no best. */
export function tickerBars(rounds: readonly TickerRound[], W = 300, H = 64): Array<{ id: string; x: number; y: number; w: number; h: number; best: boolean }> {
  const n = rounds.length;
  if (!n) return [];
  const gap = n > 12 ? 3 : 5;
  const w = (W - gap * (n - 1)) / n;
  const scores = rounds.map((r) => r.score);
  const worst = Math.max(...scores) + 1;
  const low = Math.min(...scores) - 3;
  const best = Math.min(...scores);
  return rounds.map((r, i) => {
    const h = Math.max(6, ((worst - r.score) / (worst - low)) * H);
    return { id: r.id, x: i * (w + gap), y: H - h, w, h, best: n > 1 && r.score === best };
  });
}

/** One bar per round, oldest on the left, taller is lower, the best in green (and no amber). It reads rounds only. */
export function RoundTicker({ rounds }: { rounds: readonly TickerRound[] }) {
  return (
    <svg className="ch-shs-tick" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
      {tickerBars(rounds).map((b) => (
        <rect key={b.id} className={b.best ? 'is-best' : 'is-flat'} data-ch-grow-y="" x={b.x} y={b.y} width={b.w} height={b.h} rx="2.5" />
      ))}
    </svg>
  );
}

/** A goal's ring, from `progressOf`; it never invents progress, so a goal with no baseline draws no ring (the caller writes it as text). */
export function GoalRing({ progress, label }: { progress: number; label: string }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <span className="ch-shs-rg">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="rt" cx="32" cy="32" r={r} />
        <circle className="rf" cx="32" cy="32" r={r} transform="rotate(-90 32 32)" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - Math.max(0, Math.min(100, progress)) / 100), '--ch-ring-c': c } as CSSProperties} />
      </svg>
      <span className="ch-num">{label}</span>
    </span>
  );
}
