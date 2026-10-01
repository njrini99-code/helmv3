import React from 'react';
import { trend } from './geom.jsx';
import { YardagePage } from './YardagePage.jsx';
import { ScoreBoard } from './ScoreBoard.jsx';

export function ScoreTrend({ rounds = [], par = 72, events = [], board = true, width = 690, title = 'Scoring', meta, note, className = '', style }) {
  const id = 'st' + (React.useId ? React.useId() : '').replace(/[^a-z0-9]/gi, '');
  const pad = width / (Math.max(rounds.length, 1) * 2);
  const svg = rounds.length > 1 ? trend(rounds.map((r) => ({ l: r.label, v: r.score })), { id, w: width, h: 176, pad: { t: 28, r: pad, b: 8, l: pad }, stroke: '#1C1B18', sw: 1.5, area: false, grid: 'rgb(28 25 18 / .1)', meanColor: 'rgb(28 25 18 / .35)', events: events.map((e) => ({ i: e.index, text: e.text })), annLine: '#155A39', dotFill: '#FBF8EF', ring: '#FBF8EF', endLabel: false, xLabels: !board }) : '';
  return (
    <YardagePage title={title} meta={meta || 'Par ' + par} note={note} className={className} style={style}>
      <div className="fw-yb-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {board && <ScoreBoard rounds={rounds} par={par} />}
    </YardagePage>
  );
}
