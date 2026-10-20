type Kind = 'eagle' | 'birdie' | 'bogey' | 'double' | '';

function kindOf(score: number | null, par: number | null): Kind {
  if (score == null || par == null) return '';
  const d = score - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'double' : '';
}

/**
 * One hole in classic scorecard notation: circles under par (red), squares
 * over par (green outline), doubled for eagle and double bogey.
 */
export function ScoreMark({ score, par, size = 'md' }: { score: number | null; par: number | null; size?: 'sm' | 'md' }) {
  const kind = kindOf(score, par);
  const cls = ['ch-score', size === 'sm' && 'ch-score--sm', kind && `ch-score--${kind}`, score == null && 'ch-score--empty']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} aria-label={score == null ? 'Not played' : `${score}${kind ? ` (${kind})` : ''}`}>
      {score == null ? '–' : score}
    </span>
  );
}
