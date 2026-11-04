/** The read redesign's three open owner calls (31 Oct). Each value is the default; Nick can flip it. */
export const READ_CALLS = {
  /** Default, Nick can flip. Call 1: pictures back (reverses D8). false draws the words only. */
  pictures: true,
  /** Default, Nick can flip. Call 2: players see the observed funnel. Q3 (no guessed cause for players) stays either way. */
  playerFunnel: true,
  /** Default, Nick can flip. Call 3: 'when-flag-on' shows the team pool only with coachhelm_team_pool_v1 on; 'never' is Tour only. */
  teamPoolOnLadder: 'when-flag-on' as 'when-flag-on' | 'never',
};
export type ChReadCalls = typeof READ_CALLS & { teamPool: boolean };
