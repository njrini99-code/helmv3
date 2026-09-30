import React from 'react';

const short = (n = '') => { const p = n.trim().split(/\s+/); return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : n; };

export function NamePlate({ pos, name, score, abbreviate = true, className = '', style }) {
  const s = score == null ? null : score === 0 ? 'E' : score > 0 ? '+' + score : '−' + Math.abs(score);
  const kind = score == null ? '' : score < 0 ? 'under' : score > 0 ? 'over' : 'even';
  return (
    <span className={'fw-plate ' + className} style={style}>
      {pos != null && <span className="fw-plate__pos">{pos}</span>}
      <span className="fw-plate__name">{abbreviate ? short(name) : name}</span>
      {s != null && <span className={'fw-plate__score fw-plate__score--' + kind}>{s}</span>}
    </span>
  );
}
