'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/fairway';

/**
 * Two-step confirm for entering read-only view-as, mirroring
 * `SessionsPanel`'s confirm-then-submit pattern for the adjacent Revoke
 * action right below it on this same page. Impersonating a user — even
 * read-only — deserves the same "are you sure" friction as force-signing
 * them out everywhere, not a bare single-click form submit.
 *
 * `onEnter` is `enterViewAs` pre-bound to this page's user id (a Server
 * Action). It calls `redirect()` internally on success — invoking it inside
 * `startTransition` here (rather than a plain `<form action>`) is the same
 * pattern `SessionsPanel` already uses for `revokeSessionsForUser`, and
 * Next's action runtime still honors the thrown redirect when the action is
 * called this way.
 */
export function ViewAsButton({ onEnter }: { onEnter: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div role="group" aria-label="Confirm view-as" className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: move focus into the confirm row when it replaces the trigger button, so keyboard/screen-reader users aren't dropped to <body>
          autoFocus
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          busy={pending}
          onClick={() =>
            startTransition(async () => {
              await onEnter();
            })
          }
        >
          Confirm view-as (15 min, read-only)
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
      View as (read-only, 15 min)
    </Button>
  );
}
