/**
 * The golf player signed in on this device, for the offline drains (security review of swap audit R-5).
 *
 * The legacy v1 queue is device-wide and outlives sign-out, so a scorecard queued by one account could be submitted by
 * the next account's session; with the round gone, the server's round_missing recovery would then re-create it as the
 * second player's round. The drain submits only records whose `playerId` is this one, and drains nothing while it is
 * unknown (records stay queued; nothing is deleted). Set by GolfUserProvider, which both dashboard shells render.
 */
// On globalThis, not a module variable: the drain and the provider must agree even when the module is re-evaluated
// (dev hot reload, a reset module registry), and the value is one per page anyway.
const KEY = '__helmSyncSessionPlayer';
type Holder = { [KEY]?: string | null };

export function setSyncSessionPlayer(playerId: string | null): void {
  (globalThis as Holder)[KEY] = playerId;
}

export function getSyncSessionPlayer(): string | null {
  return (globalThis as Holder)[KEY] ?? null;
}
