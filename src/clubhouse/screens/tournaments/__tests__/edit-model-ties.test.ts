import { describe, expect, it } from 'vitest';
import { stateFromDraft, toUpdateInput } from '../edit-model';
import type { ChTourEventDraft } from '../types';

/** F-04: an event's tiebreak opens in the edit form as saved and is sent back with the save. */

const draft = (tiebreak: ChTourEventDraft['tiebreak']): ChTourEventDraft => ({
  name: 'Pinehurst Invitational',
  host: '',
  startDate: '2026-11-05',
  endDate: '2026-11-06',
  resultsUrl: '',
  notes: '',
  format: { kind: '5c4', players: 5, counting: 4, holes: 18 } as ChTourEventDraft['format'],
  kind: 'regular',
  tiebreak,
  rounds: [
    { date: '2026-11-05', courseId: null, startType: 'tee_times', firstTee: null },
    { date: '2026-11-06', courseId: null, startType: 'tee_times', firstTee: null },
  ],
  fieldSize: null,
  fieldTeams: [],
  line: null,
  adviceGivers: [],
  qualifierId: null,
  itineraryId: null,
  version: 3,
});

describe('edit model: Ties (F-04)', () => {
  it('opens on the saved tiebreak, a playoff included, and saves what the form holds', () => {
    for (const t of ['ties_stand', 'ncaa', 'playoff'] as const) {
      const s = stateFromDraft(draft(t), [], 'America/New_York');
      expect(s.tiebreak).toBe(t);
      expect(toUpdateInput(s, 'America/New_York').tiebreak).toBe(t);
    }
    const changed = { ...stateFromDraft(draft('ties_stand'), [], 'America/New_York'), tiebreak: 'ncaa' as const };
    expect(toUpdateInput(changed, 'America/New_York')).toMatchObject({ tiebreak: 'ncaa' });
  });
});
