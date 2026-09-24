'use client';

/**
 * Computes a player's genome on demand (the same POST the old detail view
 * used), then refreshes the route. Only shown when no genome row exists.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/fairway/controls';
import { fairwayToast } from '@/components/fairway/feedback';

export function GenomeComputeButton({ playerId, label = 'Compute tendencies' }: { playerId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function compute() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/coachhelm/v3/genome/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Could not compute. Try again.');
        return;
      }
      fairwayToast.success('Tendencies computed');
      router.refresh();
    } catch {
      setError('Could not compute. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" busy={busy} onClick={compute}>
        {busy ? 'Computing…' : label}
      </Button>
      {error ? (
        <p role="alert" className="font-fw-sans text-caption text-fw-warning-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
