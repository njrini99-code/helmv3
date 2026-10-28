import { describe, expect, it } from 'vitest';
import { lineupFor, loadRoundRefs } from '../calendar-rounds';

/**
 * P-5 8.10 / 4.33: a player learns only whether a round's lineup is published. A lock is not a publish, and a publish
 * scheduled for later has not happened yet, so neither may read as Published to a player before the reveal.
 */

const NOW = Date.parse('2026-10-20T15:00:00Z');
const PAST = '2026-10-19T12:00:00Z';
const LATER = '2026-10-22T12:00:00Z';

describe('lineupFor', () => {
  it('a player: locked but not published is none, never published or locked', () => {
    expect(lineupFor({ lineup_locked_at: PAST, lineup_published_at: null }, 'player', true, NOW)).toBe('none');
  });

  it('a player: published (and reached) is published, locked or not', () => {
    expect(lineupFor({ lineup_locked_at: null, lineup_published_at: PAST }, 'player', false, NOW)).toBe('published');
    expect(lineupFor({ lineup_locked_at: PAST, lineup_published_at: PAST }, 'player', false, NOW)).toBe('published');
  });

  it('a player: a publish scheduled for later is none until it arrives', () => {
    expect(lineupFor({ lineup_locked_at: PAST, lineup_published_at: LATER }, 'player', false, NOW)).toBe('none');
    expect(lineupFor({ lineup_locked_at: null, lineup_published_at: LATER }, 'player', false, Date.parse(LATER))).toBe('published');
  });

  it('a player never sees a draft', () => {
    expect(lineupFor({ lineup_locked_at: null, lineup_published_at: null }, 'player', true, NOW)).toBe('none');
  });

  it('a coach sees the whole state, as before', () => {
    expect(lineupFor({ lineup_locked_at: PAST, lineup_published_at: null }, 'coach', true, NOW)).toBe('locked');
    expect(lineupFor({ lineup_locked_at: null, lineup_published_at: PAST }, 'coach', true, NOW)).toBe('published');
    expect(lineupFor({ lineup_locked_at: null, lineup_published_at: null }, 'coach', true, NOW)).toBe('draft');
    expect(lineupFor({ lineup_locked_at: null, lineup_published_at: null }, 'coach', false, NOW)).toBe('none');
  });
});

describe('loadRoundRefs', () => {
  const tournament = (over: Record<string, unknown>) => ({ id: 't1', name: 'Pinehurst Invitational', rounds_count: 3, version: 2, lineup_locked_at: null, lineup_published_at: null, ...over });
  const client = (t: Record<string, unknown>) => {
    const reads: string[] = [];
    const result = (table: string, select: string) => {
      if (table === 'golf_tournament_rounds' && select.startsWith('round_event_id')) {
        return { data: [{ round_event_id: 'e1', tournament_id: 't1', round_number: 1, start_type: 'tee_times', status: 'upcoming', course_label: null, tournament: t }], error: null };
      }
      if (table === 'golf_tournament_rounds') return { data: [{ tournament_id: 't1', event: { status: 'confirmed' } }], error: null };
      return { data: [{ tournament_id: 't1' }], error: null };
    };
    return {
      reads,
      from: (table: string) => ({
        select: (select: string) => ({
          in: async () => {
            reads.push(table);
            return result(table, select);
          },
        }),
      }),
    };
  };

  it('a player’s ref for a locked, unpublished lineup says none, and the entries are never read', async () => {
    const sb = client(tournament({ lineup_locked_at: PAST }));
    const { refs, failed } = await loadRoundRefs(sb, ['e1'], 'player', NOW);
    expect(failed).toBe(false);
    expect(refs.get('e1')?.lineup).toBe('none');
    expect(sb.reads).not.toContain('golf_tournament_entries');
  });

  it('a player’s ref for a published lineup says published', async () => {
    const { refs } = await loadRoundRefs(client(tournament({ lineup_locked_at: PAST, lineup_published_at: PAST })), ['e1'], 'player', NOW);
    expect(refs.get('e1')?.lineup).toBe('published');
  });

  it('a coach’s ref for the same locked lineup says locked', async () => {
    const { refs } = await loadRoundRefs(client(tournament({ lineup_locked_at: PAST })), ['e1'], 'coach', NOW);
    expect(refs.get('e1')?.lineup).toBe('locked');
  });
});
