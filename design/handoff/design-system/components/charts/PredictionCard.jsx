import React from 'react';
import { landing, sg } from './geom.jsx';
import { YardagePage } from './YardagePage.jsx';

export function PredictionCard({ score, low, high, confidence, average, reasons = [], title = 'Next round', meta, note, className = '', style }) {
  const svg = landing({ score, lo: low, hi: high, confidence, avg: average }, { w: 470, rough: '#E4E6D6', fw1: '#C9DCCA', fw2: '#BDD3BF', ink: '#1C1B18', flag: '#B03A2E' });
  return (
    <YardagePage title={title} meta={meta} note={note} className={className} style={style}>
      <div className="fw-yb-hero">
        <span className="fw-yb-hero__n">{score}</span>
        <div className="fw-yb-hero__m"><b>Landing zone {low}–{high}</b>{confidence}% confidence · average {Number(average).toFixed(1)}</div>
      </div>
      <div className="fw-yb-svg" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: svg }} />
      {reasons.length > 0 && (
        <ol className="fw-yb-notes">
          {reasons.map((r, i) => <li key={i}><i>{i + 1}</i><span>{r.text}</span><b className={r.value >= 0 ? 'is-gain' : 'is-loss'}>{sg(r.value)}</b></li>)}
        </ol>
      )}
    </YardagePage>
  );
}
