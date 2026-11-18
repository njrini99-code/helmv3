/**
 * CoachHelm reads: what a player may see of their own read.
 *
 * The same rule as the fact sheet's `withoutCoachOnly`: every `coach_only` block is removed, with every figure built
 * from teammates. A player's card is served by a server read that calls this (never by an RLS policy that would expose
 * the row with its team block). Pure.
 */
import type { ReadPayload } from './types';

/** Figure names that carry a teammate's number. */
const TEAM_FIGURES = /^(team_|teammates)/;

/** Removes every coach-only block, at any depth, and every figure built from teammates. */
export function stripCoachOnly<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => !isCoachOnly(v)).map(stripCoachOnly) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isCoachOnly(v)) out[k] = null;
      else out[k] = stripCoachOnly(v);
    }
    return out as T;
  }
  return value;
}

function isCoachOnly(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as { audience?: unknown }).audience === 'coach_only';
}

const ownFigures = (figures: Record<string, string>) => Object.fromEntries(Object.entries(figures).filter(([k]) => !TEAM_FIGURES.test(k)));

/**
 * The player's own read. Besides the coach-only blocks and teammates' figures, three things never reach a player: the
 * coach's "not useful" or "wrong" and its reason (`memory.suppressed`; a read the coach marked down is not shown, see
 * `isSuppressed`), the focus verdict (`focus`: its "expected without the focus" is shrunk toward the team's middle, a
 * teammate figure), and the coach's paragraph. "How we found this" is the player's version ("your four parts").
 */
export function forPlayer(payload: ReadPayload): ReadPayload {
  const stripped = stripCoachOnly(payload);
  const { written: _coachText, written_player: playerText, focus: _focus, memory, priority, ...rest } = stripped;
  return {
    ...rest,
    priority: priority ? playerPriority(priority) : null,
    // The player reads their own paragraph, never the coach's.
    ...(playerText ? { written: playerText } : {}),
    ...(memory ? { memory: { ...memory, suppressed: null, history: [] } } : {}),
    figures: ownFigures(stripped.figures),
    ...(stripped.parts ? { parts: stripped.parts.map((p) => ({ ...p, figures: ownFigures(p.figures) })) } : {}),
  };
}

function playerPriority(c: NonNullable<ReadPayload['priority']>): NonNullable<ReadPayload['priority']> {
  const { player_how_we_found: mine, ...rest } = c;
  return { ...rest, team: null, how_we_found: mine ?? c.how_we_found };
}

/** The coach marked this read "not useful" or "wrong" and nothing material changed: the player is shown no read at all. */
export const isSuppressed = (payload: ReadPayload): boolean => !!payload.memory?.suppressed;
