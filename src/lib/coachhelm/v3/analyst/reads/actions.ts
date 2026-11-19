import 'server-only';
/**
 * CoachHelm reads: what a coach does with a card (the "a coach acts on it" step of COACHHELM_2_TO_10.md section 6).
 *
 * Set focus from this card, Not useful, Wrong (with a reason). Each writes one append-only row (held migration
 * 20261117121000) with the coach's own session, so RLS decides: a coach of the team, inserting as themselves.
 *
 * Nothing about the card is taken from the client but the intent: the player, the card key the coach saw, and a
 * one-time id. The numbers stored with the row (the loss on the day, how sure, the part, the teammates' middle) come
 * from the saved current read, read here under RLS, and the action refuses when the card the coach saw is no longer the
 * current one. The id makes the write idempotent: a second tap or a Retry sends the same id, and the row is written once.
 *
 * The 'use server' wrapper (src/app/golf/actions/coachhelm-reads.ts) resolves the coach, the team and the team's zone
 * from the session and calls these. Never throws: every outcome is a result.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/utils/uuid';
import { dayIn } from '../rounds';
import { readsEnabled } from './flag';
import { focusJustSet } from './focus';
import { FEEDBACK_TABLE, FOCUS_TABLE, insertReadAction, loadCurrentReads } from './store';
import type { CoachVerdict } from './memory';

export interface ReadActionScope {
  sb: SupabaseClient;
  coachId: string;
  teamId: string;
  /** The team's time zone: the focus's day is the coach's day, not UTC's. */
  zone: string;
  now?: Date;
  /** Tests pass the switch; production reads the flag and the team list. */
  enabled?: boolean;
}

export type ReadActionResult<T> = { success: true; data: T } | { success: false; error: string };

export const REASON_MAX = 500;
/** "Not useful" needs no reason from the coach; the row keeps this one. */
export const NOT_USEFUL_DEFAULT_REASON = 'Not useful';

const ERR = {
  off: 'CoachHelm reads are off for this team.',
  input: 'That card could not be read. Reload the page and try again.',
  member: 'That player is not on this team.',
  stale: 'This read changed since the page loaded. Reload to see the new one.',
  noReason: 'Say what is wrong, in a few words.',
  long: `Keep the reason under ${REASON_MAX} characters.`,
  held: 'CoachHelm reads are not set up yet.',
  failed: 'It was not saved. Try again.',
} as const;

/** The player's current card under RLS, or why there is none to act on. */
async function currentCard(scope: ReadActionScope, playerId: string, cardKey: string) {
  const member = await scope.sb.from('golf_team_members').select('player_id').eq('team_id', scope.teamId).eq('player_id', playerId).eq('status', 'active').maybeSingle();
  if (member.error) return { error: ERR.failed } as const;
  if (!member.data) return { error: ERR.member } as const;
  const res = await loadCurrentReads(scope.sb, scope.teamId, [playerId]);
  if (res.status === 'held') return { error: ERR.held } as const;
  if (res.status === 'failed') return { error: ERR.failed } as const;
  const card = res.data.get(playerId)?.payload.priority;
  if (!card || card.key !== cardKey) return { error: ERR.stale } as const;
  return { card } as const;
}

function guard(scope: ReadActionScope, input: { id: unknown; playerId: unknown; cardKey: unknown }): string | null {
  if (!(scope.enabled ?? readsEnabled(scope.teamId))) return ERR.off;
  if (!isUuid(input.id) || !isUuid(input.playerId) || typeof input.cardKey !== 'string' || !input.cardKey.startsWith('priority:')) return ERR.input;
  return null;
}

/** The line the card shows once the focus is set, until the next saved read counts the rounds since. */
export interface FocusSet {
  setOn: string;
  since: string;
  word: string;
}

export async function setFocusFromRead(scope: ReadActionScope, input: { id: string; playerId: string; cardKey: string }): Promise<ReadActionResult<FocusSet>> {
  const bad = guard(scope, input);
  if (bad) return { success: false, error: bad };
  const got = await currentCard(scope, input.playerId, input.cardKey);
  if ('error' in got) return { success: false, error: got.error as string };
  const { card } = got;
  const link = {
    card_key: card.key,
    part: card.area,
    set_on: dayIn(scope.now ?? new Date(), scope.zone),
    value_on_day: card.numbers.lost_per_round,
    rounds_on_day: card.numbers.rounds,
    team_lost_on_day: card.team?.value.part_team_lost ?? null,
  };
  const res = await insertReadAction(scope.sb, FOCUS_TABLE, { id: input.id, team_id: scope.teamId, player_id: input.playerId, coach_id: scope.coachId, focus_area_id: null, ...link });
  if (res.status !== 'ok') return { success: false, error: res.status === 'held' ? ERR.held : ERR.failed };
  const read = focusJustSet(link);
  return { success: true, data: { setOn: link.set_on, since: read.since_text, word: read.word_text } };
}

export interface FeedbackSaved {
  verdict: CoachVerdict;
  reason: string;
}

export async function markRead(scope: ReadActionScope, input: { id: string; playerId: string; cardKey: string; verdict: CoachVerdict; reason?: string | null }): Promise<ReadActionResult<FeedbackSaved>> {
  const bad = guard(scope, input);
  if (bad) return { success: false, error: bad };
  if (input.verdict !== 'not_useful' && input.verdict !== 'wrong') return { success: false, error: ERR.input };
  const given = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (input.verdict === 'wrong' && !given) return { success: false, error: ERR.noReason };
  if (given.length > REASON_MAX) return { success: false, error: ERR.long };
  const reason = given || NOT_USEFUL_DEFAULT_REASON;
  const got = await currentCard(scope, input.playerId, input.cardKey);
  if ('error' in got) return { success: false, error: got.error as string };
  const { card } = got;
  const res = await insertReadAction(scope.sb, FEEDBACK_TABLE, {
    id: input.id,
    team_id: scope.teamId,
    player_id: input.playerId,
    coach_id: scope.coachId,
    card_key: card.key,
    verdict: input.verdict,
    reason,
    lost_per_round: card.numbers.lost_per_round,
    certainty: card.certainty,
    area: card.area,
  });
  if (res.status !== 'ok') return { success: false, error: res.status === 'held' ? ERR.held : ERR.failed };
  return { success: true, data: { verdict: input.verdict, reason } };
}
