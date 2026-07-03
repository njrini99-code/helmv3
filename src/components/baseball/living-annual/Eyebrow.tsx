/**
 * Eyebrow — the small-caps dateline label of the Living Annual.
 *
 * `POSITION · CLASS · STATE` grammar (spec §4.1): 11px, uppercase,
 * `tracking-[0.14em]`, middot-joined. Pass `items` to have empty segments
 * dropped and the rest joined with ` · `, or pass `children` for free text.
 *
 * No hooks — safe to render in a server component.
 */
import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EyebrowProps {
  /** Segments joined with ` · ` (falsy entries are dropped). */
  items?: Array<string | null | undefined | false>;
  /** Free-form content (used when `items` is omitted). */
  children?: ReactNode;
  /** Accent ink; defaults to the recessive graphite dateline. */
  ink?: 'team' | 'pursuit' | 'muted';
  /** Element to render as (default `p`). */
  as?: ElementType;
  className?: string;
}

const INK_TEXT: Record<NonNullable<EyebrowProps['ink']>, string> = {
  team: 'text-grade-plus',
  pursuit: 'text-pursuit',
  muted: 'text-text-tertiary',
};

export function Eyebrow({ items, children, ink = 'muted', as, className }: EyebrowProps) {
  const Comp: ElementType = as ?? 'p';
  const content = items ? items.filter(Boolean).join(' · ') : children;

  return (
    <Comp
      className={cn(
        'text-eyebrow font-semibold uppercase leading-none tracking-[0.14em]',
        INK_TEXT[ink],
        className,
      )}
    >
      {content}
    </Comp>
  );
}
