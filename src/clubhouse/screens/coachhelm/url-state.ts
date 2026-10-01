/**
 * A pick the coach or player made on a CoachHelm screen (the player on the coach's board, the read on the player's board and Deep
 * dive) lives in the address, so Back, a reload and a shared link return to it (owner rule 8, 2026-10-01).
 *
 * It is written with `history.replaceState`, never `router.replace` or `router.push`: a router navigation re-runs the server render,
 * and the delivery actions behind it record every insight they return as shown, so a pick would count insights nobody saw again.
 * `replaceState` with the entry's own state is the one Ask already uses (`chat/Ask.tsx`): Next leaves the router alone for it, so no
 * request is made and the entry keeps its place in the history. Nothing reads the router's own search params afterwards (they are not
 * updated by it); `paramNow` reads the address.
 *
 * Back restores the page's cached render with the props it was first drawn with, from before the address was rewritten, so the pick
 * is read from the address when the screen mounts and the server's value (`fallback`) is only what the address does not say.
 */

/** The address's `name` as the browser has it now, else `fallback` (the server's value; also what a server render, with no address, sees). */
export function paramNow(name: string, fallback?: string | null): string | null {
  if (typeof window === 'undefined') return fallback ?? null;
  return new URLSearchParams(window.location.search).get(name) ?? fallback ?? null;
}

/** Puts one query parameter in the address (`null` takes it out), in place and without a server round trip. */
export function writeParam(name: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.replaceState(window.history.state, '', next);
}
