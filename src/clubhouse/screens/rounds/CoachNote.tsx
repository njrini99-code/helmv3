'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveRoundCoachNote } from '@/app/golf/actions/round-coach-note';
import { useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';

const NOTE_MAX = 2000;

/**
 * The coach's note on a round (P011 review; design/handoff/rounds-review.jsx "Coach notes"). The player reads it, and sees
 * nothing at all when there is none. A coach of the player's team reads it too and writes or edits it here: the store is the
 * round's review row (`golf_round_reviews.coach_notes`, the column the Fairway page writes through `annotateReview`), saved by
 * `saveRoundCoachNote`, which also tells the player their coach left feedback.
 */
export function CoachNote({ roundId, note, error, canWrite, playerFirst }: { roundId: string; note: string | null; error?: boolean; canWrite: boolean; playerFirst: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // What was just saved, shown until the page's own read of the note lands (router.refresh), so the card never flashes the old text.
  const [saved, setSaved] = useState<string | null>(null);
  const shown = saved ?? note;

  const save = useAction(
    'rounds.review.coachNote',
    async (text: string) => {
      const res = await saveRoundCoachNote(roundId, text);
      if (res.success) {
        setSaved(res.data?.note ?? text.trim());
        setEditing(false);
        router.refresh();
      }
      return res;
    },
    () => ({
      done: playerFirst ? `Note saved. ${playerFirst} can read it` : 'Note saved',
      failed: 'Couldn’t save the note',
      hint: 'What you wrote is still here. Try again in a moment.',
      code: 'CH-11023',
    }),
  );

  if (!canWrite && !shown && !error) return null;

  const start = () => {
    setDraft(shown ?? '');
    setEditing(true);
  };
  const trimmed = draft.trim();

  return (
    <section className="ch-rv-card ch-rv-notes ch-rv-cn" aria-labelledby="ch-rv-cn-h" data-ch-code="CH-11523">
      <div className="ch-rv-card__h">
        <div>
          <h3 id="ch-rv-cn-h">{canWrite ? 'Coach note' : 'From your coach'}</h3>
          <span>{canWrite ? (playerFirst ? `${playerFirst} reads this on the round` : 'The player reads this on the round') : 'Left on this round'}</span>
        </div>
        {canWrite && !editing && (
          <Button size="sm" variant="ghost" onClick={start}>
            {shown ? 'Edit' : 'Add a note'}
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="ch-rv-cn__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !save.pending) void save.run(trimmed);
          }}
        >
          <label className="ch-field" htmlFor="ch-rv-cn-text">
            <span className="ch-sr-only">Note for {playerFirst ?? 'the player'}</span>
            <textarea
              id="ch-rv-cn-text"
              className="ch-textarea"
              rows={4}
              maxLength={NOTE_MAX}
              value={draft}
              placeholder="What went well, and the one thing to work on."
              // The coach pressed Add a note or Edit a moment ago: the field is where they are going.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="ch-rv-cn__actions">
            <span className="ch-num ch-rv-cn__count" aria-live="polite">
              {draft.length}/{NOTE_MAX}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={save.pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" busy={save.pending} disabled={!trimmed}>
              {save.pending ? 'Saving…' : 'Save note'}
            </Button>
          </div>
        </form>
      ) : shown ? (
        <p>{shown}</p>
      ) : error ? (
        <p className="ch-rv-cn__none" data-ch-code="CH-11222">
          We couldn’t check for a coach note just now. Reload to try again.
        </p>
      ) : (
        <p className="ch-rv-cn__none">No note on this round yet.</p>
      )}
    </section>
  );
}
