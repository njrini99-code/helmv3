import type { CSSProperties } from 'react';
import type { SheetStrip } from './in-class-model';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: the today strip at the top of the In class now sheet. One lane per tracked player with a block
 * (fills, with an exam told by a ring: shape, not colour), or one density bar above 12 lanes (the height carries the
 * count, never opacity). The shared free window is a band behind the lanes with its label; the now line moves once a
 * minute. The list below carries all the same information, so the strip is hidden from assistive tech.
 */
export function TodayStrip({ strip }: { strip: SheetStrip }) {
  const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
  return (
    <div className="ch-ca-strip" aria-hidden="true">
      <div className={'ch-ca-strip__plot' + (strip.density ? ' is-density' : '')} style={{ ['--ch-ca-lanes' as string]: strip.density ? 1 : strip.lanes.length } as CSSProperties}>
        {strip.free && <i className="ch-ca-strip__free" style={{ left: pct(strip.free.left), width: pct(strip.free.width) }} />}
        {strip.ticks.map((t) => (
          <i key={t.label} className="ch-ca-strip__tick" style={{ left: pct(t.at) }} />
        ))}
        {strip.density ? (
          <div className="ch-ca-strip__bar">
            {strip.density.slots.map((s, i) =>
              s.height ? <i key={i} className="ch-ca-strip__slot" style={{ left: pct(s.left), width: pct(s.width), height: `${s.height}px` }} /> : null,
            )}
          </div>
        ) : (
          strip.lanes.map((l) => (
            <div key={l.playerId} className="ch-ca-strip__lane">
              {l.blocks.map((b, i) => (
                <i key={i} className={'ch-ca-strip__block' + (b.exam ? ' is-exam' : '')} style={{ left: pct(b.left), width: pct(b.width) }} />
              ))}
            </div>
          ))
        )}
        {strip.now != null && <i className="ch-ca-strip__now" style={{ left: pct(strip.now) }} />}
      </div>
      <div className="ch-ca-strip__axis">
        {strip.ticks.map((t) => (
          <span key={t.label} className="ch-num" style={{ left: pct(t.at) }}>
            {t.label}
          </span>
        ))}
      </div>
      {strip.density && (
        <div className="ch-ca-strip__legend">
          <span>Players in class</span>
          <span className="ch-num">0 to {strip.density.teamSize}</span>
        </div>
      )}
      {strip.free && <div className="ch-ca-strip__label">{strip.free.label}</div>}
    </div>
  );
}
