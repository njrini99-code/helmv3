/**
 * P-5: what each refusal the tournament RPCs and the round guard raise says. The four tournament actions
 * (app/golf/actions/tournaments.ts) return the refusal as `code` beside this copy, so a caller (P-4's move-write.ts,
 * round mode, the cancel dialogs) branches on the code and never on the words. The Clubhouse gives each string its
 * catalog number (screens/tournaments/fields/refusals.ts): one code per string (changelog should 16).
 */
export type TournamentRefusal =
  | 'stale'
  | 'already_tracked'
  | 'event_is_series'
  | 'event_cancelled'
  | 'event_not_found'
  | 'round_order'
  | 'round_count'
  | 'bad_name'
  | 'round_started'
  | 'round_has_scores'
  | 'tournament_official'
  | 'qualifier_not_found'
  | 'qualifier_linked'
  | 'trip_not_found'
  | 'entries_unavailable'
  | 'round_type_locked'
  | 'round_fields_locked'
  | 'round_team_locked'
  | 'round_series_locked'
  | 'request_conflict'
  | 'not_coach'
  | 'not_found'
  | 'bad_input'
  | 'flag_off'
  | 'failed';

export const TOURNAMENT_REFUSALS: readonly TournamentRefusal[] = [
  'stale',
  'already_tracked',
  'event_is_series',
  'event_cancelled',
  'event_not_found',
  'round_order',
  'round_count',
  'bad_name',
  'round_started',
  'round_has_scores',
  'tournament_official',
  'qualifier_not_found',
  'qualifier_linked',
  'trip_not_found',
  'entries_unavailable',
  'round_type_locked',
  'round_fields_locked',
  'round_team_locked',
  'round_series_locked',
  'request_conflict',
  'not_coach',
  'not_found',
  'bad_input',
];

/** The refusal a Postgres error carries: its message is the raised name (or 42501 / 23505). Anything else is `failed`. */
export function refusalOf(err: { code?: string; message?: string } | null | undefined): TournamentRefusal {
  if (!err) return 'failed';
  const msg = (err.message ?? '').trim();
  if ((TOURNAMENT_REFUSALS as readonly string[]).includes(msg)) return msg as TournamentRefusal;
  if (err.code === '42501') return 'not_coach';
  if (err.code === '23505') return 'request_conflict';
  return 'failed';
}

export type RefusalKey =
  | 'stale'
  | 'already_tracked'
  | 'event_is_series'
  | 'event_cancelled'
  | 'event_not_found'
  | 'restore_order'
  | 'round_order'
  | 'round_count'
  | 'bad_name'
  | 'round_started'
  | 'round_has_scores'
  | 'tournament_official'
  | 'qualifier_not_found'
  | 'qualifier_linked'
  | 'trip_not_found'
  | 'entries_unavailable'
  | 'round_locked'
  | 'not_coach'
  | 'round_failed'
  | 'change_failed'
  | 'create_failed';

export interface RefusalCopy {
  /** Which string this is, for the Clubhouse's catalog number. */
  key: RefusalKey;
  text: string;
}

/**
 * The words for a refusal. `round` names the round in the copy ("R2"); `name` the tournament; `before` the round a
 * move or restore would jump ahead of. Without them the copy stays general.
 */
export function refusalCopy(r: TournamentRefusal, ctx: { round?: number | null; name?: string | null; before?: number | null; after?: number | null; save?: 'create' | 'round' | 'cancel' | 'untrack' } = {}): RefusalCopy {
  const rn = ctx.round ? `R${ctx.round}` : 'This round';
  const tn = ctx.name?.trim() || 'the tournament';
  switch (r) {
    case 'stale':
      return { key: 'stale', text: 'This tournament changed since you opened it. Reload to see the latest.' };
    case 'already_tracked':
      return { key: 'already_tracked', text: 'This event is already set up in Tournaments.' };
    case 'event_is_series':
      return { key: 'event_is_series', text: 'A repeating event can’t become a tournament. Make a new event for it.' };
    case 'event_cancelled':
      return { key: 'event_cancelled', text: 'A cancelled event can’t become a tournament. Restore it first.' };
    case 'event_not_found':
      return { key: 'event_not_found', text: 'This event was deleted or moved to another team.' };
    case 'round_order': {
      if (ctx.save === 'cancel') {
        const later = ctx.after ? `R${ctx.after}` : 'a later round';
        return { key: 'restore_order', text: `${rn} can’t come back where it was: ${later} is now before it. Move ${later} first, then restore ${rn}.` };
      }
      const a = ctx.before ? `R${ctx.before}` : 'the round before it';
      return { key: 'round_order', text: `Rounds go in order. ${rn} can’t start before ${a}.` };
    }
    case 'round_count':
      return { key: 'round_count', text: 'A tournament has up to 6 rounds.' };
    case 'bad_name':
      return { key: 'bad_name', text: 'Add a name for the tournament, up to 120 characters.' };
    case 'round_started':
      return { key: 'round_started', text: `${rn} is under way, so it can’t be changed here. Change it from Tournaments.` };
    case 'round_has_scores':
      return { key: 'round_has_scores', text: ctx.save === 'untrack' ? 'Scores are entered for this tournament, so it stays tracked.' : `${rn} has scores, so it can’t be cancelled. Change it from Tournaments.` };
    case 'tournament_official':
      return { key: 'tournament_official', text: 'This tournament’s results are official, so it can’t stop being tracked.' };
    case 'qualifier_not_found':
      return { key: 'qualifier_not_found', text: 'That qualifier was deleted. Pick another or choose None.' };
    case 'qualifier_linked':
      return { key: 'qualifier_linked', text: 'That qualifier already counts toward another event. Pick another or choose None.' };
    case 'trip_not_found':
      return { key: 'trip_not_found', text: 'That trip is already linked to another event. Pick another or choose None.' };
    case 'entries_unavailable':
      return { key: 'entries_unavailable', text: 'The lineup can’t be saved from here yet. Save without it and set it in Tournaments.' };
    case 'round_type_locked':
    case 'round_fields_locked':
    case 'round_team_locked':
    case 'round_series_locked':
      return { key: 'round_locked', text: `This event is part of ${tn}. Its type, name and course are changed in Tournaments.` };
    case 'not_coach':
      return { key: 'not_coach', text: 'Only coaches on this team can set up tournaments.' };
    case 'request_conflict':
    case 'not_found':
    case 'bad_input':
    case 'flag_off':
    case 'failed':
    default:
      if (ctx.save === 'round') return { key: 'round_failed', text: `Couldn’t save ${rn}. Nothing was changed.` };
      if (ctx.save === 'cancel' || ctx.save === 'untrack') return { key: 'change_failed', text: `Couldn’t change ${tn}. Nothing was changed.` };
      return { key: 'create_failed', text: 'Couldn’t set up the tournament. Nothing was saved.' };
  }
}
