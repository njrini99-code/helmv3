/**
 * Where the round engines send the player, and how they tag their logs.
 *
 * The defaults are the Fairway screens' own routes and labels, so a screen that passes nothing behaves as it always
 * has. A second renderer passes its own. The engines read these at call time (through a ref), never as a dependency,
 * so a new object each render re-creates no callback and re-runs no effect.
 */
export interface RoundSessionRoutes {
  /** The rounds library: where Save for later and Discard land. */
  library: string;
  /** A finished round's own page: where a round the server already completed is sent. */
  round: (roundId: string) => string;
  /** The screen that continues an in-progress round. */
  continueRound: (roundId: string) => string;
  /** The device-recovery flow a submit that could not reach the server falls into. */
  recover: string;
}

export const LEGACY_ROUND_ROUTES: RoundSessionRoutes = {
  library: '/golf/dashboard/rounds',
  round: (roundId) => `/golf/dashboard/rounds/${roundId}`,
  continueRound: (roundId) => `/golf/dashboard/rounds/continue/${roundId}`,
  recover: '/golf/dashboard/rounds/recover?from=submit',
};

/** The `component` and `route` tags on an engine's error log. */
export interface RoundSessionLogSource {
  component: string;
  route: string;
}

export const LEGACY_NEW_ROUND_LOG_SOURCE: RoundSessionLogSource = {
  component: 'NewRoundClient',
  route: '/golf/dashboard/rounds/new',
};

/** The legacy routes with any the renderer names replaced. */
export function resolveRoundRoutes(routes?: Partial<RoundSessionRoutes>): RoundSessionRoutes {
  if (!routes) return LEGACY_ROUND_ROUTES;
  return {
    library: routes.library ?? LEGACY_ROUND_ROUTES.library,
    round: routes.round ?? LEGACY_ROUND_ROUTES.round,
    continueRound: routes.continueRound ?? LEGACY_ROUND_ROUTES.continueRound,
    recover: routes.recover ?? LEGACY_ROUND_ROUTES.recover,
  };
}
