import 'server-only';
import { getNextQualifierRoundNumber, getPlayerQualifiers } from '@/app/golf/actions/qualifier-actions';
import type { ChSetupQualifier } from '../screens/rounds/setup/shape';
import { QUALIFIER_READ_MS, readSetupQualifiers } from '../screens/rounds/entry/setup-qualifiers';
import { chLogServer } from '../lib/track-server';

/**
 * New round's qualifier list, read by the route on the server (PMAC-03, production audit 2026-11-15).
 *
 * The screen used to read it after hydration through two server actions, which the browser runs one after another
 * (the list, then each open qualifier's next round, about 1.1 s apart), and drew four skeleton slabs until both had
 * answered: about 3 s before the form on a direct load. Read here, the list and every open qualifier's next round run
 * on the server with the route's other reads, all at once, so the form is the first paint, and Try again (CH-11211,
 * a refresh) reads it again.
 *
 * A slow read never holds the page: past `QUALIFIER_READ_MS` the list counts as not loaded, as it did in the browser.
 */
export async function loadSetupQualifiers(readMs: number = QUALIFIER_READ_MS): Promise<ChSetupQualifier[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      chLogServer('rounds.new', 'qualifiers.slow', new Error(`no answer in ${readMs} ms`));
      resolve(null);
    }, readMs);
  });
  const read = readSetupQualifiers({
    list: getPlayerQualifiers,
    next: getNextQualifierRoundNumber,
    report: (err, which) => chLogServer('rounds.new', which === 'list' ? 'qualifiers' : 'qualifiers.next', err),
  });
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}
