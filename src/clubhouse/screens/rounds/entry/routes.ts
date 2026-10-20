export const ROUNDS_LIBRARY = '/golf/dashboard/rounds';
export const ROUNDS_RECOVER = `${ROUNDS_LIBRARY}/recover`;

/**
 * Where the round engines send the player, as Clubhouse names it (the defaults are Fairway's own routes). The one the
 * engines reach is the recovery flow: a submit that couldn't reach the server (its round is saved on the device) lands
 * on Clubhouse's `RoundRecover` with `?from=submit`, as Fairway's does, where the round is restored, synced again or
 * discarded (swap audit F-02). `NewRound` and `ContinueRound` both pass this.
 */
export const ENGINE_ROUTES = { recover: `${ROUNDS_RECOVER}?from=submit` };
