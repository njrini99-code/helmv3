// =============================================================================
// Unit tests for the operational rule engine (operational-rule-engine.ts).
//
// Locks the V5 System 1 deterministic-rule invariants:
//   - each spec category produces a signal from its real condition;
//   - severity escalates with urgency but a rule NEVER inflates an inferred fact
//     (duplicate-by-name) past 'warning' or above confidence 1.0;
//   - rules degrade to nothing on empty/missing facts (no fabricated alerts);
//   - recruiting rules are gated on the opt-in flag (no nagging college players)
//     AND on the product module, since a pre-sunset opt-in outlives the sunset;
//   - dedupe keys are stable per (rule, subject) so a re-run UPSERTs not clones;
//   - the evaluator isolates a throwing rule + sorts deterministically.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  runOperationalRuleEngine,
  normalizedNameKey,
  DEFAULT_RULE_ENGINE_CONFIG,
  type OperationalRuleFacts,
} from '@/lib/baseball/operational-rule-engine';

const NOW = '2026-06-24T12:00:00.000Z';

function emptyFacts(overrides: Partial<OperationalRuleFacts> = {}): OperationalRuleFacts {
  return {
    upcomingEvents: [],
    expectedAttendeeCount: 0,
    practices: [],
    tasks: [],
    documents: [],
    travel: [],
    players: [],
    recentGames: [],
    inactiveImportRows: [],
    requiredDocumentCategories: [],
    ai: { lastGeneratedAt: null },
    nowIso: NOW,
    ...overrides,
  };
}

function iso(hoursFromNow: number): string {
  return new Date(Date.parse(NOW) + hoursFromNow * 3_600_000).toISOString();
}

describe('operational rule engine — empty facts', () => {
  it('emits nothing from an empty snapshot (never fabricates)', () => {
    const { signals } = runOperationalRuleEngine(emptyFacts());
    expect(signals).toEqual([]);
  });
});

describe('event_ack_missing', () => {
  it('fires for a mandatory event inside the horizon with missing acks', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        expectedAttendeeCount: 10,
        upcomingEvents: [
          {
            id: 'ev1',
            title: 'Team Lift',
            eventType: 'lift',
            startsAt: iso(24),
            isMandatory: true,
            ackUserIds: ['u1', 'u2'],
          },
        ],
      }),
    );
    const s = signals.find((x) => x.ruleId === 'event_ack_missing');
    expect(s).toBeDefined();
    expect(s!.eventId).toBe('ev1');
    expect(s!.confidence).toBe(1); // literally counted
    expect(s!.title).toContain('8 unacknowledged');
  });

  it('escalates to critical when imminent with zero acks', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        expectedAttendeeCount: 5,
        upcomingEvents: [
          {
            id: 'ev2',
            title: 'Game',
            eventType: 'event',
            startsAt: iso(6),
            isMandatory: true,
            ackUserIds: [],
          },
        ],
      }),
    );
    expect(signals.find((x) => x.ruleId === 'event_ack_missing')!.severity).toBe('critical');
  });

  it('does NOT fire for a non-mandatory event or a fully-acked one', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        expectedAttendeeCount: 2,
        upcomingEvents: [
          {
            id: 'opt',
            title: 'Optional',
            eventType: 'event',
            startsAt: iso(10),
            isMandatory: false,
            ackUserIds: [],
          },
          {
            id: 'full',
            title: 'Mandatory full',
            eventType: 'event',
            startsAt: iso(10),
            isMandatory: true,
            ackUserIds: ['a', 'b'],
          },
        ],
      }),
    );
    expect(signals.filter((x) => x.ruleId === 'event_ack_missing')).toHaveLength(0);
  });
});

describe('task_overdue', () => {
  it('fires for an overdue, non-completed task and escalates after 3 days', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        tasks: [
          { id: 't1', title: 'Order uniforms', dueDate: iso(-24 * 4), status: 'pending' },
          { id: 't2', title: 'Recent', dueDate: iso(-2), status: 'in_progress' },
          { id: 't3', title: 'Done', dueDate: iso(-100), status: 'completed' },
        ],
      }),
    );
    const overdue = signals.filter((x) => x.ruleId === 'task_overdue');
    expect(overdue).toHaveLength(2); // t3 (completed) excluded
    expect(overdue.find((s) => s.title.includes('Order uniforms'))!.severity).toBe('critical');
    expect(overdue.find((s) => s.title.includes('Recent'))!.severity).toBe('warning');
  });
});

describe('practice_unpublished', () => {
  it('fires for a draft practice inside the publish window', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        practices: [
          { id: 'p1', title: 'Tue practice', status: 'draft', scheduledAt: iso(20), blocks: [] },
          { id: 'p2', title: 'Published', status: 'published', scheduledAt: iso(20), blocks: [] },
        ],
      }),
    );
    const s = signals.filter((x) => x.ruleId === 'practice_unpublished');
    expect(s).toHaveLength(1);
    expect(s[0]!.title).toContain('draft');
  });
});

describe('practice_block_no_owner', () => {
  it('fires when a non-completed practice has unowned blocks', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        practices: [
          {
            id: 'p1',
            title: 'Practice',
            status: 'published',
            scheduledAt: iso(20),
            blocks: [
              { id: 'b1', activity: 'BP', hasOwner: false },
              { id: 'b2', activity: 'Bullpens', hasOwner: true },
            ],
          },
        ],
      }),
    );
    const s = signals.find((x) => x.ruleId === 'practice_block_no_owner');
    expect(s).toBeDefined();
    expect(s!.title).toContain('1 practice block');
  });
});

describe('duplicate_player_match (inferred → capped honesty)', () => {
  it('flags two players with the same normalized name at < 1.0 confidence, never critical', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        players: [
          mkPlayer({ id: 'a', fullName: 'Jack Smith Jr.', normalizedNameKey: normalizedNameKey('Jack', 'Smith Jr') }),
          mkPlayer({ id: 'b', fullName: 'Jack Smith', normalizedNameKey: normalizedNameKey('Jack', 'Smith') }),
        ],
      }),
    );
    const s = signals.find((x) => x.ruleId === 'duplicate_player_match');
    expect(s).toBeDefined();
    expect(s!.confidence).toBeLessThan(1);
    expect(s!.severity).not.toBe('critical');
  });

  it('does NOT flag distinct names', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        players: [
          mkPlayer({ id: 'a', fullName: 'Jack Smith', normalizedNameKey: normalizedNameKey('Jack', 'Smith') }),
          mkPlayer({ id: 'b', fullName: 'Joe Brown', normalizedNameKey: normalizedNameKey('Joe', 'Brown') }),
        ],
      }),
    );
    expect(signals.filter((x) => x.ruleId === 'duplicate_player_match')).toHaveLength(0);
  });
});

describe('missing_external_id', () => {
  it('fires for an active player with no external id; not for inactive', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        players: [
          mkPlayer({ id: 'a', membershipStatus: 'active', hasExternalId: false }),
          mkPlayer({ id: 'b', membershipStatus: 'inactive', hasExternalId: false }),
          mkPlayer({ id: 'c', membershipStatus: 'active', hasExternalId: true }),
        ],
      }),
    );
    const s = signals.filter((x) => x.ruleId === 'missing_external_id');
    expect(s).toHaveLength(1);
    expect(s[0]!.playerId).toBe('a');
  });
});

describe('inactive_player_in_import', () => {
  it('fires per inactive import row', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        inactiveImportRows: [
          { playerLabel: 'Ghost Runner', importRunId: 'run1' },
          { playerLabel: 'Walk On', importRunId: 'run1' },
        ],
      }),
    );
    expect(signals.filter((x) => x.ruleId === 'inactive_player_in_import')).toHaveLength(2);
  });
});

describe('travel_missing_logistics', () => {
  it('fires for an upcoming trip missing transportation/accommodation', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        travel: [
          {
            id: 'tr1',
            eventName: 'Regional',
            departureDate: NOW.slice(0, 10),
            transportation: null,
            accommodation: 'Hotel',
          },
        ],
      }),
    );
    const s = signals.find((x) => x.ruleId === 'travel_missing_logistics');
    expect(s).toBeDefined();
    expect(s!.title).toContain('Regional');
    expect(s!.whyItMatters).toContain('transportation');
  });
});

describe('recruiting rules are opt-in gated', () => {
  it('does NOT nag a non-recruiting player about profile/video', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        players: [
          mkPlayer({
            id: 'col',
            recruitingActive: false,
            hasVideo: false,
            profileFieldsPresent: 0,
            profileFieldsTotal: 5,
          }),
        ],
      }),
    );
    expect(signals.filter((x) => ['profile_incomplete', 'missing_video'].includes(x.ruleId))).toHaveLength(0);
  });

  it('does NOT fire for a recruiting-active player while the module is sunset', () => {
    // The opt-in gate is no longer sufficient on its own. A player who
    // activated BEFORE the sunset still carries recruiting_activated = true, so
    // without the module gate both rules keep firing and keep telling them to
    // finish a recruiting profile because "incomplete profiles surface lower to
    // recruiters" — advice about a module they cannot reach, delivered as a
    // task in their inbox.
    const { signals, byRule } = runOperationalRuleEngine(
      emptyFacts({
        players: [
          mkPlayer({
            id: 'rec',
            recruitingActive: true,
            hasVideo: false,
            profileFieldsPresent: 1,
            profileFieldsTotal: 5,
          }),
        ],
      }),
    );

    expect(signals.filter((x) => ['profile_incomplete', 'missing_video'].includes(x.ruleId))).toHaveLength(0);

    // Omitted from byRule, not reported as 0 — "did not run" and "ran and found
    // nothing" are different facts, and a stats consumer should be able to tell
    // them apart.
    expect(byRule).not.toHaveProperty('profile_incomplete');
    expect(byRule).not.toHaveProperty('missing_video');

    // Non-recruiting rules in the same sweep are untouched — the gate is scoped
    // to ownerRole 'recruiting', not applied to the whole run.
    expect(Object.keys(byRule).length).toBeGreaterThan(0);
  });
});

describe('recruiting rules — restoration path', () => {
  // The pre-sunset behaviour is asserted here rather than deleted, so
  // re-enabling the module is verified rather than hoped for. This mock DOES
  // take effect (unlike the one in recruiting-activate-door.test.ts) because
  // the engine calls isRecruitingEnabled through an IMPORT of another module,
  // which is exactly what vi.mock replaces — not through its own internal
  // binding.
  beforeEach(() => {
    vi.resetModules();
  });

  it('fires profile_incomplete + missing_video for a recruiting-active player below the floor', async () => {
    vi.doMock('@/lib/baseball/product-modules', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
      return { ...actual, isRecruitingEnabled: () => true };
    });

    const { runOperationalRuleEngine: run } = await import(
      '@/lib/baseball/operational-rule-engine'
    );

    const { signals } = run(
      emptyFacts({
        players: [
          mkPlayer({
            id: 'rec',
            recruitingActive: true,
            hasVideo: false,
            profileFieldsPresent: 1,
            profileFieldsTotal: 5,
          }),
        ],
      }),
    );

    expect(signals.find((x) => x.ruleId === 'profile_incomplete')!.visibility).toBe('player_only');
    expect(signals.find((x) => x.ruleId === 'missing_video')).toBeDefined();

    vi.doUnmock('@/lib/baseball/product-modules');
  });
});

describe('official_stats_missing / postgame_review_needed', () => {
  it('flags a completed game past grace with no stats; not one in grace', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        recentGames: [
          { id: 'g1', label: 'vs State', playedAt: iso(-48), hasOfficialStats: false, hasPostgameReview: false },
          { id: 'g2', label: 'vs Tech', playedAt: iso(-2), hasOfficialStats: false, hasPostgameReview: false },
        ],
      }),
    );
    const missing = signals.filter((x) => x.ruleId === 'official_stats_missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.eventId).toBe('g1');
  });

  it('asks for a postgame review only once stats exist', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        recentGames: [
          { id: 'g1', label: 'vs State', playedAt: iso(-48), hasOfficialStats: true, hasPostgameReview: false },
          { id: 'g2', label: 'vs Tech', playedAt: iso(-48), hasOfficialStats: false, hasPostgameReview: false },
        ],
      }),
    );
    const reviews = signals.filter((x) => x.ruleId === 'postgame_review_needed');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.eventId).toBe('g1');
  });
});

describe('document_missing', () => {
  it('fires only for required categories with no document', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        requiredDocumentCategories: ['playbook', 'rules'],
        documents: [{ category: 'playbook' }],
      }),
    );
    const missing = signals.filter((x) => x.ruleId === 'document_missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.title).toContain('rules');
  });
});

describe('ai_output_stale', () => {
  it('fires when the last run is older than the stale window', () => {
    const staleHours = DEFAULT_RULE_ENGINE_CONFIG.aiStaleHours;
    const { signals } = runOperationalRuleEngine(
      emptyFacts({ ai: { lastGeneratedAt: iso(-(staleHours + 24)) } }),
    );
    expect(signals.find((x) => x.ruleId === 'ai_output_stale')).toBeDefined();
  });

  it('does NOT fire when never generated (that is "never run", not "stale")', () => {
    const { signals } = runOperationalRuleEngine(emptyFacts({ ai: { lastGeneratedAt: null } }));
    expect(signals.filter((x) => x.ruleId === 'ai_output_stale')).toHaveLength(0);
  });
});

describe('evaluator invariants', () => {
  it('dedupe keys are stable per (rule, subject)', () => {
    const facts = emptyFacts({
      tasks: [{ id: 't1', title: 'X', dueDate: iso(-30), status: 'pending' }],
    });
    const a = runOperationalRuleEngine(facts).signals[0]!.dedupeKey;
    const b = runOperationalRuleEngine(facts).signals[0]!.dedupeKey;
    expect(a).toBe(b);
    expect(a).toBe('task_overdue:t1');
  });

  it('sorts critical before warning before info', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        tasks: [{ id: 't1', title: 'Crit', dueDate: iso(-24 * 5), status: 'pending' }],
        requiredDocumentCategories: ['playbook'],
        documents: [],
      }),
    );
    const ranks = signals.map((s) => s.severity);
    // critical (task) must come before info (document)
    expect(ranks.indexOf('critical')).toBeLessThan(ranks.indexOf('info'));
  });

  it('all confidence values are within [0,1]', () => {
    const { signals } = runOperationalRuleEngine(
      emptyFacts({
        tasks: [{ id: 't1', title: 'X', dueDate: iso(-30), status: 'pending' }],
        players: [
          mkPlayer({ id: 'a', normalizedNameKey: 'dup' }),
          mkPlayer({ id: 'b', normalizedNameKey: 'dup' }),
        ],
      }),
    );
    for (const s of signals) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// -- helper -------------------------------------------------------------------
function mkPlayer(over: Partial<import('@/lib/baseball/operational-rule-engine').FactPlayer> = {}) {
  return {
    id: 'p',
    fullName: 'Test Player',
    membershipStatus: 'active',
    hasExternalId: true,
    hasProfile: true,
    profileFieldsPresent: 5,
    profileFieldsTotal: 5,
    hasVideo: true,
    recruitingActive: false,
    normalizedNameKey: 'test player',
    ...over,
  };
}
