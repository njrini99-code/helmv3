import { CAST, type CastPlayer } from './cast';

/**
 * One team's strokes gained for every preview that draws it (owner rule: one number lives in one place and comes from one source).
 * Team stats, CoachHelm Team and the Player file used to carry three hand-written teams, so the previews showed −0.5 and −1.9 for
 * "the same" team. They now read these rows: each active cast player's last ten counted rounds, as the loaders' one window reads them.
 *
 * `rounds` is the counted rounds in the window and `shots` how many of them carry strokes gained; a player under three with shots has
 * no figure anywhere (Sam). The team figure pools the rounds of the players at that floor, which is `teamStrokesGained`
 * (data/stats-team-sg.ts); that module is server-side, so the same sum is written out here and
 * `data/__tests__/one-team-figure.test.ts` holds the two together.
 */
export interface PreviewSgRow {
  cast: CastPlayer;
  rounds: number;
  shots: number;
  /** Off the tee, approach, around the green, putting; null under the floor. */
  legs: [number, number, number, number] | null;
  total: number | null;
}

export const PREVIEW_SG_FLOOR = 3;

/** In Team stats' own order. Jonah's row is his My stats page's figures; Theo's four rounds make him an early read everywhere. */
export const PREVIEW_SG_ROWS: readonly PreviewSgRow[] = [
  { cast: CAST.theo, rounds: 4, shots: 4, legs: [-0.6, -0.4, -0.3, -0.8], total: -2.2 },
  { cast: CAST.sofia, rounds: 10, shots: 10, legs: [0.4, 0.5, 0.1, 0.4], total: 1.2 },
  { cast: CAST.ava, rounds: 10, shots: 10, legs: [0.2, 0.3, 0.1, 0.3], total: 0.6 },
  { cast: CAST.eli, rounds: 10, shots: 6, legs: [0.0, -0.4, 0.0, 0.0], total: -0.5 },
  { cast: CAST.priya, rounds: 10, shots: 10, legs: [-0.6, -0.8, -0.2, -0.3], total: -1.2 },
  { cast: CAST.jonah, rounds: 10, shots: 10, legs: [0.3, -1.2, -0.1, 0.2], total: -0.9 },
  { cast: CAST.sam, rounds: 2, shots: 2, legs: null, total: null },
];

export const previewSgRow = (id: CastPlayer['id']): PreviewSgRow => PREVIEW_SG_ROWS.find((r) => r.cast.id === id) as PreviewSgRow;

const ready = PREVIEW_SG_ROWS.filter((r): r is PreviewSgRow & { legs: [number, number, number, number]; total: number } => r.shots >= PREVIEW_SG_FLOOR && r.legs != null && r.total != null);
const weight = ready.reduce((a, r) => a + r.shots, 0);
const pooled = (pick: (r: (typeof ready)[number]) => number) => ready.reduce((a, r) => a + pick(r) * r.shots, 0) / weight;

/** The team over the same window: the rounds of the players at the floor, pooled. */
export const PREVIEW_TEAM_SG: { total: number; legs: [number, number, number, number]; rounds: number; players: number } = {
  total: pooled((r) => r.total),
  legs: [pooled((r) => r.legs[0]), pooled((r) => r.legs[1]), pooled((r) => r.legs[2]), pooled((r) => r.legs[3])],
  rounds: weight,
  players: ready.length,
};
