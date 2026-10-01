import React from 'react';

export function StatPlate({ label, value, unit, delta, good = true, className = '', style }) {
  return (
    <div className={'fw-yb fw-yb-stat ' + className} style={style}>
      <span className="fw-yb-stat__k">{label}</span>
      <span className="fw-yb-stat__v">{value}{unit && <small>{unit}</small>}</span>
      {delta != null && <span className={'fw-yb-stat__d ' + (good ? 'is-gain' : 'is-loss')}>{delta}</span>}
    </div>
  );
}
