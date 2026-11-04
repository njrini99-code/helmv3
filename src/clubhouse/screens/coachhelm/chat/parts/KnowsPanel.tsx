'use client';

import { useState } from 'react';
import { deleteCoachFact, saveCoachFact, setChatTone } from '@/app/golf/actions/coachhelm-ask';
import type { ChAskData } from '../../../../data/coachhelm-chat-shape';
import { Segmented } from '../../../../ui/Segmented';

const TONES = [
  { id: 'straight', label: 'Straight' },
  { id: 'detailed', label: 'Detailed' },
  { id: 'team_talk', label: 'Team talk' },
] as const;

/** Tone and "CoachHelm knows". Facts come only from this panel, so nothing the model infers is ever saved (AK8). */
export function AskKnowsPanel({ knows, conversationId }: { knows: NonNullable<ChAskData['knows']>; conversationId: string | null }) {
  const [tone, setTone] = useState(knows.tone);
  const [facts, setFacts] = useState(knows.facts);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
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
      <h3>CoachHelm knows</h3>
      <ul>
        {facts.map((f) => (
          <li key={f.id}>
            <span>{f.text}</span>
            <button
              type="button"
              aria-label={`Remove: ${f.text}`}
              onClick={() =>
                void deleteCoachFact(f.id).then((r) => {
                  if (r.success) setFacts((list) => list.filter((x) => x.id !== f.id));
                  else setError(r.error ?? 'That wasn’t removed.');
                })
              }
            >
              Remove
            </button>
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
          <input aria-label="What CoachHelm should know" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} />
        </form>
      ) : (
        <button type="button" className="ch-ask-hist__new" onClick={() => setAdding(true)}>
          Edit what it knows
        </button>
      )}
      {error && (
        <p role="alert" className="ch-ak-meter is-low">
          {error}
        </p>
      )}
    </div>
  );
}
