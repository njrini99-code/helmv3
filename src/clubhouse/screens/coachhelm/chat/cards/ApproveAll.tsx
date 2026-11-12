'use client';

import { Check, TriangleAlert, Undo2 } from 'lucide-react';
import type { ActionProposal } from '@/lib/coachhelm/v3/chat/action-types';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { cardCopy } from './catalog';
import { plural } from './facts';

/**
 * Several previews in one turn (CAPABILITIES.md 0.9; engine E29). Each card is still decided on its own. This bar is
 * the one safe way to decide several at once: it names exactly which cards it would confirm and what that does in
 * total, and it leaves out, with the reason, any card that should be read on its own:
 *
 *   a card with a detail missing          it cannot be confirmed at all yet;
 *   a card with an edit open              what is on screen is not what would be confirmed;
 *   a card with no Undo (a lineup lock)   the batch's one Undo window could not take it back.
 *
 * The engine holds every card of a batch until the same moment and stops at the first failure, putting the cards after
 * it back to waiting; the three settled states here say that in the app's words. Presentational: the shell owns where
 * it sits in the turn, the shared ring, and the calls (`approveAll(keys)`, Undo for each key).
 */
export interface WaitingCard {
  key: string;
  tool: string;
  proposal: ActionProposal;
  /** Its edit form is open, or an edit is with the server. */
  editing?: boolean;
}

export type LeftOutReason = 'missing' | 'editing' | 'no_undo';
const WHY: Record<LeftOutReason, string> = {
  missing: 'needs a detail first',
  editing: 'has changes you have not updated',
  no_undo: 'cannot be undone, so it is confirmed on its own',
};

export interface BatchPlan {
  /** In the order proposed, which is the order the server confirms them in. */
  go: Array<{ key: string; head: string; reach: 'sends' | 'visible' | 'private'; told: number }>;
  left: Array<{ key: string; head: string; why: LeftOutReason }>;
  /** Distinct people sent something by the cards that go, when every such card names them; else the sum the cards give. */
  people: number;
  /** What approving them does, in one sentence. */
  says: string;
}

function leftOut(c: WaitingCard, immediate: boolean): LeftOutReason | null {
  if (c.editing) return 'editing';
  if (c.proposal.missing.length > 0 || c.proposal.facts.some((f) => f.missing)) return 'missing';
  if (immediate) return 'no_undo';
  return null;
}

export function batchPlan(cards: readonly WaitingCard[]): BatchPlan {
  const go: BatchPlan['go'] = [];
  const left: BatchPlan['left'] = [];
  const named = new Set<string>();
  let unnamed = 0;
  for (const c of cards) {
    const copy = cardCopy(c.tool, c.proposal);
    const why = leftOut(c, copy.immediate);
    if (why) {
      left.push({ key: c.key, head: copy.head, why });
      continue;
    }
    go.push({ key: c.key, head: copy.head, reach: copy.reach, told: copy.told });
    if (copy.reach !== 'sends') continue;
    const recipients = c.proposal.recipients;
    if (recipients?.length) for (const r of recipients) named.add(r.id);
    else unnamed += copy.told;
  }
  const sends = go.filter((g) => g.reach === 'sends').length;
  const visible = go.filter((g) => g.reach === 'visible').length;
  const quiet = go.length - sends - visible;
  const people = named.size + unnamed;
  const parts = [
    sends ? `${sends} ${sends === 1 ? 'sends' : 'send'} to ${plural(people, 'person', 'people')}` : null,
    visible ? `${visible} ${visible === 1 ? 'is' : 'are'} put where players can see ${visible === 1 ? 'it' : 'them'}` : null,
    quiet ? `${quiet} ${quiet === 1 ? 'tells' : 'tell'} nobody` : null,
  ].filter(Boolean);
  return { go, left, people, says: `${plural(go.length, 'action')}. ${parts.join('; ')}.` };
}

export type BatchPhase = 'waiting' | 'confirming' | 'held' | 'saved' | 'undone' | 'stopped';

export interface ApproveAllProps {
  cards: readonly WaitingCard[];
  phase?: BatchPhase;
  /** Whole seconds left in the one shared Undo window. */
  seconds?: number;
  /** `stopped`: the card that failed, and how many after it wait again. */
  stoppedAt?: { head: string; reopened: number } | null;
  onApproveAll?: (keys: string[]) => void;
  onUndoAll?: (keys: string[]) => void;
}

export function ApproveAll({ cards, phase = 'waiting', seconds = 0, stoppedAt = null, onApproveAll, onUndoAll }: ApproveAllProps) {
  const plan = batchPlan(cards);
  // One card is decided on the card. A bar that approves "all 1" would be a second Confirm for the same thing.
  if (plan.go.length < 2) return null;
  const keys = plan.go.map((g) => g.key);
  const n = plan.go.length;
  const all = plan.left.length === 0;
  return (
    <section className="ch-akc-all" data-phase={phase} aria-label={`Approve ${all ? 'all' : ''} ${n} together`.replace(/\s+/g, ' ')}>
      <div className="ch-akc-all__top">
        <div className="ch-akc-all__tx">
          {phase === 'waiting' || phase === 'confirming' ? (
            <>
              <b>{all ? `Approve all ${n} together` : `Approve ${n} of ${cards.length} together`}</b>
              <span>{plan.says}</span>
            </>
          ) : phase === 'held' ? (
            <>
              <b>{`Not saved yet. All ${n} save in ${plural(seconds, 'second')}.`}</b>
              <span>One Undo takes back all {n}. Each card still has its own.</span>
            </>
          ) : phase === 'saved' ? (
            <>
              <b>
                <Icon icon={Check} size={15} /> {`All ${n} saved`}
              </b>
              <span>Each card above says what it did and who was told.</span>
            </>
          ) : phase === 'undone' ? (
            <>
              <b>{`Undone. None of the ${n} was saved.`}</b>
              <span>Nobody was told.</span>
            </>
          ) : (
            <>
              <b>
                <Icon icon={TriangleAlert} size={15} /> {`Stopped at “${stoppedAt?.head ?? 'a card'}”`}
              </b>
              <span>
                It could not be saved, so nothing after it was tried.
                {stoppedAt?.reopened ? ` ${plural(stoppedAt.reopened, 'card is', 'cards are')} waiting for you again.` : ''}
              </span>
            </>
          )}
        </div>
        {(phase === 'waiting' || phase === 'confirming') && (
          <Button variant="secondary" busy={phase === 'confirming'} disabled={!onApproveAll} onClick={() => onApproveAll?.(keys)}>
            {phase === 'confirming' ? 'Approving…' : all ? `Approve all ${n}` : `Approve these ${n}`}
          </Button>
        )}
        {phase === 'held' && (
          <Button variant="secondary" leftIcon={Undo2} disabled={!onUndoAll} onClick={() => onUndoAll?.(keys)}>
            {`Undo all ${n}`}
          </Button>
        )}
      </div>
      {(phase === 'waiting' || phase === 'confirming') && (
        <ol className="ch-akc-all__list">
          {plan.go.map((g) => (
            <li key={g.key}>
              <span>{g.head}</span>
              <small>{g.reach === 'sends' ? `Sends to ${g.told}` : g.reach === 'visible' ? 'Players can see it' : 'Nobody is told'}</small>
            </li>
          ))}
          {plan.left.map((l) => (
            <li key={l.key} data-left="">
              <span>{l.head}</span>
              <small>Not included: it {WHY[l.why]}.</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
