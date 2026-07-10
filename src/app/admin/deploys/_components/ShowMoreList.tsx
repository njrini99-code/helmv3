'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Mobile "collapsed-by-default" section (Mobile Doctrine rule 3 — cap the
 * scroll, don't dump every row). Row markup + data mapping stay
 * server-rendered in the caller; this leaf owns ONLY the expanded boolean, so
 * the deploys page itself never needs `'use client'`.
 *
 * `initial` and `more` are pre-rendered lists of `<li>` elements (or
 * fragments thereof) sharing ONE `<ul>` — never two adjacent lists — so the
 * `divide-y`/`space-y` rhythm the caller applies to the `<ul>` stays
 * unbroken across the expand boundary.
 */
export function ShowMoreList({
  initial,
  more,
  moreCount,
  itemLabel = 'item',
  listClassName,
}: {
  initial: React.ReactNode;
  more: React.ReactNode;
  moreCount: number;
  itemLabel?: string;
  listClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <ul className={listClassName}>
        {initial}
        {expanded ? more : null}
      </ul>
      {moreCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full bg-surface-sunken text-warm-700 hover:text-accent-700"
        >
          {expanded ? 'Show less' : `Show ${moreCount} more ${itemLabel}${moreCount === 1 ? '' : 's'}`}
        </Button>
      ) : null}
    </div>
  );
}
