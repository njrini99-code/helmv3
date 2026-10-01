import type { PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';

/**
 * CoachHelm's data shapes (Clubhouse P013) and the steps the screens share,
 * kept apart from the server loader (data/coachhelm.ts) and from the mapper
 * that turns generator output into these shapes (data/coachhelm-map.ts), so
 * the client screens, the preview and the tests all use the code the page does.
 *
 * Nothing here is computed from a model or invented: every field is a real
 * column or generator output (`golf_coach_insights.evidence`, the program
 * pulse), read by the existing delivery actions and only re-shaped.
 */

/** The three priorities the board draws. The database's `urgent` is `high` here. */
export type ChHelmPri = 'high' | 'medium' | 'low';

/** The visible lifecycle states (`applyInsightVisibility`); `reactivateInsight` restores to one of them. */
export type ChHelmLifecycle = 'detected' | 'matured' | 'addressed' | 'resolved';

/** A focus area already made from this insight (`golf_player_focus_areas.from_insight_id`). */
export type ChHelmAssigned = 'proposed' | 'active';

/**
 * What a card says (data/coachhelm-classify.ts): a `finding` to close, a `strength` that is working, or a `note`, which states no
 * finding at all (the generators looked and found nothing to fix, or the card describes a standing). A note is never assigned,
 * never counted as a signal and never drawn with a number it does not stand behind.
 */
export type ChKind = 'finding' | 'strength' | 'note';

/** A read older than the player's newest completed round: the day of that round, as the card says it ("Sep 30"). */
export interface ChStale {
  newestRound: string;
}

export interface ChHelmBar {
  label: string;
  /** 0 to 100. */
  pct: number;
  /** The side the finding is about, drawn amber. */
  weak: boolean;
}

export interface ChHelmGauge {
  /** 0 to 100 positions on the track. */
  youPct: number;
  cmpPct: number;
  secPct: number | null;
  /** "23 pts" (the generator's own display). */
  you: string;
  /** "Tour 0.3" in place of a college comparison (Q-88: the Tour is the only benchmark); any other comparison keeps the generator's own label ("Your right-to-left make % (same band) 51%"). */
  cmp: string;
  /** "PGA Tour avg 0.3", when the generator carries a Tour tick beside a comparison that is not a college one. */
  sec: string | null;
  /**
   * The insight's stance, drawn green: a strength. Every other insight is a
   * finding to close, drawn amber whichever side of the comparison the number
   * is on (the board colours by stance; the metric's direction only decides
   * whether the insight counts as a strength).
   */
  good: boolean;
  /** The track starts at zero, so the fill is a real magnitude; otherwise only the ticks show. */
  fromZero: boolean;
}

/**
 * The Tour an insight is graded against (Q-88: the Tour is the only benchmark, never a college one): the team's own tour, and
 * `golf_pga_standards.pga_tour_value` for each metric (the LPGA value on an LPGA row, so a women's team is never graded against
 * the men's). A metric the tour has no value for is not in `values`, and its college comparison is not drawn.
 */
export interface ChTourBaseline {
  tour: 'pga' | 'lpga';
  values: ReadonlyMap<string, number>;
}

/** How the gauge names the Tour's tick. */
export const TOUR_LABEL: Record<ChTourBaseline['tour'], string> = { pga: 'Tour', lpga: 'LPGA Tour' };

export interface ChHelmEvidence {
  /** "Downhill penalty vs level putts (distance-controlled)". */
  label: string;
  bars: ChHelmBar[] | null;
  gauge: ChHelmGauge | null;
  /** "75 putts", "21 rounds". */
  sample: string;
  /** "90 days", "All rounds"; null when the generator gave no window. */
  window: string | null;
  /** The confidence read: a level of three and its word (the canonical Solid, Early and Thin read, `lib/coachhelm/confidence-label.ts`); null when the evidence has none. */
  read: { level: 1 | 2 | 3; word: string } | null;
  /** "As of Sep 30": the day the read was last refreshed, else the day its window ended; null when the row says neither. */
  asOf: string | null;
}

export interface ChHelmWeek {
  /** The attached drill's name; null when the text is the insight's own recommended action. */
  title: string | null;
  text: string | null;
  /** "12 min · intermediate". */
  meta: string | null;
}

export interface ChInsight {
  id: string;
  playerId: string;
  /** "Putting", "Course management". */
  category: string;
  priority: ChHelmPri;
  /** What is working: better than the comparison the card draws, at low priority or encouraging, or a resolved insight. */
  strength: boolean;
  /** Finding, strength (`strength` above) or note. */
  kind: ChKind;
  /** Older than the player's newest completed round: drawn as out of date, never as current, and not counted as an open signal. */
  stale: ChStale | null;
  /** The coach already acknowledged it (`golf_coach_insights.status`), so it is not a fresh Priority. */
  acknowledged: boolean;
  title: string;
  /**
   * What a focus area made from this insight is saved with: the insight's own title, and its first sentence in the player's voice.
   * The focus area is the player's to read, so it never carries the coach's board's rewrite of the text ("Jonah is making").
   */
  assignAs: { title: string; description: string };
  /** The first sentence of the insight's own text. */
  lede: string;
  /** The rest of the text ("Why we think this"); null when there is none. */
  why: string | null;
  /** The generator's display of the headline number ("23 pts", "1.1"). */
  value: string;
  evidence: ChHelmEvidence;
  week: ChHelmWeek | null;
  lifecycle: ChHelmLifecycle;
  /** The evidence's metric id, the focus area's target metric when assigned. */
  metric: string;
  /** The focus-area type the category maps to. */
  areaType: string;
  assigned: ChHelmAssigned | null;
}

/** A focus area a coach proposed, waiting for this player to accept or decline it (`golf_player_focus_areas.status = 'proposed'`; Q-77). */
export interface ChProposal {
  id: string;
  title: string;
  /** The title of the insight it was made from, when that insight is on this page. */
  from: string | null;
}

export interface ChPlayerHelm {
  /** CoachHelm is turned off for this player: the coach's reason when there is one. Nothing else is read. */
  off: { reason: string | null } | null;
  /** The focus areas proposed to this player on their team. `error`: the read failed, never "nothing proposed". */
  proposals: { list: ChProposal[]; error: boolean };
  /** Ranked and deduplicated as the feed does (`getInsightsForPlayer`). `error`: the read failed, never "no insights". */
  insights: { list: ChInsight[]; error: boolean };
  /** Countable rounds posted, read only when there are no insights, so the empty state can say what to do; null when unknown. */
  rounds: number | null;
}

export type ChPulseIcon = 'calendar-x' | 'trending-up' | 'trending-down' | 'rsvp' | 'practice' | 'focus' | 'tasks' | 'roster' | 'flag';
export type ChPulseTone = 'warn' | 'soft' | 'good';

export interface ChPulseRow {
  id: string;
  headline: string;
  evidence: string;
  tone: ChPulseTone;
  icon: ChPulseIcon;
}

export interface ChCoachPlayer {
  id: string;
  name: string;
  /** Open signals: the player's visible insights after the feed's dedupe that are findings and current. A strength, a note and a stale read are not open signals; 0 when the top card is one of those. */
  count: number;
  /** The player's top-ranked insight: the row's line and the focus card. */
  top: ChInsight;
}

export interface ChCoachHelmData {
  /** CoachHelm is turned off for this coach or team. Nothing else is read. */
  off: { by: 'user' | 'team' | 'global'; reason: string | null } | null;
  /** The team's active players. `error`: the roster read failed, never an empty team. */
  roster: { count: number; error: boolean };
  pulse: { rows: ChPulseRow[]; error: boolean };
  /** Players with at least one signal, most pressing first. */
  players: { list: ChCoachPlayer[]; error: boolean };
  /** Roster players with no insight yet. */
  withoutSignals: number;
}

/** Rows in the "Also worth knowing" list and in "Working". */
export const ALSO_MAX = 5;
export const WORKING_MAX = 5;
/** Rows in the program pulse (two columns of three). */
export const PULSE_MAX = 6;

export const PRI_LABEL: Record<ChHelmPri, string> = { high: 'Priority', medium: 'Worth closing', low: 'Minor' };

/** The pill a card wears: a class (colour is never the only carrier) and its word. */
export interface ChStance {
  cls: ChHelmPri | 'ok' | 'note' | 'stale' | 'done';
  word: string;
}

/**
 * Where a card stands. An out-of-date read says so first, then a note, then a strength (Working); a finding a focus area was already
 * made from, or the coach acknowledged, reads Assigned or Acknowledged, never as a fresh Priority; any other finding wears its priority.
 * `assigned` is the focus area made from it, from the board's own state (an assignment made in this visit) over what the page loaded.
 */
export function stanceOf(ins: ChInsight, assigned: ChHelmAssigned | null = ins.assigned): ChStance {
  if (ins.stale) return { cls: 'stale', word: 'Out of date' };
  if (ins.kind === 'note') return { cls: 'note', word: 'Note' };
  if (ins.kind === 'strength') return { cls: 'ok', word: 'Working' };
  if (assigned) return { cls: 'done', word: 'Assigned' };
  if (ins.acknowledged) return { cls: 'done', word: 'Acknowledged' };
  return { cls: ins.priority, word: PRI_LABEL[ins.priority] };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const PRI_WEIGHT: Record<ChHelmPri, number> = { high: 3, medium: 2, low: 1 };

/**
 * The focus, the rest to look at, and what is working. The focus is the one the
 * viewer picked or, without a pick, the top-ranked insight that is not a
 * strength (the feed's own order). The picked one leaves both lists.
 */
export function partitionInsights(list: readonly ChInsight[], pickedId?: string | null): { focus: ChInsight | null; also: ChInsight[]; working: ChInsight[] } {
  // A note states no finding, so it is neither the focus nor a row in either list.
  const drawn = list.filter((i) => i.kind !== 'note');
  const picked = pickedId ? drawn.find((i) => i.id === pickedId) : undefined;
  // A read that is out of date does not lead while a current finding exists; the feed's own order decides within each.
  const findings = drawn.filter((i) => i.kind === 'finding');
  const focus = picked ?? findings.find((i) => !i.stale) ?? findings[0] ?? null;
  const rest = drawn.filter((i) => i.id !== focus?.id);
  const also = [...rest.filter((i) => i.kind === 'finding' && !i.stale), ...rest.filter((i) => i.kind === 'finding' && i.stale)];
  return { focus, also: also.slice(0, ALSO_MAX), working: rest.filter((i) => i.kind === 'strength').slice(0, WORKING_MAX) };
}

/** Most pressing first: the top insight's priority (an out-of-date read or a strength after it, a note last), then how many signals, then the name. */
export function sortCoachPlayers(list: readonly ChCoachPlayer[]): ChCoachPlayer[] {
  const weight = (p: ChCoachPlayer) => (p.top.kind === 'note' ? -1 : p.top.kind === 'strength' || p.top.stale ? 0 : PRI_WEIGHT[p.top.priority]);
  return [...list].sort((a, b) => weight(b) - weight(a) || b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * "4 players have an open signal." The board draws one card per player, so it counts players, never the rows behind them
 * ("77 open signals across 7 players" counted rows the board never draws). A player has one when a finding of theirs is open
 * (`ChCoachPlayer.count`): a strength, a note and a read that is out of date are not findings.
 */
export function playersLine(players: number): string {
  if (players <= 0) return 'No open signals.';
  return `${players} ${players === 1 ? 'player has' : 'players have'} an open signal.`;
}

const PULSE_ICON: Array<[RegExp, ChPulseIcon]> = [
  [/^coverage-no-rounds$/, 'roster'],
  [/^coverage-stale$/, 'calendar-x'],
  [/^movement-decline$/, 'trending-up'],
  [/^movement-improve$/, 'trending-down'],
  [/^rsvp-/, 'rsvp'],
  [/^prep-gap$/, 'practice'],
  [/^focus-stalled$/, 'focus'],
  [/^tasks-overdue$/, 'tasks'],
];

/**
 * The program pulse as the board draws it (getProgramPulse's own headline and
 * evidence line, in its own order). The signals item is left out: the page's
 * subtitle says the same count. A higher score is worse, so "scoring higher"
 * wears the rising arrow and amber, "scoring lower" the falling arrow and green.
 */
export function pulseRows(items: readonly Pick<PulseItem, 'id' | 'headline' | 'evidence' | 'tone'>[]): ChPulseRow[] {
  return items
    .filter((i) => i.id !== 'signals-open')
    .slice(0, PULSE_MAX)
    .map((i) => ({
      id: i.id,
      headline: i.headline,
      evidence: i.evidence,
      tone: i.tone === 'attention' ? 'warn' : i.tone === 'positive' ? 'good' : 'soft',
      icon: PULSE_ICON.find(([re]) => re.test(i.id))?.[1] ?? 'flag',
    }));
}
