import React from 'react';
import { green } from './geom.jsx';
import { YardagePage } from './YardagePage.jsx';

export function PuttingGreen({ rows = [], title = 'On the green', meta = 'Make % by distance', note, className = '', style }) {
  const svg = green(rows.slice(0, 5).map((r) => ({ b: r.band, made: r.made, att: r.attempts, bench: r.benchmark })), { w: 360, h: 256, base: '#FBF8EF', fill: '#1F6B45', sep: '#FBF8EF', hole: '#1C1B18', flag: '#B03A2E', leader: 'rgb(28 25 18 / .35)' });
  return (
    <YardagePage title={title} meta={meta} note={note} className={className} style={style}>
      <div className="fw-yb-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </YardagePage>
  );
}
