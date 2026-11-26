import type { ReactNode } from 'react';
import Link from 'next/link';
import { Panel, SpaceState } from './ui';

/**
 * One vocabulary for reads that did not come back whole, on every Bridge space and in every copy report:
 *
 * - failed:          "<What> could not be read."  + "Nothing here is an all clear."
 * - no signal:       "No signal yet."             + why the store is not there yet
 * - not configured:  name what is missing ("no GitHub token is configured here")
 * - partial:         "Part of this page could not be read" + which parts; numbers may be low, never a zero
 * - truncated:       name the window actually covered
 * - a null number:   "not measured yet", never 0 or a dash in words
 *
 * `states.test.ts` bans the old variants ("Incomplete this load", "nothing here is all clear", "Health unread", ...)
 * across src/app/admin/spaces so a new page cannot drift back.
 */

export const NOT_ALL_CLEAR = 'Nothing here is an all clear.';
export const NOT_MEASURED = 'not measured yet';

/** "a", "a and b", "a, b and c". */
export function listWords(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const first = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

/** Where to look next: the error log's action name, when the reader logs one. */
function retryWords(action?: string): string {
  return action ? `Reload to try again; if it keeps failing, the error log has it under ${action}.` : 'Reload to try again.';
}

/** A read that failed outright: the page shows nothing it cannot vouch for. */
export function ReadFailed({ br, what, why, action, retryHref }: { br: string; what: string; why?: string | null; action?: string; retryHref?: string }) {
  return (
    <SpaceState br={br} title={`${sentence(what).replace(/\.$/, '')} could not be read.`}>
      {why ? `${sentence(why)} ` : ''}
      {NOT_ALL_CLEAR} {retryWords(action)}
      {retryHref ? (
        <>
          {' '}
          <Link href={retryHref} className="bs-link">
            Try again
          </Link>
        </>
      ) : null}
    </SpaceState>
  );
}

/** The store a page reads is not there yet (a table not created, signals not on): nothing to show, nothing cleared. */
export function SignalNotThere({ br, title = 'No signal yet.', why }: { br: string; title?: string; why: ReactNode }) {
  return (
    <SpaceState br={br} title={title}>
      {why} {NOT_ALL_CLEAR}
    </SpaceState>
  );
}

/** Some reads on the page failed: name them, and say the numbers may be low rather than showing a missing part as 0. */
export function Incomplete({ br, sources, action }: { br: string; sources: readonly string[]; action?: string }) {
  if (!sources.length) return null;
  return (
    <Panel tone="watch" br={br} title="Part of this page could not be read">
      <p className="bs-panel-note" style={{ padding: '0 22px 18px', margin: 0 }}>
        {sentence(listWords(sources)).replace(/\.$/, '')} could not be read, so the numbers below may be low: nothing missing is counted as zero. {retryWords(action)}
      </p>
    </Panel>
  );
}

/** The same, as one line for a copy report. */
export function incompleteLine(sources: readonly string[]): string {
  return sources.length ? `Incomplete: ${listWords(sources)} could not be read, so the numbers may be low.` : '';
}
