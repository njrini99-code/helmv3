/**
 * ============================================================================
 * CoachHelm · program pulse — the deterministic status read
 * ----------------------------------------------------------------------------
 * What the Brief shows under the composer, and what the agent's opening
 * suggestions are derived from.
 *
 * Deterministic on purpose. No model runs here. Every item is a database read
 * turned into a sentence with a fixed template, so the same program state
 * always produces the same words — which is the only way a status line is worth
 * reading. A generated summary that phrases things differently on each refresh
 * teaches a coach to skim past it.
 *
 * The counts in the copy come from the query that produced the item. There is
 * no path in this file that writes a number into a sentence without having
 * counted it, which is the specific thing the interface must never do.
 *
 * Every item carries evidence (what it is based on) and, where one exists, an
 * action. An item a coach can see but not act on is a notification, not a
 * command center.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import type { CoachChatContext } from './context';

type Sb = SupabaseClient<Database>;

/** How urgently this wants the coach's attention. Drives ordering only. */
export type PulseTone = 'attention' | 'neutral' | 'positive';

export interface PulseItem {
  id: string;
  /** The finding, in one line. Never a bare count without its subject. */
  headline: string;
  /** What it is based on — the sentence a coach checks the claim against. */
  evidence: string;
  tone: PulseTone;
  /** Ordering weight. Higher surfaces first. */
  weight: number;
  /** Where to go. Omitted when there is genuinely nowhere useful. */
  action?: { label: string; href: string };
  /** A question this item makes worth asking, seeded into the composer. */
  ask?: string;
}

export interface ProgramPulse {
  items: PulseItem[];
  /** Most recent round anywhere on the team, or null. */
  latest_round_at: string | null;
  /** Roster members with no rounds at all — the honest coverage warning. */
  players_without_rounds: number;
  active_roster: number;
  /** When this read ran. */
  as_of: string;
}

const DAY = 86400_000;

/**
 * Run one read, and let it fail alone.
 *
 * Supabase's query builder is `PromiseLike`, not a Promise — `.then(...).catch(...)`
 * does not exist on it, which is a quiet way to end up with an unhandled
 * rejection that takes the whole surface down. `await`ing inside a real
 * try/catch is the version that actually degrades.
 */
async function safeRows<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await query;
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Read the program's current state.
 *
 * Individually degradable: one failing query must not blank the whole surface,
 * so each read is caught and simply contributes nothing. A pulse with four
 * items instead of five is a much better outcome than an error page, and the
 * missing item is not silently reported as "all clear" — items only ever assert
 * what was actually found.
 */
export async function getProgramPulse(sb: Sb, ctx: CoachChatContext): Promise<ProgramPulse> {
  const asOf = new Date().toISOString();
  const playerIds = ctx.roster.map((p) => p.id);
  const nameById = new Map(ctx.roster.map((p) => [p.id, p.name]));

  if (playerIds.length === 0) {
    return {
      items: [],
      latest_round_at: null,
      players_without_rounds: 0,
      active_roster: 0,
      as_of: asOf,
    };
  }

  const now = Date.now();
  const items: PulseItem[] = [];

  const [rounds, events, attendance, tasks, focus, signals] = await Promise.all([
    safeRows(
      sb
        .from('golf_rounds')
        .select('player_id, round_date, score_to_par')
        .in('player_id', playerIds)
        .eq('status', 'completed')
        .order('round_date', { ascending: false })
        .limit(400),
    ),
    safeRows(
      sb
        .from('golf_events')
        .select('id, title, start_time, event_type, requires_rsvp, status')
        .eq('team_id', ctx.team_id)
        .gte('start_time', new Date(now).toISOString())
        .lte('start_time', new Date(now + 14 * DAY).toISOString())
        .order('start_time', { ascending: true })
        .limit(30),
    ),
    safeRows(
      sb
        .from('golf_event_attendance')
        .select('event_id, player_id, status')
        .in('player_id', playerIds)
        .limit(1000),
    ),
    safeRows(
      sb
        .from('golf_tasks')
        .select('id, title, due_date, status')
        .eq('team_id', ctx.team_id)
        .neq('status', 'completed')
        .limit(100),
    ),
    safeRows(
      sb
        .from('golf_player_focus_areas')
        .select('id, player_id, title, status, updated_at')
        .in('player_id', playerIds)
        .eq('status', 'active')
        .limit(100),
    ),
    safeRows(
      applyInsightVisibility(
        sb
          .from('golf_coach_insights')
          .select('id, player_id, title, created_at')
          .in('player_id', playerIds),
      )
        .order('created_at', { ascending: false })
        .limit(50),
    ),
  ]);

  // ── Data freshness + coverage ───────────────────────────────────────────
  const latestRoundAt = rounds[0]?.round_date ?? null;
  const withRounds = new Set(rounds.map((r) => r.player_id));
  const withoutRounds = ctx.roster.filter((p) => !withRounds.has(p.id));

  if (withoutRounds.length > 0) {
    items.push({
      id: 'coverage-no-rounds',
      headline:
        withoutRounds.length === 1
          ? `${withoutRounds[0]!.name} has no recorded rounds`
          : `${withoutRounds.length} players have no recorded rounds`,
      evidence:
        withoutRounds.length <= 4
          ? withoutRounds.map((p) => p.name).join(', ')
          : `${withoutRounds
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ')} and ${withoutRounds.length - 3} more`,
      tone: 'attention',
      weight: 55,
      action: { label: 'Open roster', href: '/golf/dashboard/roster' },
    });
  }

  if (latestRoundAt) {
    const days = Math.floor((now - new Date(latestRoundAt).getTime()) / DAY);
    if (days >= 7) {
      items.push({
        id: 'coverage-stale',
        headline: `No rounds recorded in ${days} days`,
        evidence: `The most recent round anywhere on the team was ${formatDate(latestRoundAt)}.`,
        tone: 'attention',
        weight: 60,
      });
    }
  }

  // ── Performance movement — measured, not asserted ───────────────────────
  // Compares each player's last three recorded rounds against the three before,
  // and only speaks when the team-wide direction is consistent. A one-player
  // swing is not "the team is declining".
  const byPlayer = new Map<string, { date: string; toPar: number }[]>();
  for (const r of rounds) {
    if (typeof r.score_to_par !== 'number') continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push({ date: r.round_date, toPar: r.score_to_par });
    byPlayer.set(r.player_id, list);
  }

  let improved = 0;
  let declined = 0;
  const movers: { name: string; delta: number }[] = [];
  for (const [pid, list] of byPlayer) {
    if (list.length < 6) continue;
    const recent = list.slice(0, 3).reduce((a, b) => a + b.toPar, 0) / 3;
    const prior = list.slice(3, 6).reduce((a, b) => a + b.toPar, 0) / 3;
    const delta = recent - prior;
    if (Math.abs(delta) < 1) continue;
    if (delta < 0) improved += 1;
    else declined += 1;
    movers.push({ name: nameById.get(pid) ?? 'Player', delta });
  }

  if (declined >= 2 && declined > improved) {
    const worst = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta);
    items.push({
      id: 'movement-decline',
      headline: `${declined} players are scoring higher than their previous three rounds`,
      evidence: worst
        .slice(0, 3)
        .map((m) => `${m.name} +${m.delta.toFixed(1)}`)
        .join(' · '),
      tone: 'attention',
      weight: 80,
      ask: `Which players have lost the most ground over their last three rounds, and where?`,
    });
  } else if (improved >= 2 && improved > declined) {
    const best = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta);
    items.push({
      id: 'movement-improve',
      headline: `${improved} players are scoring lower than their previous three rounds`,
      evidence: best
        .slice(0, 3)
        .map((m) => `${m.name} ${m.delta.toFixed(1)}`)
        .join(' · '),
      tone: 'positive',
      weight: 40,
    });
  }

  // ── Signals ─────────────────────────────────────────────────────────────
  if (signals.length > 0) {
    const players = new Set(signals.map((s) => s.player_id).filter(Boolean));
    items.push({
      id: 'signals-open',
      headline: `${signals.length} open signal${signals.length === 1 ? '' : 's'} across ${players.size} player${players.size === 1 ? '' : 's'}`,
      evidence: signals
        .slice(0, 2)
        .map((s) => s.title)
        .join(' · '),
      tone: 'neutral',
      weight: 70,
      action: { label: 'Review signals', href: '/golf/dashboard/intelligence?view=signals' },
    });
  }

  // ── RSVPs ───────────────────────────────────────────────────────────────
  const liveEvents = events.filter((e) => e.status !== 'cancelled' && e.requires_rsvp);
  for (const event of liveEvents.slice(0, 3)) {
    const forEvent = attendance.filter((a) => a.event_id === event.id);
    const pending = forEvent.filter((a) => a.status !== 'accepted' && a.status !== 'declined');
    if (pending.length === 0) continue;
    items.push({
      id: `rsvp-${event.id}`,
      headline: `${pending.length} player${pending.length === 1 ? ' has' : 's have'} not responded for ${event.title}`,
      evidence: `${formatDateTime(event.start_time, ctx.timezone)} · ${forEvent.length - pending.length} of ${forEvent.length} responded`,
      tone: 'attention',
      weight: 85,
      action: { label: 'Open calendar', href: '/golf/dashboard/calendar' },
      ask: `Send an RSVP reminder for ${event.title}`,
    });
  }

  // ── Events with no preparation ──────────────────────────────────────────
  const nextCompetition = events.find(
    (e) => e.status !== 'cancelled' && (e.event_type === 'tournament' || e.event_type === 'match'),
  );
  if (nextCompetition) {
    const practicesBefore = events.filter(
      (e) =>
        e.event_type === 'practice' &&
        new Date(e.start_time).getTime() < new Date(nextCompetition.start_time).getTime(),
    );
    if (practicesBefore.length === 0) {
      items.push({
        id: 'prep-gap',
        headline: `No practice scheduled before ${nextCompetition.title}`,
        evidence: `${formatDateTime(nextCompetition.start_time, ctx.timezone)}, with nothing on the calendar in between.`,
        tone: 'attention',
        weight: 75,
        ask: `Create a practice before ${nextCompetition.title}`,
      });
    }
  }

  // ── Stalled focus areas ─────────────────────────────────────────────────
  const stalled = focus.filter(
    (f) => f.updated_at && now - new Date(f.updated_at).getTime() > 21 * DAY,
  );
  if (stalled.length > 0) {
    items.push({
      id: 'focus-stalled',
      headline: `${stalled.length} active focus area${stalled.length === 1 ? '' : 's'} ${stalled.length === 1 ? 'has' : 'have'} no recent progress`,
      evidence: stalled
        .slice(0, 3)
        .map((f) => `${nameById.get(f.player_id) ?? 'Player'} — ${f.title}`)
        .join(' · '),
      tone: 'attention',
      weight: 65,
      action: { label: 'Open development', href: '/golf/dashboard/intelligence?view=players' },
    });
  }

  // ── Overdue tasks ───────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < today);
  if (overdue.length > 0) {
    items.push({
      id: 'tasks-overdue',
      headline: `${overdue.length} task${overdue.length === 1 ? ' is' : 's are'} overdue`,
      evidence: overdue
        .slice(0, 3)
        .map((t) => t.title)
        .join(' · '),
      tone: 'attention',
      weight: 50,
      action: { label: 'Open tasks', href: '/golf/dashboard/tasks' },
    });
  }

  items.sort((a, b) => b.weight - a.weight);

  return {
    items,
    latest_round_at: latestRoundAt,
    players_without_rounds: withoutRounds.length,
    active_roster: ctx.roster.length,
    as_of: asOf,
  };
}

/**
 * Opening suggestions, derived from the pulse.
 *
 * Bounded at five and drawn from what is actually true of this program right
 * now. Hardcoded prompts ("Compare two players on lag putting") are worse than
 * useless on a team with three rounds recorded: they advertise capability the
 * data cannot support, and the first answer is a disappointment.
 */
export function suggestionsFromPulse(pulse: ProgramPulse, teamName: string): string[] {
  const out: string[] = [];
  for (const item of pulse.items) {
    if (item.ask) out.push(item.ask);
    if (out.length >= 3) break;
  }
  if (pulse.active_roster > 0 && pulse.players_without_rounds < pulse.active_roster) {
    out.push(`Brief me on ${teamName}`);
    out.push('Where is the team losing the most strokes?');
  }
  return [...new Set(out)].slice(0, 5);
}

/**
 * The openers that are NOT tied to a specific finding.
 *
 * `suggestionsFromPulse` mixes these with the items' own asks, which is right
 * for the drawer — a flat list of pills is all it has room for. The full Ask
 * page renders the findings themselves, so it needs the generic openers
 * separately or the same question appears twice: once as a bare pill and once
 * as the ask on the row that prompted it.
 *
 * Gated on the same coverage rule as the mixed list: offering "Where is the
 * team losing the most strokes?" to a program with no recorded rounds
 * advertises an answer that does not exist.
 */
export function generalOpeners(pulse: ProgramPulse, teamName: string): string[] {
  if (pulse.active_roster === 0 || pulse.players_without_rounds >= pulse.active_roster) return [];
  return [`Brief me on ${teamName}`, 'Where is the team losing the most strokes?'];
}

/**
 * The coverage sentence, or null when there is nothing honest to say.
 *
 * Stated as what IS recorded rather than what is missing. "2 players have no
 * rounds" reads as a fault list; "6 of 8 players have recorded rounds" is the
 * same fact as the denominator on every number above it, which is what the
 * coach is actually being asked to weigh.
 */
export function coverageLine(pulse: ProgramPulse): string | null {
  if (pulse.active_roster === 0) return null;
  const withRounds = pulse.active_roster - pulse.players_without_rounds;
  if (withRounds === pulse.active_roster) {
    return `All ${pulse.active_roster} players have recorded rounds.`;
  }
  return `${withRounds} of ${pulse.active_roster} players have recorded rounds — answers cover those ${withRounds}.`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00Z`),
  );
}

function formatDateTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}
