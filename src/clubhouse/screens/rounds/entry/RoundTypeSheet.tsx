'use client';

import { Flag, Medal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EDITABLE_ROUND_TYPES, type EditableRoundType } from '@/lib/golf/round-type-options';
import { haptic } from '../../../lib/haptics';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { Segmented } from '../../../ui/Segmented';
import { Opt, Opts } from './parts';
import {
  freeRoundNumbers,
  ROUND_TYPE_LABEL,
  sameChoice,
  type ChRoundTypeChoice,
  type ChRoundTypeCurrent,
  type ChQualifierOption,
  type ChRoundTypeOptions,
  type ChRoundTypeViewer,
} from './round-type';

/**
 * The line under a qualifier's name. A live round (Continue) is only counted once it is submitted, and a closed
 * qualifier refuses that submit (the live `submit_round_atomic` still refuses a completed qualifier, whatever the
 * action's comment says), so there it says the qualifier has to be reopened first; a submitted round (the review)
 * moves the published result at once. One the player isn't entered in yet is only a coach's to choose, and saving
 * enters them (`updateRoundType`).
 */
export function qualifierHint(q: ChQualifierOption, live: boolean): string {
  const rounds = `${q.numRounds} ${q.numRounds === 1 ? 'round' : 'rounds'}`;
  const finished = q.isCompleted ? (live ? 'Closed. It has to be reopened before this round can be submitted.' : 'Finished. Adding this round changes its final standings.') : null;
  const entry = q.playerEntered === false ? 'Not entered yet. Saving enters the player in it.' : null;
  return [finished, entry].filter(Boolean).join(' ') || rounds;
}

/**
 * CH-11521: change what a live round counts toward (owner, 2026-08-31: players can edit it; PROGRESS Q-92b). The
 * Fairway editor on the continue page, rebuilt in the round's own sheet pieces: Practice, Tournament or Qualifier,
 * then for Qualifier which one (only those the player is entered in) and which of its rounds, with the rounds the
 * player's other rounds hold shown but not offered. Pick, then Save: an accidental tap never moves a score in or out
 * of the standings. Scores are untouched.
 *
 * The honest dead ends: CH-11218 the qualifiers didn't load (never "none"); CH-11316 the player is in no qualifier;
 * CH-11110 every round of the chosen one is already filled. CH-11411: Save reads "Saving…" and nothing can be changed
 * or dismissed under it. A failure is the action's toast (CH-11020), which renders inside this dialog.
 */
export function RoundTypeSheet({
  open,
  current,
  options,
  pending,
  onClose,
  onSave,
  viewer = 'player',
  live = true,
}: {
  open: boolean;
  current: ChRoundTypeCurrent;
  options: ChRoundTypeOptions;
  pending: boolean;
  /** A coach of the player's team (the review) or the player; the copy follows. */
  viewer?: ChRoundTypeViewer;
  /** The round is still being played (Continue), not submitted (the review). */
  live?: boolean;
  onClose: () => void;
  onSave: (choice: ChRoundTypeChoice) => void;
}) {
  const [type, setType] = useState<EditableRoundType>(current.type);
  const [qualifierId, setQualifierId] = useState<string | null>(current.qualifierId);
  const [roundNumber, setRoundNumber] = useState<number | null>(current.roundNumber);
  // Each opening starts from what the round counts as now, not from an earlier, unsaved pick.
  useEffect(() => {
    if (!open) return;
    setType(current.type);
    setQualifierId(current.qualifierId);
    setRoundNumber(current.roundNumber);
  }, [open, current.type, current.qualifierId, current.roundNumber]);

  const chosen = options.qualifiers.find((q) => q.id === qualifierId);
  const free = freeRoundNumbers(chosen);
  const full = !!chosen && free.length === 0;
  const choice: ChRoundTypeChoice =
    type === 'qualifier' ? { type, qualifierId: chosen ? chosen.id : null, roundNumber: chosen && roundNumber != null && free.includes(roundNumber) ? roundNumber : null } : { type, qualifierId: null, roundNumber: null };
  const ready = !sameChoice(current, choice) && (type !== 'qualifier' || (choice.qualifierId != null && choice.roundNumber != null));

  const pickQualifier = (id: string) => {
    haptic('select');
    setQualifierId(id);
    // The round keeps its number when that slot is free in the new qualifier; otherwise the first free one, never a
    // taken 1 (the Fairway editor's original defect).
    const next = freeRoundNumbers(options.qualifiers.find((q) => q.id === id));
    setRoundNumber((n) => (n != null && next.includes(n) ? n : (next[0] ?? null)));
  };

  return (
    <Modal
      code="CH-11521"
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Change round type"
      description="Changes what this round counts toward. Its shots and scores stay as they are."
      icon={Flag}
      width={480}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready || pending} onClick={() => onSave(choice)}>
            {pending ? <span data-ch-code="CH-11411">Saving…</span> : 'Save'}
          </Button>
        </>
      }
    >
      <div className="ch-rt-sub">
        <Segmented<EditableRoundType>
          label="Round type"
          value={type}
          onChange={(v) => {
            if (pending) return;
            setType(v);
            // Qualifier with nothing picked yet: one entered qualifier is the only choice, so it is picked.
            if (v === 'qualifier' && !qualifierId && options.qualifiers.length === 1) pickQualifier(options.qualifiers[0]!.id);
          }}
          options={EDITABLE_ROUND_TYPES.map((t) => ({ value: t, label: ROUND_TYPE_LABEL[t] }))}
        />
      </div>

      {type === 'qualifier' &&
        (options.readFailed ? (
          <p className="ch-rt-note is-warn" role="status" data-ch-code="CH-11218">
            <span>Your qualifiers didn’t load, so there’s nothing to choose from yet. Close this and reopen it from the round in a moment.</span>
          </p>
        ) : options.qualifiers.length === 0 ? (
          <p className="ch-rt-note" role="status" data-ch-code="CH-11316">
            <span>
              {viewer === 'coach'
                ? 'This team has no qualifier to add a round to. Create one, then change this round here.'
                : 'You aren’t in any qualifier yet, so this round can’t count toward one. Ask your coach to add you, then change it here.'}
            </span>
          </p>
        ) : (
          <>
            <div className="ch-rt-sub">
              <em>Which qualifier?</em>
              <Opts>
                {options.qualifiers.map((q) => (
                  <Opt
                    key={q.id}
                    icon={Medal}
                    tone={qualifierId === q.id ? 'primary' : undefined}
                    label={q.name}
                    hint={qualifierHint(q, live)}
                    disabled={pending}
                    onClick={() => pickQualifier(q.id)}
                  />
                ))}
              </Opts>
            </div>
            {full ? (
              <p className="ch-rt-note is-warn" role="status" data-ch-code="CH-11110">
                <span>
                  Every round of {chosen?.name} already has one of {viewer === 'coach' ? 'the player’s' : 'your'} rounds in it, so this one can’t be added. Pick another qualifier, or change the round in the wrong slot first.
                </span>
              </p>
            ) : chosen ? (
              <div className="ch-rt-sub">
                <em>
                  Which round of it? {free.length} of {chosen.numRounds} open
                </em>
                <Opts>
                  {Array.from({ length: Math.max(chosen.numRounds, 1) }, (_, i) => i + 1).map((n) => {
                    const taken = !free.includes(n);
                    return (
                      <Opt
                        key={n}
                        icon={Flag}
                        tone={!taken && roundNumber === n ? 'primary' : undefined}
                        label={`Round ${n}`}
                        hint={taken ? 'Already recorded' : roundNumber === n ? 'Chosen' : 'Open'}
                        disabled={taken || pending}
                        onClick={() => {
                          haptic('select');
                          setRoundNumber(n);
                        }}
                      />
                    );
                  })}
                </Opts>
              </div>
            ) : null}
          </>
        ))}
    </Modal>
  );
}
