'use client';

import { UserPlus } from 'lucide-react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { formatHcp } from './format';
import type { ChJoinRequestsState } from './useJoinRequests';

/**
 * Join requests. The list and its actions live in useJoinRequests, so the
 * phone's banner and this card read the same optimistic state.
 */
export function RosterRequests({
  teamName,
  jr,
  error,
  onRetry,
}: {
  teamName: string;
  jr: ChJoinRequestsState;
  error: boolean;
  onRetry: () => void;
}) {
  const { reqs, busy, decide } = jr;

  if (error) {
    return (
      <InlineNotice
        code="CH-3203"
        title="Join requests didn't load."
        body="Pending requests are safe. Try again, and if it keeps happening the error has already been reported."
        onRetry={onRetry}
      />
    );
  }
  if (!reqs.length) return null;

  return (
    <section className="ch-rs-req" aria-label="Join requests">
      <div className="ch-rs-req__head">
        <span className="ch-rs-req__ic">
          <Icon icon={UserPlus} size={15} />
        </span>
        <b>
          {reqs.length} {reqs.length === 1 ? 'player wants' : 'players want'} to join {teamName}
        </b>
        <span>Approving adds them to the roster and team chat.</span>
      </div>
      {reqs.map((r) => (
        <div key={r.id} className="ch-rs-req__row">
          <Avatar name={r.name} size={32} />
          <span className="ch-rs-req__who">
            <b>{r.name}</b>
            <span>
              {r.meta}
              {r.handicap != null && ` · HCP ${formatHcp(r.handicap)}`}
            </span>
          </span>
          <div className="ch-rs-req__act">
            <Button size="sm" variant="ghost" disabled={busy === r.id || busy === 'all'} onClick={() => void decide(r, false)}>
              Decline
            </Button>
            <Button size="sm" variant="primary" disabled={busy === r.id || busy === 'all'} onClick={() => void decide(r, true)} feel={null}>
              Approve
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
