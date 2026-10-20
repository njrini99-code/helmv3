import React from 'react';
import { spray } from './geom.jsx';
import { YardagePage } from './YardagePage.jsx';

export function DriveDispersion({ shots = [], fairway = 30, lateral = 36, range = [250, 310], title = 'Driver', meta, note, className = '', style }) {
  const id = 'dd' + (React.useId ? React.useId() : '').replace(/[^a-z0-9]/gi, '');
  const r = spray(shots, { id, w: 360, h: 256, lat: lateral, d0: range[0], d1: range[1], fw: fairway, rough: '#E4E6D6', fw1: '#CBDDCC', fw2: '#BFD5C1', stripes: true, grid: 'rgb(28 25 18 / .16)', target: 'rgb(28 25 18 / .4)', ell: '#0B3A25', ellFill: 'rgb(11 58 37 / .08)', hit: '#0B3A25', hitRing: '#FBF8EF', miss: '#9A6512', missFill: '#FBF8EF', cross: '#0B3A25', labels: true });
  return (
    <YardagePage title={title} meta={meta || r.hits + ' of ' + shots.length + ' fairways'} note={note || 'Carries ' + r.carry + ' yds on average.'} className={className} style={style}>
      <div className="fw-yb-svg fw-yb-field" dangerouslySetInnerHTML={{ __html: r.svg }} />
    </YardagePage>
  );
}
