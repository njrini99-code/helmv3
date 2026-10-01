'use client';

import { useRouter } from 'next/navigation';
import { InlineNotice } from '../../ui/Notices';

/** CH-11206: the round itself didn't load. Nothing is lost; Try again asks the server again. */
export function ReviewLoadFailed() {
  const router = useRouter();
  return (
    <main className="ch-rv" aria-label="Round">
      <InlineNotice code="CH-11206" title="This round didn't load" body="Nothing is lost; the round is still saved. Try again in a moment." onRetry={() => router.refresh()} />
    </main>
  );
}
