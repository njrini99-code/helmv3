'use client';

import { useRefresh } from '../lib/use-refresh';
import { InlineNotice } from './Notices';

/** A section-level failed read, with Try again re-running the server render. */
export function RefreshNotice({ title, body, code }: { title: string; body: string; code: string }) {
  const { refresh, refreshing } = useRefresh();
  return <InlineNotice code={code} title={title} body={body} onRetry={refresh} retrying={refreshing} />;
}
