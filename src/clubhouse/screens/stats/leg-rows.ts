import type { ChPlayerProfile, ChProfileRound } from '../../data/stats-player';
import { formatSigned } from '../../lib/format';
import { earlyTag, needsText, sampleState, spreadFor, standardError, type FloorKind, type SampleState } from '../../lib/stats-signal';

/** One row of the strokes gained bars, with how sure its figure is. */
export interface SgLegRow {
  key: 'tee' | 'approach' | 'around' | 'putting' | 'total';
  label: string;
  /** What the leg measures, in a line (desktop). */
  means?: string;
  /** The window's mean a round; null when the window has none, or too few rounds to show one (see `needs`). */
  value: number | null;
  /** The team's value for the same leg (a coach's view); null draws no mark. */
  team?: number | null;
  /** Rounds behind the figure. */
  n?: number;
  /** Standard error of the mean: the whisker's half-length. */
  se?: number | null;
  /** `early` draws the bar muted; `none` says what it needs instead of a bar. */
  state?: SampleState;
  /** The tag on a muted value, or what a row under its floor needs. */
  tag?: string;
  total?: boolean;
}

const LEGS = [
  { key: 'tee', index: 0, label: 'Off the tee', means: 'Tee shots on par 4s and 5s', floor: 'sgLong', pick: (w: ChPlayerProfile['win']) => w.sgLegs.tee, team: 'SG off the tee' },
  { key: 'approach', index: 1, label: 'Approach', means: 'Full shots from over 30 yards', floor: 'sgLong', pick: (w: ChPlayerProfile['win']) => w.sgLegs.approach, team: 'SG approach' },
  { key: 'around', index: 2, label: 'Around green', means: 'Chips, pitches and bunker shots within 30 yards', floor: 'sgShort', pick: (w: ChPlayerProfile['win']) => w.sgLegs.around, team: 'SG around green' },
  { key: 'putting', index: 3, label: 'Putting', means: 'Every shot on the green', floor: 'sgShort', pick: (w: ChPlayerProfile['win']) => w.sgLegs.putting, team: 'SG putting' },
] as const satisfies ReadonlyArray<{ key: SgLegRow['key']; index: number; label: string; means: string; floor: FloorKind; pick: (w: ChPlayerProfile['win']) => number | null; team: string }>;

/** A round's value per 18 holes, as the window's means weight it (a nine-hole round counts half). */
const per18 = (v: number, holes: number) => v / (holes / 18);

function spread(rounds: ChProfileRound[], pick: (r: ChProfileRound) => number | null) {
  const values: number[] = [];
  for (const r of rounds) {
    const v = pick(r);
    if (v == null || Number.isNaN(v)) continue;
    values.push(per18(v, r.holes));
  }
  return { values, n: values.length };
}

export type SgLegBar = SgLegRow & { means: string };

/**
 * The strokes gained rows for a player's window, from the profile: each leg's mean (the window's own, weighted), how many
 * rounds sit behind it, and its standard error (the player's own spread once they have five rounds, else the pooled one).
 * A leg under its show floor has no value and says what it needs; between the show and early floors it is muted with a tag.
 */
export function sgLegBars(data: ChPlayerProfile, coach: boolean): SgLegBar[] {
  const cmp = (label: string) => data.comparisons.find((c) => c.label === label);
  // The window's own count of rounds with shots (a nine-hole round counts half), the one its means are weighted by.
  const eff = data.win.effSgRounds;
  const rounds = data.win.sgRounds;
  return LEGS.map((leg) => {
    const raw = leg.pick(data.win);
    const s = spread(data.rounds, (r) => r.sgLegs[leg.index] ?? null);
    const state = raw == null ? 'none' : sampleState(leg.floor, eff);
    return {
      key: leg.key,
      label: leg.label,
      means: leg.means,
      value: state === 'none' ? null : raw,
      team: coach ? (cmp(leg.team)?.team ?? null) : null,
      n: rounds,
      se: state === 'none' ? null : standardError(spreadFor(s.values, 'sg'), s.n || rounds),
      state,
      tag: state === 'early' ? earlyTag(eff) : state === 'none' && raw != null ? needsText(leg.floor) : undefined,
    };
  });
}

/** The four legs, then the Total under them (the phone's rows). */
export function sgLegRows(data: ChPlayerProfile, coach: boolean): SgLegRow[] {
  const cmp = (label: string) => data.comparisons.find((c) => c.label === label);
  const eff = data.win.effSgRounds;
  const rounds = data.win.sgRounds;
  const rows: SgLegRow[] = sgLegBars(data, coach);
  const t = spread(data.rounds, (r) => r.sg);
  const total = data.win.sgPerRound;
  const tState = total == null ? 'none' : sampleState('sgLong', eff);
  rows.push({
    key: 'total',
    label: 'Total',
    value: tState === 'none' ? null : total,
    team: coach ? (cmp('SG total')?.team ?? null) : null,
    n: rounds,
    se: tState === 'none' ? null : standardError(spreadFor(t.values, 'sg'), t.n || rounds),
    state: tState,
    tag: tState === 'early' ? earlyTag(eff) : undefined,
    total: true,
  });
  return rows;
}

/** One standard error either side of the mean: the "likely range" the whisker draws. */
export function likelyRange(value: number, se: number): [number, number] {
  return [value - se, value + se];
}

/**
 * What a pinned or hovered leg says in the chart's header line: "Approach · −2.6 a round · 8 rounds · likely range −3.7 to
 * −1.5", with the team beside it for a coach. A leg under its floor says what it needs; a muted one says it is an early read.
 */
export function legReadout(row: Pick<SgLegRow, 'label' | 'value' | 'team' | 'n' | 'se' | 'state' | 'tag'>, teamName?: string | null): string {
  if (row.value == null) return row.tag ? `${row.label} · ${row.tag}` : `${row.label} · No strokes gained yet`;
  const parts = [row.label, `${formatSigned(row.value)} a round`];
  parts.push(row.state === 'early' && row.tag ? row.tag : `${row.n ?? 0} ${row.n === 1 ? 'round' : 'rounds'}`);
  if (row.se != null) {
    const [lo, hi] = likelyRange(row.value, row.se);
    parts.push(`likely range ${formatSigned(lo)} to ${formatSigned(hi)}`);
  }
  if (row.team != null) parts.push(`${teamName ?? 'Team'} ${formatSigned(row.team)}`);
  return parts.join(' · ');
}
