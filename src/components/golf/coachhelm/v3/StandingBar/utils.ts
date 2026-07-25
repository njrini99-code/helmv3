/**
 * v3 StandingBar — pure-function helpers.
 *
 * All math + formatting + a11y derivation lives here so the React
 * components stay declarative. Unit-tested in
 * src/test/golf/components/StandingBar.test.tsx (utils.test path).
 */

import type {
  Direction,
  RenderState,
  StandingBarProps,
  Unit,
} from './types';
import { TEAM_MARKER_MIN_N, PCT_LANGUAGE_MIN_N } from './types';

/**
 * Position a value within [scale.min, scale.max] as a 0-100 percentage.
 * Clamped — out-of-range values stick to the edge.
 */
export function toScalePct(value: number, scale: { min: number; max: number }): number {
  if (scale.max === scale.min) return 50;
  const pct = ((value - scale.min) / (scale.max - scale.min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * CF-3: the reference ("P") marker is mislabeled "PGA" for strokes-gained
 * metrics. SG is a zero-sum, field-relative quantity — the "0" reference is
 * the FIELD AVERAGE (Tour-relative baseline), not a PGA Tour player's score.
 * Labeling it "PGA 0.00" implies the Tour shoots flat-zero, overstating every
 * elite-amateur weakness. For sg_* metrics the reference reads "Field Avg";
 * for every other metric the PGA Tour value is a genuine Tour standard and
 * keeps the "PGA" / "LPGA" label.
 *
 * `short` is the compact marker label ("Field Avg" / "PGA" / "LPGA"); `long`
 * is the a11y phrase ("Field average" / "PGA Tour" / "LPGA Tour").
 *
 * @param metric_id - Canonical metric id.
 * @param isWomens  - True when the player's team is a women's team. When true,
 *                    non-SG metrics show "LPGA" instead of "PGA". Defaults to
 *                    false (unchanged behaviour for all existing callers).
 */
export function pgaReferenceLabel(
  metric_id: string,
  isWomens?: boolean,
): { short: string; long: string } {
  if (/^sg_/.test(metric_id)) {
    return { short: 'Field Avg', long: 'Field average' };
  }
  if (isWomens) {
    return { short: 'LPGA', long: 'LPGA Tour' };
  }
  return { short: 'PGA', long: 'PGA Tour' };
}

/** Display formatter per unit. */
export function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case 'percent': return `${value.toFixed(0)}%`;
    case 'strokes': return value.toFixed(2);
    case 'yards':   return `${value.toFixed(0)} yd`;
    case 'feet':    return `${value.toFixed(0)} ft`;
    case 'count':   return value.toFixed(1);
    default: {
      const _exhaustive: never = unit;
      return String(_exhaustive);
    }
  }
}

/**
 * Whether two values render IDENTICALLY once formatted for display (e.g.
 * 64.6% and 65.3% both round to "65%" via `formatValue(_, 'percent')`).
 *
 * Bug: `deltaVsTeam`/`teamRelativeText` used a single hardcoded ABSOLUTE
 * epsilon (0.01) to decide "equal". That's calibrated for 'strokes' metrics
 * (SG values, typically -2..2, formatted to 2dp) but is wildly too tight
 * for a 'percent' metric (0-100 scale, formatted to 0dp) — a player at
 * 64.6% vs a team average of 65.3% differ by 0.7, which clears 0.01, so the
 * old check called the player "Below team average" in red under two chips
 * that both read "65%". The verdict must agree with what the user actually
 * SEES: when the formatted (rounded) values match, the comparison is a
 * wash regardless of the raw floating-point delta. Falls back to the old
 * absolute-epsilon behavior when `unit` is omitted (existing callers that
 * don't pass it keep their prior behavior unchanged).
 */
export function valuesDisplayEqual(a: number, b: number, unit?: Unit): boolean {
  if (unit) return formatValue(a, unit) === formatValue(b, unit);
  return Math.abs(a - b) < 0.01;
}

/**
 * Derive an arrow + semantic tone for "player vs team" comparison.
 * Used by the size-variant headers (↑ vs team / ↓ vs team).
 *
 * Returns 'neutral' when the values render identically (see
 * `valuesDisplayEqual`) or team is null.
 */
export function deltaVsTeam(
  player_value: number,
  team_avg: number | null,
  direction: Direction,
  unit?: Unit,
): { arrow: '↑' | '↓' | '·'; tone: 'good' | 'bad' | 'neutral' } {
  if (team_avg === null || !Number.isFinite(team_avg)) {
    return { arrow: '·', tone: 'neutral' };
  }
  if (valuesDisplayEqual(player_value, team_avg, unit)) {
    return { arrow: '·', tone: 'neutral' };
  }
  const diff = player_value - team_avg;
  // Arrow describes WHERE the player sits relative to team (above/below).
  // Tone describes whether that's good or bad for this metric's direction.
  const arrow: '↑' | '↓' = diff > 0 ? '↑' : '↓';
  const better = direction === 'higher_better' ? diff > 0 : diff < 0;
  return { arrow, tone: better ? 'good' : 'bad' };
}

/**
 * Translate `team_pct` (0-100, higher = better) into the cohort-text
 * line shown beneath the bar.
 *
 *   90+ → "Top X% on your team"
 *   75-89 → "Top quartile on your team"
 *   50-74 → "Above team average"
 *   25-49 → "Below team average"
 *   <25 → "Bottom X% on your team"
 *
 * Returns empty string for cold-start (no team_pct).
 *
 * EC-2: `team_n` is an OPTIONAL tiny-N guard. `team_pct` is a PERCENT_RANK()
 * that degenerates to 0/100 for the only/worst row on a tiny roster — which
 * produced "Bottom 1% on your team" for a team of one. When `team_n` is passed
 * and below the team-marker floor (TEAM_MARKER_MIN_N), we suppress the caption
 * entirely. Omitting `team_n` keeps the legacy permissive behavior so callers
 * that already gate upstream (e.g. via shouldShowTeamMarker) are unaffected.
 */
export function teamCohortText(
  team_pct: number | null | undefined,
  team_n?: number | null,
): string {
  if (team_pct === null || team_pct === undefined || !Number.isFinite(team_pct)) {
    return '';
  }
  if (team_n !== undefined && team_n !== null && team_n < TEAM_MARKER_MIN_N) {
    return '';
  }
  const pct = Math.round(team_pct);
  // On a realistically-small roster, "Top 1% / Bottom 1% on your team" is
  // statistical nonsense (you can't be the top 1% of 7). Use qualitative
  // phrasing for the extremes. Quartile/above/below remain fine. When team_n
  // is omitted (legacy callers / tests) keep the percentage language.
  const smallRoster = team_n !== undefined && team_n !== null && team_n < PCT_LANGUAGE_MIN_N;
  if (pct >= 90) return smallRoster ? 'Top of your team' : `Top ${Math.max(1, 100 - pct)}% on your team`;
  if (pct >= 75) return 'Top quartile on your team';
  if (pct >= 50) return 'Above team average';
  if (pct >= 25) return 'Below team average';
  return smallRoster ? 'Bottom of your team' : `Bottom ${Math.max(1, pct)}% on your team`;
}

/**
 * Mean-relative cohort line — describes the player's position vs the TEAM
 * AVERAGE the bar's "T" marker actually renders (props.team_avg). Keeping the
 * caption mean-relative makes it agree with the ↑/↓ arrow, the tone color, and
 * the marker position. (The older percentile-based teamCohortText could read
 * "Above team average" while the mean-delta arrow pointed DOWN on an
 * outlier-skewed team — the contradiction surfaced on the round-review SG
 * cards, e.g. You 0.17 vs Team-mean 1.02 dragged up by one 6.64 teammate.)
 */
export function teamRelativeText(
  player_value: number,
  team_avg: number | null,
  direction: Direction,
  unit?: Unit,
): string {
  if (team_avg === null || !Number.isFinite(team_avg)) return '';
  // See `valuesDisplayEqual` — a unit-aware equality check so two chips
  // that display the SAME number (e.g. "65%" vs "65%") can never be
  // narrated as one being above/below the other. "Matches team average"
  // carries no possessive, so — like "Above/Below team average" — it
  // passes through `neutralizeForCoach` unchanged.
  if (valuesDisplayEqual(player_value, team_avg, unit)) return 'Matches team average';
  const diff = player_value - team_avg;
  const better = direction === 'higher_better' ? diff > 0 : diff < 0;
  return better ? 'Above team average' : 'Below team average';
}

/* ───────────────────────────────────────────────────────────────────────────
 * Audience voice — bug #915: a coach reading a player's SG card saw
 * player-first-person copy ("YOU −3.34 … Below team average / Bottom of your
 * team") even though the coach, not the player, is the reader. `teamCohortText`
 * / `teamRelativeText` above are written in the player's own voice ("your
 * team") because that's the common case (a player viewing their own stats);
 * these two helpers let a `viewer_context: 'coach'` caller neutralize that
 * possessive and swap the "You" subject for the player's name.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Strip the player-possessive "your" from a cohort/relative sentence for a
 * coach reader. `teamCohortText`/`teamRelativeText` only ever emit "your
 * team" (never "my team" or other possessives), so a single case-insensitive
 * replacement covers every sentence shape both functions produce:
 *   "Bottom of your team"   -> "Bottom of team"
 *   "Top 18% on your team"  -> "Top 18% on team"
 *   "About your team average" -> "About team average"
 * "Above/Below team average" already carry no possessive and pass through
 * unchanged. No-op for `viewer_context !== 'coach'` (or an empty string).
 */
export function neutralizeForCoach(text: string, viewerContext?: 'self' | 'coach'): string {
  if (viewerContext !== 'coach' || !text) return text;
  return text.replace(/\byour team\b/gi, 'team');
}

/**
 * Short initials from a display name for the tight coach-facing readout
 * label (mirrors the "T"/"P" single/double-letter marker convention already
 * used on the bar). "Ethan Rodriguez" -> "ER"; a single-word name takes its
 * first two letters ("Ethan" -> "ET"). Falls back to "PL" when no usable name
 * is given — never fabricates a real player's initials.
 */
export function initialsFromName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'PL';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'PL';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1]!;
  return `${first[0]}${last[0]}`.toUpperCase();
}

/**
 * The subject label for the hero marker/readout: "You" for the player's own
 * view (default), or the player's initials for a coach reader. Full name is
 * reserved for the spoken aria label (`deriveAriaLabel`) — initials keep the
 * visual 3-up row ("You"/"Team"/"PGA"-width) from overflowing.
 */
export function standingSubjectLabel(
  viewerContext: 'self' | 'coach' | undefined,
  playerName: string | null | undefined,
): string {
  return viewerContext === 'coach' ? initialsFromName(playerName) : 'You';
}

/**
 * Derive the auto state from the props when one isn't passed explicitly.
 * 'error' and 'empty' must be passed in; this function returns either
 * 'cold-start' (when team data is insufficient) or 'happy'.
 */
export function deriveState(props: Pick<StandingBarProps, 'state' | 'team_avg' | 'team_n'>): RenderState {
  if (props.state) return props.state;
  const teamN = props.team_n ?? 0;
  if (props.team_avg === null || teamN < TEAM_MARKER_MIN_N) return 'cold-start';
  return 'happy';
}

/** Whether the team marker should render. */
export function shouldShowTeamMarker(props: Pick<StandingBarProps, 'team_avg' | 'team_n'>): boolean {
  if (props.team_avg === null) return false;
  if ((props.team_n ?? 0) < TEAM_MARKER_MIN_N) return false;
  return true;
}

/**
 * Auto-derive a single-sentence aria label. When `viewer_context === 'coach'`
 * the spoken subject is the player's name (falling back to "Player" — never
 * the player's own "You"), and the cohort clause drops the "your team"
 * possessive (bug #915 — a coach's screen reader must not hear "you" for a
 * player who isn't them).
 */
export function deriveAriaLabel(props: StandingBarProps): string {
  if (props.ariaLabel) return props.ariaLabel;
  const isCoach = props.viewer_context === 'coach';
  const subject = isCoach ? props.player_name?.trim() || 'Player' : 'You';
  const you = formatValue(props.player_value, props.unit);
  const parts = [`${props.metric_label}. ${subject}: ${you}.`];
  // P3: omit the reference phrase entirely when the anchor is suppressed —
  // a women's player on a metric with no credible women's baseline must not be
  // narrated against a misleading men's value.
  if (!props.pga_omitted) {
    // CF-3: SG metrics anchor to the FIELD AVERAGE (0), not a PGA Tour score.
    // Women's teams get "LPGA Tour" instead of "PGA Tour" for non-SG metrics.
    const refLabel = pgaReferenceLabel(props.metric_id, props.is_womens).long;
    parts.push(`${refLabel}: ${formatValue(props.pga_value, props.unit)}.`);
  }
  if (props.team_avg !== null && (props.team_n ?? 0) >= TEAM_MARKER_MIN_N) {
    parts.push(`Team average: ${formatValue(props.team_avg, props.unit)}.`);
  }
  const cohort = teamRelativeText(props.player_value, props.team_avg, props.direction, props.unit);
  if (cohort) parts.push(neutralizeForCoach(cohort, props.viewer_context) + '.');
  return parts.join(' ');
}

/* ───────────────────────────────────────────────────────────────────────────
 * Track geometry — dynamic domain + marker-collision layout.
 *
 * Both bugs below come from treating the caller-supplied `scale` as a hard
 * bound instead of a typical/expected range: `metric-config.ts` ships a
 * fixed `default_scale` per metric (e.g. sg_approach: -1.5..1.5), but a real
 * outlier round can post a player/team/field value beyond it.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Expand the caller-supplied display scale so every value that will
 * actually be plotted lands strictly inside `[min, max]` — never clamped to
 * the literal edge. `toScalePct` clamps out-of-range values to 0/100; a
 * marker pinned there sits centered on the rail's literal boundary, and
 * `-translate-x-1/2` then pushes half its own width outside the rail,
 * which the card's `overflow-clip` cuts off (a "half-clipped circle") —
 * and visually, a value that's actually -2.43 renders in the exact same
 * spot as one that's exactly -1.50, which is a silent misrepresentation
 * even when nothing looks visually broken. The caller's scale is a FLOOR,
 * not a ceiling: widen it to cover every finite value passed in, then pad
 * the widened span so an included extreme still sits inboard of the literal
 * 0%/100% edge. `opts.symmetric` re-centers the widened domain around zero
 * — the existing convention for SG metrics (metric-config's SG ranges are
 * already symmetric: -1.5..1.5, -1..1, -2..2 — because 0 is the definitional
 * field-average anchor and must stay visually centered, not drift toward
 * whichever side happened to blow past the original bound).
 *
 * No-ops (returns the original scale unchanged) when every value already
 * fits — existing in-range cards render pixel-identical to before.
 */
export function resolveDisplayScale(
  scale: { min: number; max: number },
  values: ReadonlyArray<number | null | undefined>,
  opts?: { symmetric?: boolean; paddingFrac?: number },
): { min: number; max: number } {
  let min = scale.min;
  let max = scale.max;
  let expanded = false;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (v < min) { min = v; expanded = true; }
    if (v > max) { max = v; expanded = true; }
  }
  if (!expanded) return { min: scale.min, max: scale.max };
  if (opts?.symmetric) {
    const bound = Math.max(Math.abs(min), Math.abs(max));
    min = -bound;
    max = bound;
  }
  const span = max - min;
  if (span <= 0) return { min, max };
  const pad = span * (opts?.paddingFrac ?? 0.08);
  return { min: min - pad, max: max + pad };
}

export interface MarkerLayoutInput {
  key: string;
  /** Raw (already scale-mapped, 0-100) marker position. */
  pct: number;
}

/** Minimum gap (in track %) between two marker CENTERS before they're
 *  considered "colliding" and nudged apart.
 *
 *  This is the WIDE-ELEMENT gap, used by `fairway/charts/StandingStrip`,
 *  whose colliding elements are not small chips: its "you" mark is a 16px
 *  dot inside a `ring-[3px]` (22px effective) and it carries a
 *  `whitespace-nowrap px-2.5` numeric pill plus a TEAM text label. Those
 *  need real clearance, so do NOT lower this — see BAR_MARKER_MIN_GAP_PCT
 *  below for the small-chip case. */
export const MARKER_MIN_GAP_PCT = 9;

/** Minimum gap for `StandingBar`'s `Bar`, whose markers are plain circular
 *  chips (`w-2`..`w-3.5`, i.e. 8-14px) with no attached label.
 *
 *  Sized from the actual geometry rather than picked by feel: the widest
 *  chip is `hero` at 14px and the narrowest rail it renders on is a card at
 *  a 390px viewport (~300px of track inside the card's padding) — 14/300 =
 *  4.7%, so 4.5% has two neighbouring circles just kissing and never
 *  overlapping.
 *
 *  Every excess point of gap beyond that is a point of positional LIE: it
 *  is spent displacing a marker away from the value it reports. Sharing the
 *  9% wide-element gap above cost the bar 7.2x exaggeration on Nick's 07-24
 *  round-review screenshot (a 2.5-point real spread drawn as 18 points). */
export const BAR_MARKER_MIN_GAP_PCT = 4.5;

/**
 * Nudge apart marker positions that land within `minGapPct` of one another,
 * left→right, preserving relative order — same collision-resolution idiom
 * `layoutTrackLabels` uses for its label row (forward min-gap pass, pull
 * the whole chain back if it overflows the right edge, backward pass to
 * settle a cluster wider than the safe zone, final hard clamp). Adapted
 * here for the marker glyphs themselves: Card's `Marker` draws a letter
 * ('T'/'●'/'P') INSIDE each circle, so two near-equal values (e.g. team
 * 0.70 vs player 0.81 on a 3-unit scale is ~3.7% apart) render as stacked,
 * unreadable overlapping circles, not just overlapping text.
 *
 * Pure data in/out — no DOM, fixture-testable.
 */
export function layoutMarkerPositions(
  items: ReadonlyArray<MarkerLayoutInput>,
  minGapPct: number = MARKER_MIN_GAP_PCT,
): MarkerLayoutInput[] {
  if (items.length <= 1) return items.map((i) => ({ key: i.key, pct: i.pct }));

  const ordered = items.map((i) => ({ key: i.key, pct: i.pct })).sort((a, b) => a.pct - b.pct);

  // Midpoint of the TRUE cluster, captured before any nudging.
  const rawMid = (ordered[0]!.pct + ordered[ordered.length - 1]!.pct) / 2;

  for (let i = 1; i < ordered.length; i++) {
    const min = ordered[i - 1]!.pct + minGapPct;
    if (ordered[i]!.pct < min) ordered[i]!.pct = min;
  }

  // Re-centre the spread chain on where the data actually sits.
  //
  // The forward pass above pins the LEFTMOST marker and pushes everyone else
  // right, so a tight cluster grew rightward off its true location: three
  // values 2.5% apart (You 65% / ref 66% / team 64%, the 07-24 screenshot)
  // came out spanning 80->98%, drifting the reference marker 15.5 points from
  // the value it reports and jamming it against the rail end. Order and the
  // min-gap are what stop circles overlapping; WHERE the resulting chain sits
  // is still free, so put its midpoint back on the real one. Same case now
  // drifts at most 3.3 points, and the group still reads at the right spot on
  // the rail. Markers that never collided are untouched by construction.
  const spreadMid = (ordered[0]!.pct + ordered[ordered.length - 1]!.pct) / 2;
  if (spreadMid !== rawMid) {
    for (const item of ordered) item.pct += rawMid - spreadMid;
  }

  const rightOverflow = ordered[ordered.length - 1]!.pct - 100;
  if (rightOverflow > 0) {
    for (const item of ordered) item.pct -= rightOverflow;
  }

  const leftOverflow = 0 - ordered[0]!.pct;
  if (leftOverflow > 0) {
    for (const item of ordered) item.pct += leftOverflow;
  }

  for (let i = ordered.length - 2; i >= 0; i--) {
    const max = ordered[i + 1]!.pct - minGapPct;
    if (ordered[i]!.pct > max) ordered[i]!.pct = max;
  }

  for (const item of ordered) item.pct = Math.max(0, Math.min(100, item.pct));

  return ordered;
}
