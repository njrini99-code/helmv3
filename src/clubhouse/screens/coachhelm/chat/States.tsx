'use client';

import { CircleAlert, Users } from 'lucide-react';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { EmptyState } from '../../../ui/States';

/** Where Open roster goes, only when that screen is rebuilt (nav.rebuiltHref); never a dead button. */
export const askLinks = {
  roster: () => rebuiltHref('/golf/dashboard/roster', 'coach'),
};

/** First run: no players on the roster, so there is nothing to ask against (mockup NoRoster). */
export function AskNoRoster() {
  const roster = askLinks.roster();
  return (
    <EmptyState
      size="page"
      code="CH-13321"
      icon={Users}
      title="Add players to ask CoachHelm"
      body="CoachHelm answers from your players’ rounds, stats and schedule. Once your roster is in, ask about anyone on it."
      action={
        roster ? (
          <Button variant="primary" leftIcon={Users} href={roster}>
            Open roster
          </Button>
        ) : undefined
      }
    />
  );
}

/** The chat context did not load (no active team, a dropped read): no program to ask against, so no composer. */
export function AskInputsFailed() {
  return (
    <div className="ch-ask-state">
      <RefreshNotice
        code="CH-13221"
        title="Ask CoachHelm couldn’t load your program"
        body="Nothing is lost, but there is no program to ask about until this loads. Try again in a moment."
      />
    </div>
  );
}

/** A conversation was found but its messages did not read. */
export function AskThreadFailed({ onNew }: { onNew: () => void }) {
  return (
    <div className="ch-ask-state">
      <RefreshNotice code="CH-13224" title="That conversation didn’t load" body="Nothing is lost. The chat is still saved; try again in a moment." />
      <p className="ch-ask-state__alt">
        Or{' '}
        <button type="button" className="ch-ask-state__link" onClick={onNew}>
          start a new chat
        </button>
        .
      </p>
    </div>
  );
}

/** `?c=` names a conversation that is gone or not this coach's (mockup Unavailable). The composer stays usable. */
export function AskUnavailable({ onNew, phone = false }: { onNew: () => void; phone?: boolean }) {
  return (
    <div className="ch-ask-state">
      <div className="ch-ask-gone" role="alert" data-ch-code="CH-13320">
        <span className="ch-ask-gone__ic" aria-hidden="true">
          <Icon icon={CircleAlert} size={20} />
        </span>
        <b>That conversation isn’t available</b>
        <span>It may have been deleted, or it belongs to another coach. {phone ? 'Your other chats are under History.' : 'Your other chats are on the left.'}</span>
        <button type="button" className="ch-ask-gone__new" onClick={onNew}>
          Start a new chat
        </button>
      </div>
    </div>
  );
}
