import type { ReactNode } from 'react';

/**
 * A long admin list: the first `shown` items in place, the rest folded behind one "Show N more" row, in the same
 * order. No script: a native `<details>`, so it works on a server-rendered page and a phone. Lists of hundreds of rows
 * under a page's main content (914 archived fixes on Incidents, 185 at-risk accounts on Users) made the page tens of
 * thousands of pixels tall on a phone (2026-11-26).
 */
export function FoldRest<T>({
  items,
  shown,
  noun,
  children,
}: {
  items: readonly T[];
  shown: number;
  /** What the hidden items are, plural: "older fixes", "more accounts". */
  noun: string;
  children: (item: T) => ReactNode;
}) {
  const head = items.slice(0, shown);
  const rest = items.slice(shown);
  return (
    <>
      {head.map(children)}
      {rest.length > 0 ? (
        <li className="list-none">
          <details className="group/fold">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-body-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
              <span className="group-open/fold:hidden">
                Show {rest.length} {noun}
              </span>
              <span className="hidden group-open/fold:inline">Hide {noun}</span>
            </summary>
            <ul className="divide-y divide-warm-200/60">{rest.map(children)}</ul>
          </details>
        </li>
      ) : null}
    </>
  );
}
