'use client';

import { useState } from 'react';
import { Button } from '@/components/fairway/controls/button';
import { INTEGRITY_COPY, type HoleIntegrityFlag } from '@/lib/golf/one-tap/hole-integrity';
import type { OneTapHoleCompletion, OneTapRoundView } from './use-one-tap-round';

/** Post-hole completion (master design §19): a clean hole says
 * "Hole 7 · 4 shots · complete ✓" for about two seconds and fades (the round
 * hook lowers it); a flagged hole says "check N items" and exposes Review,
 * which lists the §80 flags in plain words and offers the only two honest
 * moves — back to the hole to mark what is missing, or keep it as is. It
 * never edits a mark and never invents one. */
export function OneTapHoleComplete({ round }: { round: OneTapRoundView }) {
  const completion = round.completion;
  if (!completion) return null;
  return <CompletionCard key={`${completion.holeKey}:${completion.inferred}:${completion.review}`} completion={completion} round={round} />;
}
function shotsLabel(shots: number): string { return `${shots} ${shots === 1 ? 'shot' : 'shots'}`; }
export function penaltyLabel(strokes: number): string { return `+${strokes} ${strokes === 1 ? 'penalty' : 'penalty strokes'}`; }
function detailFor(flag: HoleIntegrityFlag, completion: OneTapHoleCompletion): string {
  if (flag === 'MISSING_CUP' && completion.inferred) return 'Closed at the next tee without a mark at the cup.';
  if (flag === 'LOW_LOCATION_QUALITY') return `${completion.report.weakMarks} of ${completion.report.markCount} marks had a weak GPS fix, so the distances are rough.`;
  return INTEGRITY_COPY[flag].detail;
}
const card = 'pointer-events-auto absolute inset-x-3 rounded-control border border-border-subtle bg-surface px-3 py-2 shadow-card';
const top = { top: 'calc(max(12px, env(safe-area-inset-top)) + 96px)' } as const;

function CompletionCard({ completion, round }: { completion: OneTapHoleCompletion; round: OneTapRoundView }) {
  const [reviewing, setReviewing] = useState(completion.review);
  const { flags } = completion.report;
  const penalties = completion.penaltyStrokes > 0 ? ` · ${penaltyLabel(completion.penaltyStrokes)}` : '';
  if (completion.clean && !completion.review) {
    return <div className={`${card} text-caption font-semibold text-text-primary`} style={top} role="status" data-slot="one-tap-hole-complete" data-integrity="CLEAN" data-hole-key={completion.holeKey}>
      Hole {completion.ordinal} · {shotsLabel(completion.shots)}{penalties} · complete ✓
    </div>;
  }
  const headline = completion.review
    ? `Hole ${completion.ordinal} · ${shotsLabel(completion.shots)}${penalties} · ${flags.length ? `check ${flags.length} ${flags.length === 1 ? 'item' : 'items'}` : 'nothing to check'}`
    : `Hole ${completion.ordinal} · check ${flags.length} ${flags.length === 1 ? 'item' : 'items'}`;
  const closed = completion.report.status === 'COMPLETE';
  return <div className={card} style={top} role="status" data-slot="one-tap-hole-complete" data-integrity={completion.report.integrity} data-inferred={completion.inferred ? 'true' : undefined}
    data-review={completion.review ? 'true' : undefined} data-hole-key={completion.holeKey}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-caption font-semibold text-text-primary">{headline}</span>
      {!completion.review && <Button variant="ghost" size="sm" onClick={() => setReviewing(r => !r)} aria-expanded={reviewing} data-slot="one-tap-review">Review</Button>}
    </div>
    {reviewing && <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-2" data-slot="one-tap-review-panel">
      {flags.length > 0 && <ul className="flex flex-col gap-1.5">
        {flags.map(flag => <li key={flag} className="text-caption text-text-secondary" data-flag={flag}>
          <span className="font-semibold text-text-primary">{INTEGRITY_COPY[flag].title}</span> — {detailFor(flag, completion)}
        </li>)}
      </ul>}
      <div className="flex items-center gap-2">
        {closed && <Button variant="secondary" size="sm" onClick={round.returnToCompleted} data-slot="one-tap-review-back">{completion.inferred ? `Back to hole ${completion.ordinal}` : 'Reopen hole'}</Button>}
        <Button variant="ghost" size="sm" onClick={round.dismissCompletion} data-slot="one-tap-review-keep">{completion.review ? 'Close' : 'Keep as is'}</Button>
      </div>
    </div>}
  </div>;
}
