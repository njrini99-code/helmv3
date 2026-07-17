'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/fairway';

/**
 * Owns ONLY the expanded boolean (same minimal-client idiom as
 * ShowMoreList.tsx in this same folder) — the release card's summary row and
 * its expanded feature-delta/new-fingerprint detail both stay server-
 * rendered in the caller, so the deploys page itself never needs
 * `'use client'` just to support one toggle per card.
 */
export function ReleaseCardExpand({ summary, detail }: { summary: ReactNode; detail: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {summary}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        fullWidth
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-2 bg-surface-sunken text-warm-700 hover:text-accent-700"
      >
        {expanded ? 'Hide feature breakdown' : 'View feature breakdown & new fingerprints'}
      </Button>
      {expanded ? detail : null}
    </div>
  );
}
