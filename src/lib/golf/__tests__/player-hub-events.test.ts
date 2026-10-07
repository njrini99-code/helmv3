import { describe, expect, it } from 'vitest';
import type { Json } from '@/lib/types/database';
import { parsePlayerHubEvents } from '../player-hub-events';

const row = (over: Record<string, Json> = {}): Json => ({
  id: 'e1',
  event_id: 'e1',
  title: 'Team dinner',
  event_type: 'meeting',
  start_time: '2026-10-04T18:00:00+00:00',
  end_time: null,
  location: 'Carolina Inn',
  is_mandatory: false,
  rsvp_status: 'pending',
  going_count: 4,
  maybe_count: 1,
  ...over,
});

describe('parsePlayerHubEvents (get_player_hub_events returns Json)', () => {
  it('reads the documented array', () => {
    const out = parsePlayerHubEvents([row()]);
    expect(out).toEqual({
      ok: true,
      rows: [
        {
          id: 'e1',
          event_id: 'e1',
          title: 'Team dinner',
          event_type: 'meeting',
          start_time: '2026-10-04T18:00:00+00:00',
          end_time: null,
          location: 'Carolina Inn',
          is_mandatory: false,
          rsvp_status: 'pending',
          going_count: 4,
          maybe_count: 1,
        },
      ],
    });
  });

  it('null data and an empty array are no events', () => {
    expect(parsePlayerHubEvents(null)).toEqual({ ok: true, rows: [] });
    expect(parsePlayerHubEvents([])).toEqual({ ok: true, rows: [] });
  });

  it('keeps an uninvited event (no attendance row) as null', () => {
    const out = parsePlayerHubEvents([row({ rsvp_status: null })]);
    expect(out.ok && out.rows[0]!.rsvp_status).toBeNull();
  });

  it('maps the CHECK constraint synonyms, and never turns an invitation into "not invited"', () => {
    const statuses = ['attending', 'not_attending', 'maybe', 'excused', 'unexcused', 'declined'];
    const out = parsePlayerHubEvents(statuses.map((s, i) => row({ id: `e${i}`, rsvp_status: s })));
    expect(out.ok && out.rows.map((r) => r.rsvp_status)).toEqual(['accepted', 'declined', 'tentative', 'pending', 'pending', 'declined']);
  });

  it('reads missing counts as zero', () => {
    const out = parsePlayerHubEvents([row({ going_count: null, maybe_count: null })]);
    expect(out.ok && [out.rows[0]!.going_count, out.rows[0]!.maybe_count]).toEqual([0, 0]);
  });

  it('refuses anything that is not the documented shape, so the caller fails the read', () => {
    expect(parsePlayerHubEvents({ events: [] }).ok).toBe(false);
    expect(parsePlayerHubEvents('[]').ok).toBe(false);
    expect(parsePlayerHubEvents([42]).ok).toBe(false);
    expect(parsePlayerHubEvents([row({ start_time: null })]).ok).toBe(false);
    expect(parsePlayerHubEvents([row({ going_count: 'four' })]).ok).toBe(false);
  });
});
