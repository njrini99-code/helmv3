'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { abandonGoal, acceptGoalSuggestion, dismissGoalSuggestion, pauseGoal, resumeGoal } from '@/app/golf/actions/v3/goals';
import type { ChGoalSuggestion } from '../../data/stats-player';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { normalise, useAction } from '../../lib/use-action';
import { devValue } from './dev-format';
import { GoalSheet } from './GoalSheet';
import { goalMetricLabel, goalStateWords } from './goal-words';
import '../../styles/goals.css';

/** "Set a goal" for the player's own Development tab; the sheet is GoalSheet. */
export function GoalSetButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" leftIcon={Plus} onClick={() => setOpen(true)}>
        Set a goal
      </Button>
      <GoalSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** One suggested goal, answered by the player it is for: Accept starts it, Dismiss sets it aside (par-19). */
function SuggestionRow({ s }: { s: ChGoalSuggestion }) {
  const router = useRouter();
  const label = goalMetricLabel(s.metric);
  const accept = useAction(
    'stats.acceptGoalSuggestion',
    async () => {
      const res = await acceptGoalSuggestion(s.id);
      if (normalise(res).success) router.refresh();
      return res;
    },
    () => ({ done: `Goal started · ${label}`, failed: `Couldn’t start ${label}`, hint: 'It is still suggested. Try again in a moment.', code: 'CH-5007' }),
  );
  const dismiss = useAction(
    'stats.dismissGoalSuggestion',
    async () => {
      const res = await dismissGoalSuggestion(s.id);
      if (normalise(res).success) router.refresh();
      return res;
    },
    () => ({ done: 'Suggestion dismissed', failed: `Couldn’t dismiss ${label}`, hint: 'It is still suggested. Try again in a moment.', code: 'CH-5008' }),
  );
  const pending = accept.pending || dismiss.pending;
  const days = s.days;
  return (
    <li className="ch-gs__row">
      <div>
        <b>{label}</b>
        <span className="ch-num">{s.target == null ? `Over ${days} days` : `Aim for ${devValue(s.target, s.metric)} over ${days} days`}</span>
      </div>
      <span className="ch-gs__ans" role="group" aria-label={`Answer ${label}`}>
        <Button size="sm" variant="primary" disabled={pending} onClick={() => void accept.run()}>
          {accept.pending ? <span data-ch-code="CH-5405">Starting…</span> : 'Accept'}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => void dismiss.run()}>
          {dismiss.pending ? <span data-ch-code="CH-5405">Dismissing…</span> : 'Dismiss'}
        </Button>
      </span>
    </li>
  );
}

/**
 * The goals CoachHelm suggests, above the player's own: nothing is drawn when there are none (a bonus rail, not a
 * state), and a failed read says so (CH-5215) instead of passing for "no suggestions".
 */
export function GoalSuggestions({ items, error }: { items: ChGoalSuggestion[] | undefined; error: boolean | undefined }) {
  const router = useRouter();
  if (error) return <InlineNotice code="CH-5215" title="Suggested goals didn’t load." body="Your goals are fine. Try again in a moment." onRetry={() => router.refresh()} />;
  if (!items?.length) return null;
  return (
    <section className="ch-gs" aria-label="Suggested goals">
      <h3 className="ch-gs__h">
        Suggested for you <span className="ch-num">{items.length}</span>
      </h3>
      <ul className="ch-gs__list">
        {items.map((s) => (
          <SuggestionRow key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}

/** One change to a goal (pause, resume, abandon), told to the coach and read again once it lands. */
function useChange(name: string, run: () => ReturnType<typeof pauseGoal>, done: string, failed: string) {
  const router = useRouter();
  return useAction(
    name,
    async () => {
      const res = await run();
      if (normalise(res).success) router.refresh();
      return res;
    },
    () => ({ done, failed, hint: 'Nothing was changed. Try again in a moment.', code: 'CH-5009' }),
  );
}

/**
 * Under a goal on the Development tab: what state it is in when that is not simply "in progress", and, for the coach,
 * Pause, Resume and Abandon (the Fairway goal card's controls). The player has none (Fairway shows them none either).
 */
export function GoalStatus({ id, title, state, coach }: { id: string; title: string; state: string | null; coach: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const words = goalStateWords(state);
  const done = state === 'achieved' || state === 'completed';
  const pause = useChange('stats.pauseGoal', () => pauseGoal(id), `Paused · ${title}`, `Couldn’t pause ${title}`);
  const resume = useChange('stats.resumeGoal', () => resumeGoal(id), `Resumed · ${title}`, `Couldn’t resume ${title}`);
  const abandon = useChange('stats.abandonGoal', () => abandonGoal(id), `Abandoned · ${title}`, `Couldn’t abandon ${title}`);
  const pending = pause.pending || resume.pending || abandon.pending;
  const canPause = coach && state === 'active';
  const canResume = coach && state === 'paused';
  const canAbandon = coach && (state === 'active' || state === 'paused');

  return (
    <>
      {words ? <span className="ch-gl-st">{words}</span> : <span className="ch-sr-only">{done ? 'Achieved' : 'In progress'}</span>}
      {(canPause || canResume || canAbandon) && (
        <span className="ch-gl-ctl" role="group" aria-label={`Change ${title}`}>
          {canPause && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void pause.run()}>
              {pause.pending ? <span data-ch-code="CH-5405">Pausing…</span> : 'Pause'}
            </Button>
          )}
          {canResume && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void resume.run()}>
              {resume.pending ? <span data-ch-code="CH-5405">Resuming…</span> : 'Resume'}
            </Button>
          )}
          {canAbandon && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
              Abandon
            </Button>
          )}
        </span>
      )}
      {canAbandon && (
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          code="CH-5501"
          title="Abandon this goal?"
          description={`${title} stops tracking progress and stays in the list marked Abandoned.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button
                variant="primary"
                disabled={abandon.pending}
                feel={null}
                onClick={async () => {
                  const res = await abandon.run();
                  if (res.success) setConfirming(false);
                }}
              >
                {abandon.pending ? <span data-ch-code="CH-5405">Abandoning…</span> : 'Abandon goal'}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
