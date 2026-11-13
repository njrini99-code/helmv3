'use client';

import { useState } from 'react';

/** Over this many characters, or lines, the rules start folded to three lines. */
const FOLD_CHARS = 160;
const FOLD_LINES = 3;

/**
 * A qualifier's scoring rules, said once (coach audit, 13 Nov 2026: they printed twice, under the leaderboard and again under
 * Scoring rules, as one run-on). The coach's own line breaks are kept; long rules start folded to three lines with a way to
 * read the rest.
 */
export function RulesText({ text }: { text: string }) {
  const long = text.length > FOLD_CHARS || text.split('\n').length > FOLD_LINES;
  const [open, setOpen] = useState(false);
  const folded = long && !open;
  return (
    <>
      <p className={'ch-qf-why ch-qf-rules' + (folded ? ' is-folded' : '')}>{text}</p>
      {long && (
        <button type="button" className="ch-qf-rules__more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show all rules'}
        </button>
      )}
    </>
  );
}
