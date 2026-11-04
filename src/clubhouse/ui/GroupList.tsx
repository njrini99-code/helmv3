import type { CSSProperties, ReactNode } from 'react';

/**
 * Rows inside one card (DESIGN_LANGUAGE 7): 52pt, 64 with a sub-line, a hairline inset past the leading coin, a press wash and no
 * scale. `inset` overrides how far in the hairline starts.
 */
export function GroupList({ inset, className, children }: { inset?: string; className?: string; children: ReactNode }) {
  const style = inset ? ({ '--ch-group-inset': inset } as CSSProperties) : undefined;
  return (
    <ul className={'ch-group' + (className ? ` ${className}` : '')} style={style}>
      {children}
    </ul>
  );
}

export function GroupRow({ twoLine = false, className, children }: { twoLine?: boolean; className?: string; children: ReactNode }) {
  return (
    <li className={'ch-group__row' + (className ? ` ${className}` : '')} data-two-line={twoLine ? '' : undefined}>
      {children}
    </li>
  );
}
