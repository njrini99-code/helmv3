'use client';
import { Button } from '../../../../ui/Button';

import { useState } from 'react';
import { requestAskCredits, undoAskCredits } from '@/app/golf/actions/coachhelm-ask-credits';
import type { AskAllowanceBucket } from '../../../../data/coachhelm-chat-shape';

/** "Ask this week": a word only, never an amount, a percentage or a dollar sign (AK10b). */
export function AllowanceMeter({ bucket }: { bucket: AskAllowanceBucket }) {
  const word = bucket === 'plenty' ? 'Plenty left' : bucket === 'low' ? 'Low' : 'Paused';
  return (
    <p className={'ch-ak-meter' + (bucket !== 'plenty' ? ' is-low' : '')}>
      Ask this week · {word} · resets Monday
    </p>
  );
}

export function OutCard({ sent, onRequest }: { sent: boolean; onRequest: () => void }) {
  return (
    <section className="ch-ak-out" role="status">
      <b>Ask is paused until Monday</b>
      <p>{sent ? 'Your request went in. We’ll take a look.' : 'Need more before Monday?'}</p>
      {!sent && (
        <Button variant="secondary" onClick={onRequest}>
          Request more
        </Button>
      )}
    </section>
  );
}

/** Request more, with the kit's 8 second Undo. Undo in time deletes the row and nothing is sent. */
export function PlayerOut() {
  const [state, setState] = useState<{ phase: 'idle' | 'held' | 'sent'; id?: string; error?: string }>({ phase: 'idle' });
  if (state.phase === 'held')
    return (
      <section className="ch-ak-out" role="status">
        <b>Request ready</b>
        <p>It goes in once Undo closes.</p>
        <Button variant="secondary" onClick={() => {
            if (state.id) void undoAskCredits(state.id).then((r) => setState(r.success ? { phase: 'idle' } : { phase: 'sent' }));
          }}
        >
          Undo
        </Button>
      </section>
    );
  return (
    <>
      <OutCard
        sent={state.phase === 'sent'}
        onRequest={() =>
          void requestAskCredits().then((r) => {
            if (!r.success) return setState({ phase: r.error?.includes('already') ? 'sent' : 'idle', error: r.error });
            setState({ phase: 'held', id: r.id });
            setTimeout(() => setState((s) => (s.phase === 'held' && s.id === r.id ? { phase: 'sent' } : s)), 8_000);
          })
        }
      />
      {state.error && <p role="alert" className="ch-ak-meter is-low">{state.error}</p>}
    </>
  );
}
