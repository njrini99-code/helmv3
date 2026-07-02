'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionRow } from '@/lib/admin/data/auth';
import { revokeSessionsForUser } from '@/app/admin/actions/sessions';
import { Button, Inset } from '@/components/fairway';

/**
 * Live auth.sessions listing with a two-step confirm-then-revoke flow.
 * Revoke calls the internally-gated `revoke_user_sessions` RPC (user-scoped
 * client) — never destructive without the explicit second click.
 */
export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li key={s.session_id}>
          <Inset padding="sm" className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-warm-900">{s.email}</p>
              <p className="font-fw-mono text-xs tabular-nums text-warm-500">
                started {new Date(s.created_at).toLocaleString()} · refreshed{' '}
                {new Date(s.updated_at).toLocaleString()}
              </p>
            </div>
            {confirming === s.user_id ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirming(null)}
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
                      await revokeSessionsForUser(s.user_id);
                      setConfirming(null);
                      router.refresh();
                    })
                  }
                >
                  Confirm sign-out everywhere
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirming(s.user_id)}
              >
                Revoke
              </Button>
            )}
          </Inset>
        </li>
      ))}
    </ul>
  );
}
