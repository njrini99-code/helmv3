import React from 'react';
import { ScoreMark } from './ScoreMark.jsx';

const sum = (a, k) => a.reduce((s, h) => s + (h[k] || 0), 0);

export function RoundStrip({ holes = [], current, showYards = false, className = '' }) {
  const out = holes.slice(0, 9), inn = holes.slice(9, 18), full = holes.length > 9;
  const played = holes.filter((h) => h.score != null);
  const toPar = sum(played, 'score') - sum(played, 'par');
  const tp = toPar === 0 ? 'E' : toPar > 0 ? '+' + toPar : '−' + Math.abs(toPar);
  const cells = (seg, key, render) => seg.map((h, i) => <td key={i} className={i === 0 && seg === inn ? 'fw-round__split' : ''}>{render(h)}</td>);
  const tot = (seg, k) => (seg.some((h) => h[k] == null) && k === 'score' ? sum(seg.filter((h) => h.score != null), k) || '—' : sum(seg, k));
  return (
    <div style={{ overflowX: 'auto' }} className={className}>
      <table className="fw-round">
        <thead><tr><th style={{ textAlign: 'left' }}>Hole</th>
          {out.map((h) => <th key={h.n}>{h.n}</th>)}<th className="fw-round__sum">Out</th>
          {full && inn.map((h, i) => <th key={h.n} className={i === 0 ? 'fw-round__split' : ''}>{h.n}</th>)}{full && <th className="fw-round__sum">In</th>}
          <th className="fw-round__sum">Tot</th></tr></thead>
        <tbody>
          {showYards && <tr><th>Yards</th>{cells(out, 'y', (h) => h.yards)}<td className="fw-round__sum">{sum(out, 'yards')}</td>{full && cells(inn, 'y', (h) => h.yards)}{full && <td className="fw-round__sum">{sum(inn, 'yards')}</td>}<td className="fw-round__sum">{sum(holes, 'yards')}</td></tr>}
          <tr className="fw-round__par"><th>Par</th>{cells(out, 'p', (h) => h.par)}<td className="fw-round__sum">{sum(out, 'par')}</td>{full && cells(inn, 'p', (h) => h.par)}{full && <td className="fw-round__sum">{sum(inn, 'par')}</td>}<td className="fw-round__sum">{sum(holes, 'par')}</td></tr>
          <tr><th>Score</th>{cells(out, 's', (h) => <ScoreMark score={h.score} par={h.par} current={h.n === current} />)}<td className="fw-round__sum">{tot(out, 'score')}</td>{full && cells(inn, 's', (h) => <ScoreMark score={h.score} par={h.par} current={h.n === current} />)}{full && <td className="fw-round__sum">{tot(inn, 'score')}</td>}<td className="fw-round__sum"><span className={'fw-toPar fw-toPar--' + (toPar < 0 ? 'under' : toPar > 0 ? 'over' : 'even')}>{sum(played, 'score') || '—'} <small style={{ fontSize: 11 }}>{played.length ? tp : ''}</small></span></td></tr>
        </tbody>
      </table>
    </div>
  );
}
