import React from 'react';
import { route } from './geom.jsx';
import { YardagePage } from './YardagePage.jsx';

export function StrokesGainedRoute({ rows = [], max = 1, title = 'Tee to hole', meta = 'Strokes gained', note, className = '', style }) {
  const svg = route(rows.map((r) => ({ k: r.label, v: r.value })), { w: 360, h: 220, max, line: '#1C1B18', node: '#FBF8EF', pos: '#1F6B45', neg: '#9A6512' });
  return (
    <YardagePage title={title} meta={meta} note={note} className={className} style={style}>
      <div className="fw-yb-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </YardagePage>
  );
}
