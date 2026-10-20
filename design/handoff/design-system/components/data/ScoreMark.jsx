import React from 'react';

export function ScoreMark({ score, par, current = false, size = 'md', className = '' }) {
  let kind = '';
  if (score != null && par != null) {
    const d = score - par;
    kind = d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'double' : '';
  }
  const cls = ['fw-score', size === 'sm' && 'fw-score--sm', kind && 'fw-score--' + kind, score == null && 'fw-score--empty', current && 'fw-score--current', className].filter(Boolean).join(' ');
  return <span className={cls} aria-label={score == null ? 'Not played' : score + (kind ? ' (' + kind + ')' : '')}>{score == null ? '–' : score}</span>;
}
