import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'info';

/**
 * `decorative`: the badge repeats what its control already says in words (a calendar row names its state in hidden text,
 * SWP-03), so it is drawn for the eye only and kept out of the control's name.
 */
export function Badge({ tone = 'neutral', dot = false, decorative = false, children }: { tone?: BadgeTone; dot?: boolean; decorative?: boolean; children: ReactNode }) {
  return (
    <span className={`ch-badge ch-badge--${tone}`} aria-hidden={decorative || undefined}>
      {dot && <span className="ch-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
