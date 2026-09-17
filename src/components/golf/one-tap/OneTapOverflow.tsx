'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/fairway/controls/button';
import type { StageMenuItem } from '@/components/golf/course-geometry/HoleSceneFrame';
import { LOCAL_RULE_CAVEAT } from '@/lib/golf/one-tap/competition-policy';
import { PENALTY_COPY, PENALTY_KINDS, type PenaltyKind, type PenaltyStrokes } from '@/lib/golf/one-tap/penalty-event';
import type { OneTapRoundView } from './use-one-tap-round';
import type { OneTapView } from './use-one-tap';

/** The ••• menu (master design §79): everything that is not MARK BALL lives
 * here so the primary screen stays clean — Penalty / drop, Delete last
 * mark, Review hole, Change hole, Skip hole, Pause tracking, Use standard
 * tracking. Nothing here branches the record: a penalty is a separate
 * score event (§58) whose drop is the next ordinary mark, a deleted mark
 * is a tombstone, a skip is round state. */
export type OneTapSheet = 'penalty' | 'hole' | 'mode';
export interface OneTapOverflow { items: StageMenuItem[]; sheet: ReactNode; open: OneTapSheet | null }

export function useOneTapOverflow({ view, round, onUseStandardTracking, onExitRound }: { view: OneTapView; round: OneTapRoundView | null; onUseStandardTracking?: () => void; onExitRound?: () => void }): OneTapOverflow {
  const [open, setOpen] = useState<OneTapSheet | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const items = useMemo<StageMenuItem[]>(() => {
    const list: StageMenuItem[] = [];
    if (round) list.push({ key: 'penalty', label: 'Penalty / drop', onSelect: () => setOpen('penalty'), disabled: round.status === 'COMPLETE' });
    list.push({ key: 'delete-last', label: 'Delete last mark', onSelect: view.deleteLastMark, disabled: !view.canDeleteLastMark });
    // The last mark was made at the cup itself: close on it instead of adding a Putt made mark.
    if (view.finishSuggested) list.push({ key: 'finish', label: 'Finish hole at last mark', onSelect: view.holeOut });
    if (round) {
      list.push({ key: 'review', label: 'Review hole', onSelect: round.openReview });
      list.push({ key: 'change-hole', label: 'Change hole', onSelect: () => setOpen('hole') });
      list.push({ key: 'skip', label: 'Skip hole', onSelect: round.skipHole, disabled: !round.hasNextHole || round.status === 'COMPLETE' });
    }
    list.push({ key: 'pause', label: view.paused ? 'Resume tracking' : 'Pause tracking', onSelect: view.paused ? view.resume : view.pause });
    if (round) list.push({ key: 'mode', label: `Competition Mode · ${round.playMode === 'competition' ? 'on' : 'off'}`, onSelect: () => setOpen('mode') });
    if (onUseStandardTracking) list.push({ key: 'standard', label: 'Use standard tracking', onSelect: onUseStandardTracking });
    if (onExitRound) list.push({ key: 'exit', label: 'Exit round', onSelect: onExitRound });
    return list;
  }, [round, view.deleteLastMark, view.canDeleteLastMark, view.finishSuggested, view.holeOut, view.paused, view.resume, view.pause, onUseStandardTracking, onExitRound]);
  const sheet = open && round ? open === 'penalty' ? <PenaltySheet round={round} onClose={close} /> : open === 'mode' ? <ModeSheet round={round} onClose={close} /> : <HoleSheet round={round} onClose={close} /> : null;
  return { items, sheet, open };
}

const panel = 'pointer-events-auto absolute inset-x-3 bottom-3 z-30 flex flex-col gap-2 rounded-control border border-border-subtle bg-surface p-3 shadow-card';
function PenaltySheet({ round, onClose }: { round: OneTapRoundView; onClose: () => void }) {
  const add = (kind: PenaltyKind, strokes?: PenaltyStrokes) => { round.addPenalty(kind, strokes); onClose(); };
  return <div className={panel} role="dialog" aria-label="Penalty or drop" data-slot="one-tap-sheet" data-sheet="penalty">
    <div>
      <p className="text-body font-semibold text-text-primary">Penalty / drop</p>
      <p className="text-caption text-text-secondary">Adds to your score, not a shot. Then mark the ball where you play from next.</p>
    </div>
    <div className="flex flex-col gap-1.5">
      {PENALTY_KINDS.map(kind => <Button key={kind} variant="secondary" size="sm" fullWidth className="justify-between" onClick={() => add(kind)} data-penalty-kind={kind} title={PENALTY_COPY[kind].hint}>
        <span>{PENALTY_COPY[kind].label}</span><span className="text-text-secondary">+{PENALTY_COPY[kind].strokes}</span>
      </Button>)}
      <Button variant="secondary" size="sm" fullWidth className="justify-between" onClick={() => add('other', 2)} data-penalty-kind="other-2">
        <span>Two-stroke penalty</span><span className="text-text-secondary">+2</span>
      </Button>
    </div>
    <div className="flex items-center justify-between gap-2">
      {round.penaltyStrokes > 0 ? <Button variant="ghost" size="sm" onClick={() => { round.removeLastPenalty(); onClose(); }} data-slot="one-tap-penalty-remove">Remove last penalty</Button> : <span />}
      <Button variant="ghost" size="sm" onClick={onClose} data-slot="one-tap-sheet-close">Cancel</Button>
    </div>
  </div>;
}
function holeSummary(row: OneTapRoundView['scorecard'][number]): string {
  if (row.skipped) return 'skipped';
  if (row.status === 'COMPLETE') return `${row.score} ✓`;
  return row.strokes > 0 ? `${row.strokes} ${row.strokes === 1 ? 'shot' : 'shots'}` : '—';
}
function HoleSheet({ round, onClose }: { round: OneTapRoundView; onClose: () => void }) {
  return <div className={`${panel} max-h-[60%]`} role="dialog" aria-label="Change hole" data-slot="one-tap-sheet" data-sheet="hole">
    <p className="text-body font-semibold text-text-primary">Change hole</p>
    <div className="flex min-h-0 flex-col gap-1 overflow-y-auto" role="list">
      {round.scorecard.map((row, index) => <Button key={row.holeKey} role="listitem" variant={index === round.holeIndex ? 'secondary' : 'ghost'} size="sm" fullWidth className="justify-between"
        aria-current={index === round.holeIndex ? 'true' : undefined} onClick={() => { round.goToHole(index); onClose(); }} data-hole-index={index}>
        <span>Hole {row.ordinal} · Par {row.par}</span><span className="text-text-secondary">{holeSummary(row)}</span>
      </Button>)}
    </div>
    <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose} data-slot="one-tap-sheet-close">Cancel</Button></div>
  </div>;
}
/** Task 16 — the round setting and its Local Rule caveat. Tournament and
 * qualifier rounds are locked on; a practice round toggles. */
function ModeSheet({ round, onClose }: { round: OneTapRoundView; onClose: () => void }) {
  const on = round.playMode === 'competition';
  return <div className={panel} role="dialog" aria-label="Competition Mode" data-slot="one-tap-sheet" data-sheet="mode" data-play-mode={round.playMode} data-locked={round.playModeLocked}>
    <div>
      <p className="text-body font-semibold text-text-primary">{LOCAL_RULE_CAVEAT.title} · {on ? 'on' : 'off'}</p>
      <p className="text-caption text-text-secondary">{LOCAL_RULE_CAVEAT.body}</p>
      <p className="mt-1 text-caption text-text-secondary" data-slot="one-tap-mode-note">{round.playModeLocked ? LOCAL_RULE_CAVEAT.locked : LOCAL_RULE_CAVEAT.practice}</p>
    </div>
    <div className="flex items-center justify-between gap-2">
      {round.playModeLocked ? <span /> : <Button variant="secondary" size="sm" onClick={() => { round.setPlayMode(on ? 'practice' : 'competition'); onClose(); }} data-slot="one-tap-mode-toggle">
        {on ? 'Turn off for this practice round' : 'Turn on for this round'}
      </Button>}
      <Button variant="ghost" size="sm" onClick={onClose} data-slot="one-tap-sheet-close">Close</Button>
    </div>
  </div>;
}
