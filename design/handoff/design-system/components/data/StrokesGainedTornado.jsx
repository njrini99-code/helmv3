import React from 'react';

const fmt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);

export function StrokesGainedTornado({ rows = [], max, caption = 'Strokes gained per round', reference = 'vs. scratch', className = '' }) {
  const m = max || Math.max(1, Math.ceil(Math.max(...rows.map((r) => Math.abs(r.value))) * 2) / 2);
  return (
    <div className={'fw-sg ' + className} role="table" aria-label={caption}>
      {(caption || reference) && <div className="fw-sg__cap"><span>{caption}</span><span>{reference}</span></div>}
      {rows.map((r) => {
        const pct = Math.min(50, (Math.abs(r.value) / m) * 50);
        const pos = r.value >= 0;
        return (
          <div key={r.label} role="row" className={'fw-sg__row' + (r.focus ? ' fw-sg__row--focus' : '')}>
            <span role="rowheader" className="fw-sg__label">{r.label}</span>
            <span className="fw-sg__track" aria-hidden="true"><span className={'fw-sg__bar fw-sg__bar--' + (pos ? 'pos' : 'neg')} style={{ width: pct + '%' }} /></span>
            <span role="cell" className={'fw-sg__value fw-sg__value--' + (pos ? 'pos' : 'neg')}>{fmt(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
