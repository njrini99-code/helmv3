'use client';

import { RotateCw } from 'lucide-react';
import { useEffect } from 'react';
import type { ChatErrorNotice } from '../../../../data/coachhelm-chat-error';
import { haptic } from '../../../../lib/haptics';
import { Button } from '../../../../ui/Button';
import { OFFLINE_LINE } from '../../../../ui/Retry';

/** What ended the turn early: the coach's Stop, or a failure with its sentence and the one thing to offer. */
export type TurnEnd = { kind: 'stopped' } | { kind: 'failed'; notice: ChatErrorNotice };

/**
 * The turn notice (SPEC Moment 10): the last thing in the turn that failed or was stopped. What arrived stays above it; the way
 * to recover is here, inside the thing that failed. Amber, never red (red means under par and nothing else). "Nothing was
 * changed." is said only when it is true of this turn.
 */
export function TurnNotice({ end, offline, changed, onRetry, onNewChat }: { end: TurnEnd; offline: boolean; changed: { changedNothing: boolean; unconfirmedWrite: boolean }; onRetry: () => void; onNewChat: () => void }) {
  const failed = end.kind === 'failed';
  const message = failed ? end.notice.message : 'Stopped.';
  // One error haptic per failure. Stop is the coach's own act: it has none.
  useEffect(() => {
    if (failed) haptic('error');
  }, [failed, message]);
  const recovery = failed ? end.notice.recovery : 'retry';
  const offlineRetry = offline && recovery === 'retry';
  return (
    <div className={'ch-ak-notice' + (failed ? ' is-failed' : ' is-stopped')} role={failed ? 'alert' : 'status'} data-ch-code="CH-13251">
      {failed && (
        <span className="mk" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="9" cy="9" r="7" />
            <path d="M6 9h6" />
          </svg>
        </span>
      )}
      <div className="tx">
        <p className="t">{offline && failed ? 'You’re offline. What arrived is above.' : message}</p>
        {changed.changedNothing && <p className="s">{failed ? 'Nothing was changed.' : 'Nothing was saved.'}</p>}
        {changed.unconfirmedWrite && <p className="s">You confirmed an action in this answer. Check whether it was created before you ask again.</p>}
        {offlineRetry && (
          <p className="s" data-ch-code="CH-1905">
            {OFFLINE_LINE}
          </p>
        )}
      </div>
      {recovery === 'retry' && (
        <Button size="sm" variant="secondary" leftIcon={RotateCw} disabled={offlineRetry} onClick={onRetry} data={{ 'data-ch-ask-retry': '' }}>
          Try again
        </Button>
      )}
      {recovery === 'new-chat' && (
        <Button size="sm" variant="secondary" onClick={onNewChat}>
          Start a new chat
        </Button>
      )}
    </div>
  );
}
