'use client';

import { useRefresh } from '../lib/use-refresh';
import { InlineNotice, PageNotice } from './Notices';

/**
 * A section-level failed read, with Try again re-running the server render. `covered`: the page's PageRefreshNotice
 * carries the one Try again, so this keeps only its title, marking the gap under the section's heading.
 */
export function RefreshNotice({ title, body, code, covered = false }: { title: string; body: string; code: string; covered?: boolean }) {
  const { refresh, refreshing } = useRefresh();
  return <InlineNotice code={code} title={title} body={body} onRetry={refresh} retrying={refreshing} covered={covered} />;
}

/**
 * The page-level notice (PageNotice, CH-1209) for a server page whose reads failed in more than one part: one Try
 * again re-runs the server render for all of them. Render it under the page head with the failed parts, and give each
 * failed part's RefreshNotice `covered` while two or more failed.
 */
export function PageRefreshNotice({ parts, code }: { parts: readonly string[]; code?: string }) {
  const { refresh, refreshing } = useRefresh();
  return <PageNotice parts={parts} code={code} onRetry={refresh} retrying={refreshing} />;
}
