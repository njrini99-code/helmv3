import { describe, it, expect } from 'vitest';
import type { GolfQualifier } from '@/lib/types/golf';
import {
  buildQualifiersVerdict,
  daysUntil,
  fieldDomain,
  isPointEvent,
  lockingSoon,
  needsDecision,
  openSpots,
  pickHero,
  recentlyConcluded,
  selectionStateLabel,
  stageRows,
  toBar,
} from '../qualifiers-field-logic';

const TODAY = '2026-09-10';
const fmt = (d: string) => d;

function q(overrides: Partial<GolfQualifier> & Pick<GolfQualifier, 'id' | 'name' | 'start_date' | 'status'>): GolfQualifier {
  return {
    course_id: null, course_name: null, created_at: null, created_by: null, description: null,
    end_date: null, entry_deadline: null, num_rounds: 1, rules: null,
    selection_slots_coach_pick: 0, selection_slots_total: 5, selection_state: 'open',
    spots_available: 5, target_tournament_id: null, team_id: 't', updated_at: null,
    ...overrides,
  } as GolfQualifier;
}

describe('daysUntil', () => {
  it('counts whole local days forward and backward', () => {
    expect(daysUntil('2026-09-13', TODAY)).toBe(3);
    expect(daysUntil('2026-09-10', TODAY)).toBe(0);
    expect(daysUntil('2026-09-07', TODAY)).toBe(-3);
  });

  it('does not shift a date-only value across a day boundary', () => {
    // The bug this guards: new Date('2026-01-01') is UTC midnight, which any
    // zone behind UTC reads back as Dec 31.
    expect(daysUntil('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('pickHero', () => {
  it('prefers the live qualifier over any upcoming one', () => {
    const live = q({ id: 'l', name: 'Live', start_date: '2026-09-20', status: 'in_progress' });
    const soon = q({ id: 's', name: 'Soon', start_date: '2026-09-12', status: 'upcoming' });
    expect(pickHero([soon, live])?.id).toBe('l');
  });

  it('otherwise takes the soonest upcoming, not the list head', () => {
    // The loader orders start_date DESC, so the first row is the furthest out.
    const later = q({ id: 'a', name: 'Later', start_date: '2026-11-01', status: 'upcoming' });
    const sooner = q({ id: 'b', name: 'Sooner', start_date: '2026-09-12', status: 'upcoming' });
    expect(pickHero([later, sooner])?.id).toBe('b');
  });

  it('returns null when nothing is active', () => {
    expect(pickHero([q({ id: 'c', name: 'Done', start_date: '2026-01-01', status: 'completed' })])).toBeNull();
  });
});

describe('buildQualifiersVerdict', () => {
  it('never mentions entries for a live qualifier, whose entry period is over', () => {
    const hero = q({ id: 'l', name: 'Live', start_date: '2026-09-01', status: 'in_progress', entry_deadline: '2026-08-25' });
    const text = buildQualifiersVerdict({ hero, activeCount: 1, concludedCount: 0, today: TODAY, formatDate: fmt })
      .map((p) => p.text).join('');
    expect(text).toContain('is live');
    expect(text).not.toContain('Entries');
  });

  it('omits the entry clause entirely when no deadline was recorded', () => {
    const hero = q({ id: 'u', name: 'Next', start_date: '2026-09-24', status: 'upcoming' });
    const text = buildQualifiersVerdict({ hero, activeCount: 1, concludedCount: 2, today: TODAY, formatDate: fmt })
      .map((p) => p.text).join('');
    expect(text).not.toContain('Entries');
    expect(text).toContain('The lineup is open.');
    expect(text).toContain('1 active, 2 concluded.');
  });

  it('says a deadline has passed rather than printing a negative countdown', () => {
    const hero = q({ id: 'u', name: 'Next', start_date: '2026-09-24', status: 'upcoming', entry_deadline: '2026-09-01' });
    const text = buildQualifiersVerdict({ hero, activeCount: 1, concludedCount: 0, today: TODAY, formatDate: fmt })
      .map((p) => p.text).join('');
    expect(text).toContain('Entries closed 2026-09-01.');
  });

  it('states the absence plainly when nothing is active', () => {
    const text = buildQualifiersVerdict({ hero: null, activeCount: 0, concludedCount: 6, today: TODAY, formatDate: fmt })
      .map((p) => p.text).join('');
    expect(text).toBe('No qualifier is active right now. 0 active, 6 concluded.');
  });
});

describe('toBar', () => {
  it('turns amber only for an upcoming deadline inside a week', () => {
    const near = q({ id: 'a', name: 'A', start_date: '2026-10-01', status: 'upcoming', entry_deadline: '2026-09-14' });
    const far = q({ id: 'b', name: 'B', start_date: '2026-11-01', status: 'upcoming', entry_deadline: '2026-10-20' });
    expect(toBar(near, TODAY).tone).toBe('urgent');
    expect(toBar(far, TODAY).tone).toBe('neutral');
  });

  it('marks a missing deadline rather than inventing a waiting period', () => {
    const bar = toBar(q({ id: 'c', name: 'C', start_date: '2026-10-01', status: 'upcoming' }), TODAY);
    expect(bar.deadlineUnknown).toBe(true);
    expect(bar.trackStart).toBe(bar.playStart);
  });

  it('clamps a deadline recorded after the start so the bar cannot run backwards', () => {
    const bar = toBar(
      q({ id: 'd', name: 'D', start_date: '2026-10-01', status: 'upcoming', entry_deadline: '2026-10-09' }),
      TODAY,
    );
    expect(bar.trackStart).toBe('2026-10-01');
  });

  it('keeps a null spot count null instead of coercing it to zero', () => {
    expect(toBar(q({ id: 'e', name: 'E', start_date: '2026-10-01', status: 'upcoming', spots_available: null }), TODAY).spots).toBeNull();
  });
});

describe('openSpots', () => {
  it('counts only rows that have a number, and reports how many it left out', () => {
    const rows = [
      q({ id: 'a', name: 'A', start_date: '2026-10-01', status: 'upcoming', spots_available: 4 }),
      q({ id: 'b', name: 'B', start_date: '2026-10-02', status: 'upcoming', spots_available: null }),
      q({ id: 'c', name: 'C', start_date: '2026-01-01', status: 'completed', spots_available: 9 }),
    ];
    expect(openSpots(rows)).toEqual({ total: 4, unknown: 1 });
  });
});

describe('stageRows', () => {
  const live = q({ id: 'l', name: 'Live', start_date: '2026-09-01', status: 'in_progress' });
  const up1 = q({ id: 'u1', name: 'Up one', start_date: '2026-09-20', status: 'upcoming' });
  const up2 = q({ id: 'u2', name: 'Up two', start_date: '2026-09-12', status: 'upcoming' });
  const done = Array.from({ length: 8 }, (_, i) =>
    q({ id: `d${i}`, name: `Done ${i}`, start_date: `2026-0${(i % 8) + 1}-01`, status: 'completed' }),
  );

  it('orders live, then upcoming soonest first, then recent history', () => {
    const ids = stageRows([up1, done[0]!, live, up2], 'active').map((r) => r.id);
    expect(ids.slice(0, 3)).toEqual(['l', 'u2', 'u1']);
  });

  it('caps history in the active view but keeps everything in the all view', () => {
    const all = [live, up1, ...done];
    expect(stageRows(all, 'active').filter((r) => r.status === 'completed')).toHaveLength(5);
    expect(stageRows(all, 'all')).toHaveLength(all.length);
  });

  it('keeps a status this app never writes reachable in the all view', () => {
    const odd = q({ id: 'x', name: 'Odd', start_date: '2026-09-05', status: 'archived' });
    expect(stageRows([odd], 'all').map((r) => r.id)).toEqual(['x']);
  });
});

describe('fieldDomain', () => {
  it('starts at the earliest deadline, not the earliest start', () => {
    // The deadline sits before today so the domain's left edge is the deadline
    // rather than the Today clamp, which is what this case is actually about.
    const rows = [q({ id: 'a', name: 'A', start_date: '2026-10-01', end_date: '2026-10-03', status: 'upcoming', entry_deadline: '2026-09-05' })];
    expect(fieldDomain(rows, TODAY)).toEqual({ start: '2026-09-05', end: '2026-10-03' });
  });

  it('clamps the left edge to today when every date is still ahead', () => {
    const rows = [q({ id: 'a', name: 'A', start_date: '2026-10-01', end_date: '2026-10-03', status: 'upcoming', entry_deadline: '2026-09-15' })];
    expect(fieldDomain(rows, TODAY)).toEqual({ start: TODAY, end: '2026-10-03' });
  });

  it('always contains today, so the Today rule has somewhere to sit', () => {
    const rows = [q({ id: 'a', name: 'A', start_date: '2026-01-01', end_date: '2026-01-02', status: 'completed' })];
    const d = fieldDomain(rows, TODAY);
    expect(d.start).toBe('2026-01-01');
    expect(d.end).toBe(TODAY);
  });
});

describe('the ledger selections', () => {
  it('lists only active qualifiers whose lineup is not decided', () => {
    const rows = [
      q({ id: 'a', name: 'A', start_date: '2026-09-20', status: 'upcoming', selection_state: 'open' }),
      q({ id: 'b', name: 'B', start_date: '2026-09-21', status: 'upcoming', selection_state: 'selected' }),
      q({ id: 'c', name: 'C', start_date: '2026-01-01', status: 'completed', selection_state: 'open' }),
    ];
    expect(needsDecision(rows).map((r) => r.id)).toEqual(['a']);
  });

  it('lists upcoming deadlines inside 30 days, soonest first, and no past ones', () => {
    const rows = [
      q({ id: 'far', name: 'Far', start_date: '2026-12-01', status: 'upcoming', entry_deadline: '2026-11-20' }),
      q({ id: 'near', name: 'Near', start_date: '2026-09-25', status: 'upcoming', entry_deadline: '2026-09-15' }),
      q({ id: 'past', name: 'Past', start_date: '2026-09-25', status: 'upcoming', entry_deadline: '2026-09-01' }),
      q({ id: 'none', name: 'None', start_date: '2026-09-25', status: 'upcoming' }),
    ];
    expect(lockingSoon(rows, TODAY).map((r) => r.q.id)).toEqual(['near']);
  });

  it('takes the five most recent concluded qualifiers, newest first', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      q({ id: `d${i}`, name: `D${i}`, start_date: `2026-0${i + 1}-01`, status: 'completed' }),
    );
    expect(recentlyConcluded(rows).map((r) => r.id)).toEqual(['d6', 'd5', 'd4', 'd3', 'd2']);
  });
});

describe('selectionStateLabel', () => {
  it('says what each real enum value means, and treats a null as open', () => {
    expect(selectionStateLabel('open')).toBe('open');
    expect(selectionStateLabel('scoring')).toBe('scoring');
    expect(selectionStateLabel('closed')).toBe('closed, awaiting picks');
    expect(selectionStateLabel('selected')).toBe('decided');
    expect(selectionStateLabel(null)).toBe('open');
  });
});

describe('isPointEvent', () => {
  it('is true when the whole qualifier is one day, so the field draws a mark and not a length', () => {
    const bar = toBar(q({ id: 'one', name: 'One day', start_date: '2026-09-12', status: 'upcoming' }), TODAY);
    expect(bar.trackStart).toBe('2026-09-12');
    expect(bar.trackEnd).toBe('2026-09-12');
    expect(isPointEvent(bar)).toBe(true);
  });

  it('is false once an entry deadline gives the bar a span to draw', () => {
    const bar = toBar(
      q({ id: 'span', name: 'Span', start_date: '2026-09-12', end_date: '2026-09-12', entry_deadline: '2026-09-05', status: 'upcoming' }),
      TODAY,
    );
    expect(isPointEvent(bar)).toBe(false);
  });

  it('is false when play runs across more than one day', () => {
    const bar = toBar(
      q({ id: 'multi', name: 'Multi', start_date: '2026-09-12', end_date: '2026-09-14', status: 'upcoming' }),
      TODAY,
    );
    expect(isPointEvent(bar)).toBe(false);
  });
});
