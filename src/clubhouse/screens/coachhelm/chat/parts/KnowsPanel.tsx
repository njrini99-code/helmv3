'use client';

import { useState } from 'react';
import { Button } from '../../../../ui/Button';
import { deleteCoachFact, saveCoachFact, setChatTone } from '@/app/golf/actions/coachhelm-ask';
import type { ChAskData } from '../../../../data/coachhelm-chat-shape';
import { Modal } from '../../../../ui/Modal';
import { Segmented } from '../../../../ui/Segmented';

const TONES = [
  { id: 'straight', label: 'Straight' },
  { id: 'detailed', label: 'Detailed' },
  { id: 'team_talk', label: 'Team talk' },
] as const;

/** The design's reach table, as this build's tools have it. Reads only what is already stored; Messages stay out. */
const CAN_SEE: ReadonlyArray<{ area: string; what: string }> = [
  { area: 'Strokes gained and core stats', what: 'Metrics, trends, rankings and comparisons, by player or team.' },
  { area: 'Shots', what: 'Miss direction and distance left, putts by distance. Shots store a direction, not a map position.' },
  { area: 'CoachHelm engine', what: 'Root causes, team patterns and open reads per player.' },
  { area: 'Rounds', what: 'Recent rounds and hole by hole for a round.' },
  { area: 'Practice', what: 'Plans, once the Practice tab is on. It writes a plan only after you confirm.' },
  { area: 'Calendar and classes', what: 'Upcoming events. It adds an event only after you confirm.' },
  { area: 'Qualifiers and tournaments', what: 'Where those are on for your team.' },
  { area: 'Messages', what: 'Stays out. It drafts a board or poll you send yourself from Messages.' },
];

function AskCanSee() {
  return (
    <dl className="ch-ak-see">
      {CAN_SEE.map((r) => (
        <div key={r.area}>
          <dt>{r.area}</dt>
          <dd>{r.what}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tone and "CoachHelm knows". Facts come only from this panel, so nothing the model infers is ever saved (AK8). */
export function AskKnowsPanel({ knows, conversationId }: { knows: NonNullable<ChAskData['knows']>; conversationId: string | null }) {
  const [tone, setTone] = useState(knows.tone);
  const [facts, setFacts] = useState(knows.facts);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seeing, setSeeing] = useState(false);
  const add = async () => {
    const res = await saveCoachFact({ teamId: knows.teamId, text });
    if (!res.success || !res.id) return setError(res.error ?? 'That wasn’t saved.');
    setFacts((f) => [...f, { id: res.id!, text: text.trim() }]);
    setText('');
    setAdding(false);
    setError(null);
  };
  return (
    <div className="ch-ak-knows">
      <Segmented
        label="Tone"
        block
        size="sm"
        value={tone}
        options={TONES.map((t) => ({ value: t.id, label: t.label }))}
        onChange={(id) => {
          setTone(id);
          if (conversationId) void setChatTone(conversationId, id);
        }}
      />
      {facts.length > 0 && <h3>CoachHelm knows</h3>}
      <ul hidden={facts.length === 0}>
        {facts.map((f) => (
          <li key={f.id}>
            <span>{f.text}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove: ${f.text}`}
              onClick={() =>
                void deleteCoachFact(f.id).then((r) => {
                  if (r.success) setFacts((list) => list.filter((x) => x.id !== f.id));
                  else setError(r.error ?? 'That wasn’t removed.');
                })
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the coach just pressed to add a line */}
          <input autoFocus className="ch-input" aria-label="What CoachHelm should know" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
          <span className="acts">
            <Button type="submit" variant="primary" size="sm" disabled={!text.trim()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </span>
        </form>
      ) : (
        <button type="button" className="ed" onClick={() => setAdding(true)}>
          Edit what it knows
        </button>
      )}
      <button type="button" className="ed is-quiet" onClick={() => setSeeing(true)}>
        What Ask can see
      </button>
      <Modal open={seeing} title="What Ask can see" onClose={() => setSeeing(false)}>
        <AskCanSee />
      </Modal>
      {error && (
        <p role="alert" className="ch-ak-knows__err">
          {error}
        </p>
      )}
    </div>
  );
}
