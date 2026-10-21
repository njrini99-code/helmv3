/**
 * The service worker's caches of signed-in content, dropped at sign-out.
 *
 * public/sw.js keeps golf dashboard pages (network-first, offline fallback) in
 * `golfhelm-<version>-dynamic`, keyed by URL alone; older workers also kept
 * every API response in `golfhelm-<version>-api`. Nothing cleared them at
 * sign-out, so offline the next person on a shared phone could be shown the
 * last person's roster and notes (security review, 2026-10-16). Every golf
 * sign-out path calls this next to `clearAllCachedResources()`.
 *
 * `-static` is kept: it holds content-hashed build assets and offline.html,
 * nothing that belongs to a person. IndexedDB is not touched here: it holds
 * the signed-out player's own unsynced rounds, which have their own discard
 * rules, and every reader of it filters by player.
 *
 * Never throws, and never holds a sign-out up for long: it resolves once the
 * deletes finish or after `PRIVATE_CACHE_CLEAR_WAIT_MS`, whichever is first.
 * Callers await it before navigating away, so the page is not torn down
 * mid-delete.
 */
export const PRIVATE_CACHE_CLEAR_WAIT_MS = 1000;

export function isPrivateServiceWorkerCache(name: string): boolean {
  return name.startsWith('golfhelm-') && !name.endsWith('-static');
}

export async function clearPrivateServiceWorkerCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const clear = (async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(isPrivateServiceWorkerCache).map((k) => caches.delete(k)));
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = new Promise<void>((done) => {
    timer = setTimeout(done, PRIVATE_CACHE_CLEAR_WAIT_MS);
  });
  await Promise.race([clear, wait]);
  if (timer) clearTimeout(timer);
}
