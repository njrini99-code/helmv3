import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'info';

export function Badge({ tone = 'neutral', dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`ch-badge ch-badge--${tone}`}>
      {dot && <span className="ch-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
