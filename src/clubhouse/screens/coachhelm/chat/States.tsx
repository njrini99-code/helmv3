'use client';

import { MessageSquareOff, Users } from 'lucide-react';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
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

/**
 * The chat context did not load (no active team, a dropped read): no program to ask against, so no composer. It is the
 * page's one read, so it is the page failure (CH-1211), drawn as the route error is: a brick medallion, Try again first.
 */
export function AskInputsFailed() {
  return (
    <div className="ch-ask-state">
      <EmptyState
        size="page"
        tone="danger"
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

/**
 * `?c=` names a conversation that is gone or not this coach's (mockup Unavailable). The composer stays usable. It is the page's
 * empty state, calm on the canvas, not a boxed card (states audit, 2026-10-08), and still an alert, so it is announced.
 */
export function AskUnavailable({ onNew, phone = false }: { onNew: () => void; phone?: boolean }) {
  return (
    <div className="ch-ask-state" role="alert" data-ch-code="CH-13320">
      <EmptyState
        size="page"
        icon={MessageSquareOff}
        title="That conversation isn’t available"
        body={`It may have been deleted, or it belongs to another coach. ${phone ? 'Your other chats are under History.' : 'Your other chats are on the left.'}`}
        action={
          <Button variant="primary" onClick={onNew}>
            Start a new chat
          </Button>
        }
      />
    </div>
  );
}
