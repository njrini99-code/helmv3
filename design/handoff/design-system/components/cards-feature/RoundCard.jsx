import React from 'react';
import { ScoreMark } from '../data/ScoreMark.jsx';
import { Icon } from '../icons/Icon.jsx';

const sum = (a, k) => a.reduce((s, h) => s + (h[k] || 0), 0);

export function RoundCard({ course, meta, score, toPar, badge, stats = [], holes = [], actionLabel = 'View recap', onOpen, className = '', style }) {
  const total = score != null ? score : sum(holes, 'score');
  const tp = toPar != null ? toPar : sum(holes, 'score') - sum(holes, 'par');
  const tpLabel = tp === 0 ? 'E' : tp > 0 ? '+' + tp : '−' + Math.abs(tp);
  const nine = (seg, name) => seg.length > 0 && (
    <div className="fw-roundcard__nine">
      <span>{name}</span>
      {seg.map((h) => <ScoreMark key={h.n} size="sm" score={h.score} par={h.par} />)}
      <b>{sum(seg, 'score')}</b>
    </div>
  );
  return (
    <article className={'fw-card fw-roundcard ' + className} style={style}>
      <header className="fw-card__head">
        <div style={{ minWidth: 0 }}><div className="fw-card__title">{course}</div>{meta && <div className="fw-card__meta">{meta}</div>}</div>
        {badge}
      </header>
      <div className="fw-roundcard__main">
        <div className="fw-roundcard__score">
          <span className="fw-roundcard__total">{total}</span>
          <span className={'fw-roundcard__topar fw-toPar--' + (tp < 0 ? 'under' : tp > 0 ? 'over' : 'even')}>{tpLabel}</span>
        </div>
        {stats.length > 0 && <dl className="fw-roundcard__stats">{stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>}
      </div>
      {holes.length > 0 && <div className="fw-roundcard__holes">{nine(holes.slice(0, 9), 'Out')}{nine(holes.slice(9, 18), 'In')}</div>}
      {onOpen && <button className="fw-card__link" onClick={onOpen}>{actionLabel}<Icon name="arrow-right" size={14} /></button>}
    </article>
  );
}
