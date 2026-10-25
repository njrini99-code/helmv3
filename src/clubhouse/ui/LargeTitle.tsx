import type { ReactNode } from 'react';
import { Skeleton } from './States';

/**
 * The phone's one large title (owner decision 4, 2026-10-24: one 34 semibold sans title on every phone section root,
 * CONS-27). One class, `.ch-large-title` on `--ch-type-large-title` (styles/shell.css, "Phone large titles"), so no
 * screen sets its own size, weight, tracking or face; and one attribute, `data-ch-large-title`, which the shell's bar
 * watches (shell/large-title.tsx) and the page and skeleton tests look for (CONS-13). The phone only: on desktop the
 * element keeps its page's own hero rule.
 *
 * `as`: an `h1` when the title is the page's heading; a `p` when the top bar already holds the page's h1 (one h1 per
 * screen), which then hides it from VoiceOver with `hidden` so the name is not read twice.
 */
export function LargeTitle({
  as: Tag = 'h1',
  id,
  hidden = false,
  className,
  children,
}: {
  as?: 'h1' | 'p';
  id?: string;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={'ch-large-title' + (className ? ` ${className}` : '')} aria-hidden={hidden || undefined} data-ch-large-title="">
      {children}
    </Tag>
  );
}

/**
 * The large title's block in a loading skeleton (CONS-13): the same class, so the same line box, top and tracking as the
 * page's title, with a bar where the words will be. While it shows, the shell's bar hides its title exactly as it will
 * once the page lands, so nothing flickers.
 */
export function LargeTitleSkeleton({ width = 160, className }: { width?: number | string; className?: string }) {
  return (
    <div className={'ch-large-title ch-large-title--skel' + (className ? ` ${className}` : '')} aria-hidden="true" data-ch-large-title="">
      <Skeleton width={width} height={30} radius={8} />
    </div>
  );
}
