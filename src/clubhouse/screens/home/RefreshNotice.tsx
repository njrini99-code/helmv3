'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { InlineNotice } from '../../ui/Notices';

/** A section-level failed read, with Try again re-running the server render. */
export function RefreshNotice({ title, body, code }: { title: string; body: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <InlineNotice
      code={code}
      title={pending ? 'Trying again' : title}
      body={body}
      onRetry={pending ? undefined : () => start(() => router.refresh())}
    />
  );
}
