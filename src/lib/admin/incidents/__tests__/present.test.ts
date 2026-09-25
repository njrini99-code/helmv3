import { describe, it, expect } from 'vitest';
import { resolveIncidentPresentation, presentationSubjectFromIncident, type PresentationSubject } from '../present';

function subject(overrides: Partial<PresentationSubject> = {}): PresentationSubject {
  return {
    errorCode: null,
    actionName: null,
    featureId: null,
    route: null,
    sport: null,
    message: '',
    klass: null,
    ...overrides,
  };
}

describe('resolveIncidentPresentation — tier 1: known code (SQLSTATE / PostgREST / provider)', () => {
  it('42501 + action generateRoundRecap.persist -> CoachHelm recap title (2026-08-25 production incident)', () => {
    const p = resolveIncidentPresentation(
      subject({ errorCode: '42501', actionName: 'generateRoundRecap.persist', featureId: 'round_review_ai' }),
    );
    expect(p.title).toBe('CoachHelm recap could not be saved');
    expect(p.operationContext).toBe('Golf > CoachHelm > Round Recap > Persist response');
    expect(p.resolvedBy).toBe('code');
    expect(p.matchedRule).toBe('pg-42501-round-review-persist');
    expect(p.technicalSignature).toContain('42501');
  });

  it('42501 + feature round_tracking (no action match) -> autosave title, distinct from the recap title above', () => {
    const p = resolveIncidentPresentation(subject({ errorCode: '42501', featureId: 'round_tracking' }));
    expect(p.title).toBe('Round autosave blocked by database permissions');
    expect(p.operationContext).toBe('Golf > Round Tracking > Autosave');
    expect(p.matchedRule).toBe('pg-42501-round-tracking');
  });

  it('42501 alone (no action, no matching feature) -> generic permission title, not either specific one', () => {
    const p = resolveIncidentPresentation(subject({ errorCode: '42501' }));
    expect(p.title).toBe('Blocked by a database permission check');
    expect(p.matchedRule).toBe('pg-42501-generic');
  });

  it('action beats feature when both are present for the same code (specificity ordering)', () => {
    const p = resolveIncidentPresentation(
      subject({ errorCode: '42501', actionName: 'generateRoundRecap.persist', featureId: 'round_tracking' }),
    );
    // action-scoped rule (score 2) outranks the feature-scoped rule (score 1)
    expect(p.matchedRule).toBe('pg-42501-round-review-persist');
  });

  it('42703 + getCommandPaletteData -> the 2026-09-02 roster_status production incident', () => {
    const p = resolveIncidentPresentation(subject({ errorCode: '42703', actionName: 'getCommandPaletteData' }));
    expect(p.title).toBe('Coach command palette could not load the roster');
    expect(p.operationContext).toBe('Golf > Coach Dashboard > Command Palette');
  });

  it('42703 alone -> generic missing-column title', () => {
    const p = resolveIncidentPresentation(subject({ errorCode: '42703' }));
    expect(p.title).toBe('Database query referenced a missing column');
  });

  const bareCodeCases: Array<[string, string]> = [
    ['23505', 'Duplicate entry rejected by the database'],
    ['23503', 'Related record missing — write rejected'],
    ['23502', 'Required field was empty — write rejected'],
    ['23514', 'A database check constraint rejected the write'],
    ['57014', 'Database query timed out'],
    ['40001', 'Database write conflicted with a concurrent transaction'],
    ['40P01', 'Database detected a deadlock'],
    ['42P01', 'Database is missing an expected table or view'],
    ['42883', 'Database function call did not match a known signature'],
    ['22P02', 'Database rejected a malformed id or value'],
    ['53300', 'Database connection pool is exhausted'],
    ['08006', 'Database connection failed'],
    ['PGRST116', 'Database expected exactly one row and found none or several'],
    ['PGRST301', 'Session token was rejected by the database'],
    ['PGRST204', 'Database schema cache is out of date'],
    ['PGRST002', 'Database API could not reach the database'],
    ['BadDeviceToken', 'Push notifications rejected stale Apple device tokens'],
    ['401', 'Request was not authenticated'],
    ['403', 'Request was forbidden by an authorization check'],
    ['429', 'Upstream provider rate-limited the request'],
    ['502', 'An upstream service returned a bad gateway'],
    ['504', 'An upstream service timed out'],
  ];

  for (const [code, expectedTitle] of bareCodeCases) {
    it(`${code} -> "${expectedTitle}"`, () => {
      const p = resolveIncidentPresentation(subject({ errorCode: code }));
      expect(p.title).toBe(expectedTitle);
      expect(p.resolvedBy).toBe('code');
    });
  }

  it('code matching is case-insensitive', () => {
    const p = resolveIncidentPresentation(subject({ errorCode: 'baddevicetoken' }));
    expect(p.title).toBe('Push notifications rejected stale Apple device tokens');
  });

  it('provider_* prefix family resolves to one shared title regardless of suffix', () => {
    const a = resolveIncidentPresentation(subject({ errorCode: 'provider_quota_exhausted' }));
    const b = resolveIncidentPresentation(subject({ errorCode: 'provider_credential_invalid' }));
    expect(a.title).toBe('An upstream provider rejected the request');
    expect(b.title).toBe('An upstream provider rejected the request');
    expect(a.matchedRule).toBe('provider-fault');
  });
});

describe('resolveIncidentPresentation — tier 2: known operation/RPC/action (no matched code)', () => {
  it('submitGolfRoundComprehensive with an unmatched code -> Round submit failed', () => {
    const p = resolveIncidentPresentation(subject({ actionName: 'submitGolfRoundComprehensive', errorCode: 'XX000' }));
    expect(p.title).toBe('Round submit failed');
    expect(p.operationContext).toBe('Golf > Round Tracking > Submit');
    expect(p.resolvedBy).toBe('operation');
  });

  it('savePartialRound (autosave) with no code -> Round autosave failed', () => {
    const p = resolveIncidentPresentation(subject({ actionName: 'savePartialRound' }));
    expect(p.title).toBe('Round autosave failed');
  });

  it('generateRoundRecap with no code -> generation failure, distinct from the persist-permission title', () => {
    const p = resolveIncidentPresentation(subject({ actionName: 'generateRoundRecap' }));
    expect(p.title).toBe('CoachHelm recap generation failed');
  });

  it('generateRoundRecap.playerName -> player-lookup title', () => {
    const p = resolveIncidentPresentation(subject({ actionName: 'generateRoundRecap.playerName' }));
    expect(p.title).toBe('CoachHelm recap could not resolve the player');
  });

  it('getCommandPaletteData with no code -> load failure title', () => {
    const p = resolveIncidentPresentation(subject({ actionName: 'getCommandPaletteData' }));
    expect(p.title).toBe('Coach command palette failed to load');
  });
});

describe('resolveIncidentPresentation — tier 3: known feature (no code, no known action)', () => {
  const featureCases: Array<[string, string, string]> = [
    ['auth_onboarding', 'Auth session refresh failed', 'Golf > Auth > Session'],
    ['qualifiers', 'Qualifier lifecycle action failed', 'Golf > Qualifiers > Lifecycle'],
    ['notifications', 'Push notification delivery failed', 'Golf > Notifications > Push delivery'],
    ['coachhelm_ai_engine', 'CoachHelm AI request failed', 'Golf > CoachHelm > AI engine'],
    ['round_review_ai', 'CoachHelm round review failed', 'Golf > CoachHelm > Round Review'],
    ['roster_management', 'Roster action failed', 'Golf > Roster > Management'],
    ['messaging', 'Team messaging action failed', 'Golf > Messaging'],
    ['baseball_roster', 'Baseball roster action failed', 'Baseball > Roster'],
    ['baseball_lifting', 'Lift Lab action failed', 'Baseball > Lift Lab'],
  ];

  for (const [featureId, expectedTitle, expectedContext] of featureCases) {
    it(`${featureId} -> "${expectedTitle}"`, () => {
      const p = resolveIncidentPresentation(subject({ featureId }));
      expect(p.title).toBe(expectedTitle);
      expect(p.operationContext).toBe(expectedContext);
      expect(p.resolvedBy).toBe('feature');
    });
  }
});

describe('resolveIncidentPresentation — tier 4: normalized stack/fingerprint', () => {
  it('round submit + a message that contains "timed out" -> the brief\'s own worked example', () => {
    const p = resolveIncidentPresentation(
      subject({ actionName: 'submitGolfRoundComprehensive', message: 'AbortError: signal timed out after 3000ms' }),
    );
    expect(p.title).toBe('Round submit timed out waiting for Supabase');
  });

  it('Inngest signature failure message -> Inngest signing key title', () => {
    const p = resolveIncidentPresentation(subject({ message: 'Error: No x-inngest-signature provided' }));
    expect(p.title).toBe('Inngest production signing key is missing or invalid');
    expect(p.technicalSignature).toBe('Inngest: invalid signature');
  });

  it('transient network message family ("Load failed", "TypeError: fetch failed") -> the brief\'s own worked example', () => {
    const a = resolveIncidentPresentation(subject({ message: 'TypeError: Load failed' }));
    const b = resolveIncidentPresentation(subject({ message: 'TypeError: fetch failed' }));
    expect(a.title).toBe('Server could not reach an external dependency');
    expect(b.title).toBe('Server could not reach an external dependency');
    expect(a.technicalSignature).toBe('TypeError: fetch failed');
  });

  it('"player profile not found" message -> player-lookup title', () => {
    const p = resolveIncidentPresentation(subject({ message: 'Round submit failed: player profile not found' }));
    expect(p.title).toBe('Player profile could not be resolved for this request');
  });

  it('React #310 message -> hooks-mismatch title', () => {
    const p = resolveIncidentPresentation(subject({ message: 'Minified React error #310; visit https://react.dev/errors/310' }));
    expect(p.title).toBe('Client rendered an inconsistent number of hooks');
    expect(p.technicalSignature).toBe('React error #310');
  });

  it('React #418 message -> hydration-mismatch title', () => {
    const p = resolveIncidentPresentation(subject({ message: 'Minified React error #418; visit https://react.dev/errors/418' }));
    expect(p.title).toBe('Client HTML did not match the server-rendered page');
    expect(p.technicalSignature).toBe('React error #418');
  });

  it('a bare "timed out" message with no matching action falls through to Inngest/network checks and then the generic fallback', () => {
    const p = resolveIncidentPresentation(subject({ message: 'operation timed out', klass: 'defect' }));
    // No fingerprint rule is unscoped for a bare timeout, so this is generic.
    expect(p.resolvedBy).toBe('generic');
    expect(p.title).toBe('An unexpected error occurred');
  });
});

describe('resolveIncidentPresentation — production message shapes with no captured code (2026-09-23 Bridge mislabel)', () => {
  // Real admin_events messages, UUIDs replaced. Before these rules every one
  // of them resolved to "An unexpected error occurred" / "signature unavailable".
  const STATEMENT_TIMEOUT = 'getInsightsForCoach failed: canceling statement due to statement timeout';
  const SCHEMA_CACHE =
    'PuttDistanceGenerator run() failed for player=<id>: putt-distance aggregate query failed: Could not query the database for the schema cache. Retrying.';
  const ABORT_TIMEOUT = 'The operation was aborted due to timeout';
  const WRAPPED_TIMEOUT_ERROR =
    '[getPlayerHubSummaryData] events read failed — refusing to render an empty hub: msg=TimeoutError: The operation was aborted due to timeout';

  it('statement timeout message -> the same title as code 57014, with a named signature', () => {
    const byMessage = resolveIncidentPresentation(subject({ message: STATEMENT_TIMEOUT, klass: 'defect' }));
    const byCode = resolveIncidentPresentation(subject({ errorCode: '57014' }));
    expect(byMessage.title).toBe(byCode.title);
    expect(byMessage.title).toBe('Database query timed out');
    expect(byMessage.operationContext).toBe('Platform > Database > Query');
    expect(byMessage.resolvedBy).toBe('fingerprint');
    expect(byMessage.matchedRule).toBe('fp-statement-timeout');
    expect(byMessage.technicalSignature).toBe('Postgres: statement timeout');
  });

  it('PostgREST "could not query the database for the schema cache" -> the same title as code PGRST002', () => {
    const byMessage = resolveIncidentPresentation(subject({ message: SCHEMA_CACHE, klass: 'defect' }));
    const byCode = resolveIncidentPresentation(subject({ errorCode: 'PGRST002' }));
    expect(byMessage.title).toBe(byCode.title);
    expect(byMessage.title).toBe('Database API could not reach the database');
    expect(byMessage.matchedRule).toBe('fp-schema-cache-unreachable');
    expect(byMessage.technicalSignature).toBe('PostgREST: schema cache unavailable');
  });

  it('a PGRST204-shaped "column ... in the schema cache" message is NOT read as the unreachable-database rule', () => {
    const p = resolveIncidentPresentation(
      subject({ message: "Could not find the 'status' column of 'golf_players' in the schema cache", klass: 'defect' }),
    );
    expect(p.matchedRule).not.toBe('fp-schema-cache-unreachable');
    expect(p.resolvedBy).toBe('generic');
  });

  it('the signature names the failure, never a code the row did not carry', () => {
    const a = resolveIncidentPresentation(subject({ message: STATEMENT_TIMEOUT }));
    const b = resolveIncidentPresentation(subject({ message: SCHEMA_CACHE }));
    expect(a.technicalSignature).not.toContain('57014');
    expect(b.technicalSignature).not.toContain('PGRST002');
  });

  it('a captured code still wins over the message, and its signature shows the real code', () => {
    const p = resolveIncidentPresentation(subject({ errorCode: '57014', message: STATEMENT_TIMEOUT }));
    expect(p.resolvedBy).toBe('code');
    expect(p.matchedRule).toBe('pg-57014');
    expect(p.technicalSignature).toContain('57014');
  });

  it('TimeoutError / "aborted due to timeout" on a server render or action -> Request timed out', () => {
    for (const message of [ABORT_TIMEOUT, WRAPPED_TIMEOUT_ERROR, 'AbortError: request timed out after 8000ms']) {
      const p = resolveIncidentPresentation(subject({ message, klass: 'defect' }));
      expect(p.title).toBe('Request timed out');
      expect(p.matchedRule).toBe('fp-request-timeout');
      expect(p.technicalSignature).toBe('TimeoutError: operation aborted');
    }
  });

  it('a bare AbortError with no timeout (e.g. the user navigated away) is not called a timeout', () => {
    const p = resolveIncidentPresentation(subject({ message: 'AbortError: The user aborted a request.', klass: 'defect' }));
    expect(p.matchedRule).not.toBe('fp-request-timeout');
    expect(p.resolvedBy).toBe('generic');
  });

  it('a network failure keeps its own title even when a timeout word is also present', () => {
    const p = resolveIncidentPresentation(subject({ message: 'TypeError: fetch failed (cause: TimeoutError)' }));
    expect(p.matchedRule).toBe('fp-transient-network');
  });

  it('feature tier keeps its title but now carries the fingerprint signature instead of "signature unavailable"', () => {
    const p = resolveIncidentPresentation(subject({ featureId: 'coachhelm_ai_engine', message: STATEMENT_TIMEOUT }));
    expect(p.resolvedBy).toBe('feature');
    expect(p.title).toBe('CoachHelm AI request failed');
    expect(p.technicalSignature).toBe('Postgres: statement timeout');
  });

  it('operation tier keeps its title but now carries the fingerprint signature', () => {
    const p = resolveIncidentPresentation(subject({ actionName: 'getCommandPaletteData', message: SCHEMA_CACHE }));
    expect(p.resolvedBy).toBe('operation');
    expect(p.title).toBe('Coach command palette failed to load');
    expect(p.technicalSignature).toBe('PostgREST: schema cache unavailable');
  });

  it('feature tier with an unrecognised message still says "signature unavailable" rather than guessing', () => {
    const p = resolveIncidentPresentation(subject({ featureId: 'coachhelm_ai_engine', message: 'kaboom' }));
    expect(p.technicalSignature).toBe('signature unavailable');
  });

  it('an event with neither a code nor a recognised message still yields the generic fallback', () => {
    const p = resolveIncidentPresentation(subject({ message: 'something odd happened', klass: 'defect' }));
    expect(p.resolvedBy).toBe('generic');
    expect(p.title).toBe('An unexpected error occurred');
    expect(p.technicalSignature).toBe('signature unavailable');
  });
});

describe('resolveIncidentPresentation — tier 5: generic fallback', () => {
  it('nothing recognised, no klass -> the honest unclassified fallback', () => {
    const p = resolveIncidentPresentation(subject({ message: 'kaboom' }));
    expect(p.resolvedBy).toBe('generic');
    expect(p.title).toBe('An unclassified error occurred');
    expect(p.technicalSignature).toBe('signature unavailable');
  });

  const klassCases: Array<[string, string]> = [
    ['defect', 'An unexpected error occurred'],
    ['degradation', 'A dependency degraded and the system fell back'],
    ['integration', 'An upstream provider returned an error'],
    ['access', 'Access was denied by an authorization check'],
    ['empty_state', 'No data was available yet for this request'],
    ['telemetry', 'A routine telemetry signal crossed its threshold'],
    ['integrity_ok', 'An integrity check completed successfully'],
  ];

  for (const [klass, expectedTitle] of klassCases) {
    it(`klass ${klass} -> "${expectedTitle}"`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = resolveIncidentPresentation(subject({ klass: klass as any }));
      expect(p.title).toBe(expectedTitle);
    });
  }

  it('generic fallback still carries a feature-scoped operation context when a feature id exists but is unmapped', () => {
    const p = resolveIncidentPresentation(subject({ featureId: 'settings', sport: 'golf' }));
    expect(p.resolvedBy).toBe('generic');
    expect(p.operationContext).toContain('Golf');
  });

  it('unmapped code, unmapped action, unmapped feature -> generic, never invents a specific title', () => {
    const p = resolveIncidentPresentation(
      subject({ errorCode: 'XX999', actionName: 'someUnknownAction', featureId: 'whats_new' }),
    );
    expect(p.resolvedBy).toBe('generic');
  });
});

describe('resolveIncidentPresentation — safety: never a UUID, an email, or raw message', () => {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const RAW_MESSAGE = 'DO-NOT-LEAK-njrini99@example.com-11111111-2222-3333-4444-555555555555';

  const allSubjects: PresentationSubject[] = [
    subject({ errorCode: '42501', actionName: 'generateRoundRecap.persist', message: RAW_MESSAGE }),
    subject({ errorCode: '42501', featureId: 'round_tracking', message: RAW_MESSAGE }),
    subject({ errorCode: '42501', message: RAW_MESSAGE }),
    subject({ errorCode: 'BadDeviceToken', message: RAW_MESSAGE }),
    subject({ actionName: 'submitGolfRoundComprehensive', message: RAW_MESSAGE }),
    subject({ featureId: 'auth_onboarding', message: RAW_MESSAGE }),
    subject({ message: `TypeError: fetch failed — ${RAW_MESSAGE}` }),
    subject({ message: `Minified React error #310 ${RAW_MESSAGE}` }),
    subject({ message: `canceling statement due to statement timeout ${RAW_MESSAGE}` }),
    subject({ message: `Could not query the database for the schema cache. ${RAW_MESSAGE}` }),
    subject({ message: `TimeoutError: The operation was aborted due to timeout ${RAW_MESSAGE}` }),
    subject({ featureId: 'coachhelm_ai_engine', message: `canceling statement due to statement timeout ${RAW_MESSAGE}` }),
    subject({ message: RAW_MESSAGE, klass: 'defect' }),
    subject({ errorCode: 'provider_x', message: RAW_MESSAGE }),
  ];

  for (const [i, s] of allSubjects.entries()) {
    it(`case ${i}: title and technicalSignature never echo the raw message`, () => {
      const p = resolveIncidentPresentation(s);
      expect(p.title).not.toContain('njrini99@example.com');
      expect(p.title).not.toMatch(UUID);
      expect(p.title).not.toMatch(EMAIL);
      expect(p.title).not.toContain('DO-NOT-LEAK');
      expect(p.technicalSignature).not.toContain('njrini99@example.com');
      expect(p.technicalSignature).not.toMatch(UUID);
      expect(p.technicalSignature).not.toContain('DO-NOT-LEAK');
    });
  }
});

describe('presentationSubjectFromIncident', () => {
  it('joins title + description into message and passes evidence fields through', () => {
    const s = presentationSubjectFromIncident({
      errorCode: '42501',
      actionName: 'generateRoundRecap.persist',
      featureId: 'round_review_ai',
      route: '/golf/rounds/1',
      sport: 'golf',
      title: 'permission denied',
      description: 'for schema helm_private',
      klass: 'defect',
    });
    expect(s.message).toBe('permission denied for schema helm_private');
    expect(s.errorCode).toBe('42501');
    const p = resolveIncidentPresentation(s);
    expect(p.title).toBe('CoachHelm recap could not be saved');
  });
});
