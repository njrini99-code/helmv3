/**
 * Class attribution on the shared team calendar.
 *
 * A coach asked "if I'm looking at a full calendar how do I know who is who?"
 * — every class meeting rendered identically, with the owning player recorded
 * nowhere on the row but the `[class:<id>]` description tag. These tests pin
 * both halves of the answer: the label a chip can show, and who is allowed to
 * see the block at all.
 */
import { describe, it, expect } from 'vitest';
import {
  attributeClassEvents,
  ownerInitials,
  shortOwnerLabel,
  stripClassTag,
  type ClassOwnerIndex,
} from '@/lib/calendar/class-events';

interface Ev {
  id: string;
  event_type: string;
  description?: string | null;
}

const OWNERS: ClassOwnerIndex = {
  'cls-braeden': { playerId: 'p-braeden', firstName: 'Braeden', lastName: 'Gillen' },
  'cls-kalani': { playerId: 'p-kalani', firstName: 'Kalani', lastName: 'Centeno' },
};

function classEvent(id: string, classId: string): Ev {
  return { id, event_type: 'class', description: `Instructor: Dr. Reddy\nCredits: 3\n[class:${classId}]` };
}
const PRACTICE: Ev = { id: 'practice', event_type: 'practice', description: 'Bring wedges' };

const COACH = { isCoach: true, playerId: null, ownersResolved: true };
const BRAEDEN = { isCoach: false, playerId: 'p-braeden', ownersResolved: true };

describe('attributeClassEvents — the coach can tell who is who', () => {
  it('labels each class with its owning player and leaves team events alone', () => {
    const out = attributeClassEvents(
      [PRACTICE, classEvent('e1', 'cls-braeden'), classEvent('e2', 'cls-kalani')],
      OWNERS,
      COACH,
    );

    expect(out).toHaveLength(3);
    expect(out[0]!.owner_label).toBeUndefined(); // a practice belongs to the team
    expect(out[1]!.owner_label).toBe('Braeden G.');
    expect(out[1]!.owner_initials).toBe('BG');
    expect(out[1]!.owner_player_id).toBe('p-braeden');
    expect(out[2]!.owner_label).toBe('Kalani C.');
  });

  it('still shows a coach a class it cannot attribute, just without a name', () => {
    // Never hide calendar data from the coach — an orphaned or unreadable tag
    // means "unknown owner", not "should not exist".
    const out = attributeClassEvents([classEvent('e1', 'cls-deleted')], OWNERS, COACH);

    expect(out).toHaveLength(1);
    expect(out[0]!.owner_label).toBeUndefined();
  });

  it('is idempotent — the server payload is attributed again on the client', () => {
    const once = attributeClassEvents([classEvent('e1', 'cls-braeden')], OWNERS, COACH);
    const twice = attributeClassEvents(once, OWNERS, COACH);

    expect(twice).toEqual(once);
  });
});

describe('attributeClassEvents — a player sees only their own classes', () => {
  // golf_player_classes RLS says a player may read their own classes and their
  // coach may read the team's; a teammate may read neither. The calendar put
  // every class on every teammate's view anyway. Putting NAMES on those blocks
  // without fixing this would publish the roster's whereabouts.
  it("drops a teammate's class and keeps the viewer's own", () => {
    const out = attributeClassEvents(
      [PRACTICE, classEvent('mine', 'cls-braeden'), classEvent('theirs', 'cls-kalani')],
      OWNERS,
      BRAEDEN,
    );

    expect(out.map((e) => e.id)).toEqual(['practice', 'mine']);
    expect(out[1]!.owner_label).toBe('Braeden G.');
  });

  it('drops a class it cannot attribute, rather than guessing it is theirs', () => {
    const out = attributeClassEvents([classEvent('e1', 'cls-deleted')], OWNERS, BRAEDEN);

    expect(out).toHaveLength(0);
  });

  it('strips ALL classes from a player when the ownership lookup failed', () => {
    // THIS EXPECTATION WAS DELIBERATELY REVERSED (2026-08-08).
    //
    // It used to assert that a failed lookup left both rows in place, on the
    // reasoning that unknown ownership should not make a player's own schedule
    // vanish on a transient error. That reasoning weighed the wrong two costs:
    // the alternative is not "the player loses their own classes", it is "one
    // failed roster read publishes every teammate's timetable, fully rendered".
    //
    // Measured on production: 323 class rows on Shenandoah's women's team
    // belonging to three players — course, building, meeting times, all term.
    // Against that, a player briefly not seeing class blocks they can re-load
    // is the cheaper way to be wrong.
    //
    // The caller still logs the failed lookup, so this is not silent.
    const out = attributeClassEvents(
      [classEvent('mine', 'cls-braeden'), classEvent('theirs', 'cls-kalani')],
      {},
      { ...BRAEDEN, ownersResolved: false },
    );

    expect(out).toHaveLength(0);
  });

  it('still shows a COACH every class when the ownership lookup failed', () => {
    // A coach is entitled to the whole squad's class blocks, and the conflict
    // checker is built on them — failing closed for a coach would break
    // scheduling to protect data they may already see.
    const out = attributeClassEvents(
      [classEvent('mine', 'cls-braeden'), classEvent('theirs', 'cls-kalani')],
      {},
      { isCoach: true, playerId: null, ownersResolved: false },
    );

    expect(out).toHaveLength(2);
  });
});

describe('label helpers', () => {
  it('abbreviates to fit a calendar chip and degrades on partial names', () => {
    expect(shortOwnerLabel({ playerId: 'p', firstName: 'Braeden', lastName: 'Gillen' })).toBe('Braeden G.');
    expect(shortOwnerLabel({ playerId: 'p', firstName: 'Braeden', lastName: null })).toBe('Braeden');
    expect(shortOwnerLabel({ playerId: 'p', firstName: null, lastName: 'Gillen' })).toBe('Gillen');
    expect(shortOwnerLabel({ playerId: 'p', firstName: null, lastName: null })).toBe('Player');
    expect(ownerInitials({ playerId: 'p', firstName: 'Kalani', lastName: 'Centeno' })).toBe('KC');
  });

  it('keeps the internal ownership tag out of anything a coach reads', () => {
    expect(stripClassTag('Instructor: Dr. Reddy\nCredits: 3\n[class:7605fd55-1464-4ff2-b312-7d541d153f04]'))
      .toBe('Instructor: Dr. Reddy\nCredits: 3');
    // A description that was ONLY the tag has nothing left to show.
    expect(stripClassTag('[class:abc]')).toBeNull();
    expect(stripClassTag(null)).toBeNull();
  });
});
