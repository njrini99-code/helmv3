'use client';

import { UserPlus } from 'lucide-react';
import type { Ref } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { formatHcp } from './format';
import type { ChJoinRequestsState } from './useJoinRequests';

/**
 * Join requests. The list and its actions live in useJoinRequests, so the
 * phone's banner and this card read the same optimistic state. `covered`: the
 * page's one notice (CH-1209) already says they failed, so only the title stays.
 * `ref`: the card, which the bell's `?tab=requests` link focuses (Roster).
 */
export function RosterRequests({
  ref,
  teamName,
  jr,
  error,
  covered = false,
  onRetry,
}: {
  ref?: Ref<HTMLElement>;
  teamName: string;
  jr: ChJoinRequestsState;
  error: boolean;
  covered?: boolean;
  onRetry: () => void;
}) {
  const { reqs, busy, decide } = jr;

  if (error) {
    return (
      <InlineNotice
        code="CH-3203"
        title="Join requests didn’t load"
        body="Pending requests are safe. Try again; the error has been reported."
        onRetry={onRetry}
        covered={covered}
      />
    );
  }
  if (!reqs.length) return null;

  return (
    <section ref={ref} className="ch-rs-req" aria-label="Join requests" tabIndex={-1}>
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
            {/* One decision at a time, as on the phone: a click while another is in flight would be refused with no word. */}
            <Button size="sm" variant="ghost" disabled={busy != null} onClick={() => void decide(r, false)}>
              Decline
            </Button>
            {/* Secondary, as on the phone (P003 #5): Invite players stays the screen's one primary. */}
            <Button size="sm" variant="secondary" disabled={busy != null} onClick={() => void decide(r, true)} feel={null}>
              Approve
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
