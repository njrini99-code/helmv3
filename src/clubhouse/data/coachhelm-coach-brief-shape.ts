import { TEAM_MARKER_MIN_N } from '@/components/golf/coachhelm/v3/StandingBar/types';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { MondayBrief, MondayBriefRound } from '@/lib/coachhelm/v3/monday-brief/brief';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { TeamPatternResult } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { toChMondayBrief, type ChBriefRow } from './coachhelm-monday-brief-shape';
import { figure, standingLabel } from './coachhelm-standing-shape';
import { toChTeamPatterns, type ChTeamPatterns } from './coachhelm-team-pattern';
import { COACH_TRACK_RECORD_HREF, type ChTrackRecord } from './coachhelm-track-record-shape';
import { plural } from '../lib/plural';

/**
 * The coach's Brief (Clubhouse P013, `?view=brief`, behind `coachhelm_monday_brief_v1`; CoachHelm par-05): the team view that
 * `/intelligence` and its old sub-links land on. It grows the Monday brief (supercharge 04 Layout 1) into one screen of five
 * sections, each drawn only when it has something in it: this week's open reads (one per player), the team pattern (Layout 4,
 * flag `coachhelm_team_pattern_v1`), what players are working on (focus areas with progress), how CoachHelm's reads have held
 * (the Track record's program line, flag `coachhelm_track_record_v1`) and each player's goals with their standing.
 *
 * Pure: the reads the loader made in, the screen's words out. Words and raw numbers, never a percent of confidence or a
 * priority word; a section whose read failed is named in `missing`, never drawn as empty.
 */

export const COACH_BRIEF_HREF = '/golf/dashboard/coachhelm?view=brief';
const BOARD = '/golf/dashboard/coachhelm';

/** The Brief's sections, in order. `?section=` (from an old /intelligence link) scrolls to one. */
export const BRIEF_SECTIONS = ['week', 'patterns', 'working', 'record', 'goals'] as const;
export type ChBriefSection = (typeof BRIEF_SECTIONS)[number];

export function isBriefSection(v: unknown): v is ChBriefSection {
  return typeof v === 'string' && (BRIEF_SECTIONS as readonly string[]).includes(v);
}

/** The DOM id of a section, so the screen and an old link agree on where it is. */
export const briefSectionId = (s: ChBriefSection) => `ch-hbr-${s}`;

/** The Brief's address, on one section. */
export function briefHref(section?: ChBriefSection | null): string {
  return section && section !== 'week' ? `${COACH_BRIEF_HREF}&section=${section}` : COACH_BRIEF_HREF;
}

/**
 * Where an old `/intelligence` address goes in Clubhouse (swap audit §14 D6). `?view=chat` is Ask; `?player=` opens the board on
 * that player, as it always has (a coach following a player link wants that player's read and Assign). With the Brief on, the rest
 * lands on the matching section: Signals' alerts and insights on this week's reads, Signals' patterns on the team pattern, Players
 * (the old Development plans) on what players are working on, Effectiveness on the track record, and anything else at the top.
 * With it off, every one of them is the board, as before (CH-13998).
 */
export function intelligenceTarget(q: URLSearchParams, briefOn: boolean, player: string | null): string {
  const view = q.get('view');
  if (view === 'chat' || player || !briefOn) {
    const next = new URLSearchParams();
    if (player) next.set('player', player);
    if (view === 'chat') next.set('view', 'ask');
    const query = next.toString();
    return query ? `${BOARD}?${query}` : BOARD;
  }
  if (view === 'signals') return briefHref(q.get('filter') === 'patterns' ? 'patterns' : 'week');
  if (view === 'players') return briefHref('working');
  if (view === 'effectiveness') return briefHref('record');
  return briefHref(null);
}

/** One focus area as the loader reads it (stable `golf_player_focus_areas` columns only). */
export interface BriefFocusRow {
  id: string;
  player_id: string;
  title: string | null;
  status: string | null;
  target_metric: string | null;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  target_rounds: number | null;
  started_at: string | null;
  created_at: string | null;
}

export interface ChBriefWorking {
  id: string;
  who: string;
  title: string;
  /** "Active" or "In progress". */
  word: string;
  /** "Now 58%, target 70%, from 52%"; null when the metric is not one CoachHelm measures or nothing is recorded. */
  line: string | null;
  /** "4 rounds since Oct 2" or "4 of 10 rounds since Oct 2"; null without a start day. */
  since: string | null;
  href: string;
}

export interface ChBriefGoal {
  id: string;
  title: string;
  /** "Now 61%, target 70%, by Nov 30". */
  line: string | null;
  /** "Team 64% · Tour 68%" on the goal's metric; null when there is no standing row or nothing comparable. */
  standing: string | null;
}

export interface ChBriefGoalPlayer {
  id: string;
  name: string;
  goals: ChBriefGoal[];
  href: string;
}

export interface ChCoachBrief {
  /** "9 players · 6 with enough rounds · 14 countable rounds last week". */
  team: string;
  /** "Week of Oct 12". */
  week: string;
  /** One read per player at Likely or above, most strokes first (the Monday brief's rows, the team pattern drawn in its own section). */
  reads: ChBriefRow[];
  counts: string;
  cleared: string[];
  outOfDate: string | null;
  /** Layout 4's rows; null with the flag off or nothing at or below the threshold. */
  patterns: ChTeamPatterns | null;
  working: ChBriefWorking[];
  /** The Track record's program line; null with the flag off, before its function is applied, or with nothing shown yet. */
  record: { program: string; href: string } | null;
  goals: ChBriefGoalPlayer[];
  /** Players on the roster with no active goal ("3 players have no active goal"); null when every player has one. */
  goalsNone: string | null;
  /** The sections whose read failed, in words; null when every read landed. */
  missing: string | null;
}

export interface CoachBriefInputs {
  /** The brief computed with every player's top read (`maxItems: Infinity`) and the first team pattern. */
  brief: MondayBrief;
  patterns: TeamPatternResult | null;
  roster: ReadonlyArray<{ id: string; name: string }>;
  rounds: readonly MondayBriefRound[];
  /** null: the focus-area read failed. */
  focus: readonly BriefFocusRow[] | null;
  /** null: the goals read failed. */
  goals: ReadonlyMap<string, readonly Goal[]> | null;
  /** null: the standing read failed (goals are still drawn, without it). */
  standing: ReadonlyMap<string, ReadonlyMap<string, PlayerStanding>> | null;
  /** null: off or nothing to say; 'failed': the read failed. */
  record: ChTrackRecord | null | 'failed';
}

const WORKING_WORD: Record<string, string> = { active: 'Active', in_progress: 'In progress' };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayOf(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return iso.slice(0, 10);
}

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A value in its metric's unit, or null when the id is not a metric CoachHelm measures. */
function valueOf(metric: string | null, v: number | null): string | null {
  if (!metric || v === null) return null;
  const cfg = getMetricRenderConfig(metric);
  return cfg ? figure(metric, cfg.unit, v) : null;
}

function progressLine(metric: string | null, now: number | null, target: number | null, from: number | null): string | null {
  const parts = [
    valueOf(metric, now) ? `Now ${valueOf(metric, now)}` : null,
    valueOf(metric, target) ? `target ${valueOf(metric, target)}` : null,
    valueOf(metric, from) ? `from ${valueOf(metric, from)}` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function sinceLine(f: BriefFocusRow, rounds: readonly MondayBriefRound[]): string | null {
  const start = dayOf(f.started_at) ?? dayOf(f.created_at);
  if (!start) return null;
  let n = 0;
  for (const r of rounds) if (r.player_id === f.player_id && r.day >= start) n += 1;
  const of = num(f.target_rounds);
  const counted = of !== null && of > 0 ? `${n} of ${plural(of, 'round')}` : plural(n, 'round');
  return `${counted} since ${shortDay(start)}`;
}

function workingOf(focus: readonly BriefFocusRow[], names: ReadonlyMap<string, string>, rounds: readonly MondayBriefRound[]): ChBriefWorking[] {
  return focus
    .filter((f) => f.status !== null && f.status in WORKING_WORD && names.has(f.player_id))
    .map((f) => ({
      row: f,
      view: {
        id: f.id,
        who: names.get(f.player_id) as string,
        title: f.title?.trim() || standingLabel(f.target_metric ?? '') || 'Focus area',
        word: WORKING_WORD[f.status as string] as string,
        line: progressLine(f.target_metric, num(f.current_value), num(f.target_value), num(f.baseline_value)),
        since: sinceLine(f, rounds),
        href: `${BOARD}?player=${encodeURIComponent(f.player_id)}`,
      },
    }))
    .sort((a, b) => a.view.who.localeCompare(b.view.who) || String(b.row.started_at ?? '').localeCompare(String(a.row.started_at ?? '')))
    .map((x) => x.view);
}

function standingWords(s: PlayerStanding | undefined): string | null {
  if (!s) return null;
  const cfg = getMetricRenderConfig(s.metric_id);
  if (!cfg) return null;
  const parts = [
    s.team_avg != null && s.team_n >= TEAM_MARKER_MIN_N ? `Team ${figure(s.metric_id, cfg.unit, s.team_avg)}` : null,
    !s.pga_omitted && Number.isFinite(s.pga_value) ? `${s.is_womens ? 'LPGA Tour' : 'Tour'} ${figure(s.metric_id, cfg.unit, s.pga_value)}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length ? parts.join(' · ') : null;
}

function goalLine(g: Goal): string | null {
  const parts = [
    valueOf(g.metric_id, num(g.current_value)) ? `Now ${valueOf(g.metric_id, num(g.current_value))}` : null,
    valueOf(g.metric_id, num(g.target_value)) ? `target ${valueOf(g.metric_id, num(g.target_value))}` : null,
    dayOf(g.ends_at) ? `by ${shortDay(dayOf(g.ends_at) as string)}` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function goalsOf(roster: CoachBriefInputs['roster'], goals: ReadonlyMap<string, readonly Goal[]>, standing: CoachBriefInputs['standing']): ChBriefGoalPlayer[] {
  const out: ChBriefGoalPlayer[] = [];
  for (const p of roster) {
    const list = (goals.get(p.id) ?? []).filter((g) => g.state === 'active' && g.player_id === p.id);
    if (list.length === 0) continue;
    out.push({
      id: p.id,
      name: p.name,
      href: `${BOARD}?player=${encodeURIComponent(p.id)}`,
      goals: list.map((g) => ({
        id: g.id,
        title: g.title?.trim() || standingLabel(g.metric_id) || 'Goal',
        line: goalLine(g),
        standing: standing ? standingWords(standing.get(p.id)?.get(g.metric_id)) : null,
      })),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function missingLine(parts: string[]): string | null {
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? (parts[0] as string) : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} did not load. The rest of the brief is current; try again in a moment.`;
}

export function toChCoachBrief(input: CoachBriefInputs): ChCoachBrief {
  const week = toChMondayBrief(input.brief);
  const names = new Map(input.roster.map((p) => [p.id, p.name]));
  const patterns = input.patterns ? toChTeamPatterns(input.patterns, names) : null;
  const record = input.record && input.record !== 'failed' && input.record.state === 'ready' && !input.record.empty ? { program: input.record.program, href: COACH_TRACK_RECORD_HREF } : null;
  const goals = input.goals ? goalsOf(input.roster, input.goals, input.standing) : [];
  const without = input.goals ? input.roster.length - goals.length : 0;
  const missing = [
    input.focus === null ? 'what players are working on' : null,
    input.record === 'failed' ? 'the track record' : null,
    input.goals === null ? 'goals' : input.standing === null && goals.length > 0 ? 'standing beside the goals' : null,
  ].filter((p): p is string => p !== null);
  return {
    team: week.team,
    week: week.week,
    reads: week.rows.filter((r) => r.kind === 'read'),
    counts: week.counts,
    cleared: week.cleared,
    outOfDate: week.outOfDate,
    patterns: patterns && (patterns.rows.length > 0 || patterns.below) ? patterns : null,
    working: input.focus ? workingOf(input.focus, names, input.rounds) : [],
    record,
    goals,
    goalsNone: goals.length > 0 && without > 0 ? `${plural(without, 'player')} ${without === 1 ? 'has' : 'have'} no active goal.` : null,
    missing: missingLine(missing),
  };
}
