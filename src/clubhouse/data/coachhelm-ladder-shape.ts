import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { formatSigned } from '../lib/format';
import { PLAYER_HELM_HREF } from './coachhelm-views-shape';

/**
 * "Where strokes go" (design call, Standing; review 7.4): the four parts of the game a round is played in, each with what it
 * gains or loses a round against the Tour, and the open reads behind it. Pure, so the loader, the preview and the tests run it.
 *
 * The strokes are the player's strokes-gained rows in `golf_player_standing` (the same four the Strokes gained group draws),
 * as raw strokes a round with a true minus: nothing is projected, summed or re-estimated here. The reads are the player's open
 * findings (the Board's own `isOpenFinding`), filed under the part of the game their category names; categories that are not
 * one of the four (scoring, pressure, course management) are not on the ladder. No club is ever named.
 */

export type ChLadderAreaId = 'tee' | 'approach' | 'short_game' | 'putting';

/** One open read filed under an area, as the loader hands it over. */
export interface ChLadderRead {
  id: string;
  category: InsightCategory | null;
  /** The read's title, in the player's voice. */
  title: string;
  /** Board priority, so the most urgent read is first under its area. */
  priority: 'high' | 'medium' | 'low';
  /** The confidence word ("Solid read", "Early read", "Thin read, n=8"); null when the evidence has none. */
  word: string | null;
  /** The cause state as the read's Why line says it ("Counted" and its sequence); absent with the root-cause flag off. */
  cause: { word: string; line: string } | null;
}

/** The open reads beside the standing: read, or the read failed and the ladder says so (CH-13273). */
export type ChLadderReads = { status: 'ok'; list: readonly ChLadderRead[] } | { status: 'failed' };

export interface ChLadderCause {
  id: string;
  title: string;
  /** The firmness words, joined: "Solid read · Counted". Never a percent. */
  firmness: string | null;
  /** The counted sequence, or why the cause is not traced yet; null without a cause state. */
  line: string | null;
  /** The read in the Deep dive. */
  href: string;
}

export interface ChLadderRow {
  id: ChLadderAreaId;
  /** "Off the tee", "Approach", "Around the green", "Putting". */
  label: string;
  /** Strokes a round against the Tour, two decimals with a true minus ("−0.91", "+0.12"); null when there is nothing to compare. */
  strokes: string | null;
  sense: 'gain' | 'loss' | 'level' | null;
  /** The bar's length, 0 to 100, against the largest of the four. */
  pct: number;
  /** Why there is no figure, in words (CH-13374); null when there is one. */
  missing: string | null;
  causes: ChLadderCause[];
}

export interface ChLadder {
  rows: ChLadderRow[];
  /** The area that loses the most against the Tour; null when none loses. The hero names it, once. */
  top: ChLadderAreaId | null;
  /** The reads behind the rows did not load: no row offers "Because", and the ladder says why (CH-13273). */
  readsFailed: boolean;
}

const AREAS: ReadonlyArray<{ id: ChLadderAreaId; label: string; metric: string }> = [
  { id: 'tee', label: 'Off the tee', metric: 'sg_ott' },
  { id: 'approach', label: 'Approach', metric: 'sg_approach' },
  { id: 'short_game', label: 'Around the green', metric: 'sg_around_green' },
  { id: 'putting', label: 'Putting', metric: 'sg_putting' },
];

/** The hero's sentence for the area that loses the most: it names the area, and the number stays on the ladder. */
export const LADDER_HEADLINE: Record<ChLadderAreaId, string> = {
  tee: 'Your tee shots cost you the most strokes against the Tour',
  approach: 'Your approach shots cost you the most strokes against the Tour',
  short_game: 'Your shots around the green cost you the most strokes against the Tour',
  putting: 'Your putting costs you the most strokes against the Tour',
};

/** The area a read's category files under; null for one that is not a part of the round. */
export function areaOf(category: InsightCategory | string | null | undefined): ChLadderAreaId | null {
  switch (category) {
    case 'tee':
      return 'tee';
    case 'approach':
      return 'approach';
    case 'short_game':
      return 'short_game';
    case 'putting':
      return 'putting';
    default:
      return null;
  }
}

const RANK = { high: 0, medium: 1, low: 2 } as const;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The strokes a round the area is against the Tour, or why there is none. */
function strokesOf(s: PlayerStanding | undefined): { delta: number } | { missing: string } {
  if (!s || !finite(s.player_value)) return { missing: 'Not measured yet. It fills in once your rounds have the shots it needs.' };
  if (s.pga_omitted || !finite(s.pga_value)) return { missing: 'No Tour figure to compare this with yet.' };
  return { delta: s.player_value - s.pga_value };
}

/**
 * The ladder from the standing rows (any order, any metrics; only the four strokes-gained parts are read) and the open reads.
 * `reads` absent is "no reads were given", drawn as no causes; a failed read is said once on the ladder.
 */
export function toChLadder(rows: readonly PlayerStanding[], reads: ChLadderReads | null = null): ChLadder {
  const byId = new Map(rows.map((r) => [r.metric_id as string, r]));
  const list = reads?.status === 'ok' ? reads.list : [];
  const measured = AREAS.map((a) => ({ a, m: strokesOf(byId.get(a.metric)) }));
  const max = Math.max(0, ...measured.map(({ m }) => ('delta' in m ? Math.abs(m.delta) : 0)));
  const out: ChLadderRow[] = measured.map(({ a, m }) => {
    const causes = list
      .filter((r) => areaOf(r.category) === a.id)
      .sort((x, y) => RANK[x.priority] - RANK[y.priority])
      .map((r) => ({
        id: r.id,
        title: r.title,
        firmness: [r.word, r.cause?.word].filter(Boolean).join(' · ') || null,
        line: r.cause?.line ?? null,
        href: `${PLAYER_HELM_HREF['deep-dive']}&insight=${encodeURIComponent(r.id)}`,
      }));
    if (!('delta' in m)) return { id: a.id, label: a.label, strokes: null, sense: null, pct: 0, missing: m.missing, causes };
    const shown = formatSigned(m.delta, 2);
    const sense = Number(m.delta.toFixed(2)) === 0 ? 'level' : m.delta > 0 ? 'gain' : 'loss';
    // A visible sliver for the smallest non-zero figure, so a gain or a loss is never drawn as nothing.
    const pct = sense === 'level' || max === 0 ? 0 : Math.max(4, Math.round((Math.abs(m.delta) / max) * 100));
    return { id: a.id, label: a.label, strokes: shown, sense, pct, missing: null, causes };
  });
  const losses = measured.filter((x): x is { a: (typeof AREAS)[number]; m: { delta: number } } => 'delta' in x.m && Number(x.m.delta.toFixed(2)) < 0);
  const top = losses.sort((x, y) => x.m.delta - y.m.delta)[0]?.a.id ?? null;
  return { rows: out, top, readsFailed: reads?.status === 'failed' };
}
