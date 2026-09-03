// node:test fixtures for scripts/knowledge/check-journeys.mjs's pure
// validator. Run directly: node --test scripts/knowledge/__tests__/check-journeys.test.mjs
//
// These do not touch the real memory/journeys/golden-paths.yml or the real
// filesystem — every file citation is resolved against an in-memory fixture
// map, so a test failure here means the VALIDATOR logic is wrong, not that
// a real citation drifted (that is what running the CLI against the real
// file proves, separately).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJourneysDoc } from '../check-journeys.mjs';

const REGISTRY_FEATURE_IDS = new Set(['golf_round_lifecycle', 'auth_onboarding_join']);

function fakeFiles(map) {
  return {
    repoRoot: '/fake',
    fileTracked: (p) => Object.prototype.hasOwnProperty.call(map, p),
    readFileText: (p) => map[p],
  };
}

function validJourney(overrides = {}) {
  return {
    id: 'player_login_hub',
    name: 'Player logs in',
    role: 'player',
    criticality: 'high',
    status: 'active',
    environment_strategy: { production: 'read_only_observation', preview: 'executable' },
    description: 'A player logs in.',
    stages: [
      {
        id: 'authenticate',
        order: 1,
        feature_id: 'auth_onboarding_join',
        production_observation: 'natural',
        invariant_ids: [],
        invariant_status: 'MISSING',
        observable_signals: [
          { type: 'e2e', spec_path: 'e2e/auth.spec.ts', test_name: 'should log in', line: 1 },
        ],
      },
    ],
    ...overrides,
  };
}

test('a minimal valid journey doc passes with zero problems', () => {
  const doc = { journeys: [validJourney()] };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('should log in', () => {});" }),
  };
  assert.deepEqual(validateJourneysDoc(doc, ctx), []);
});

test('missing top-level journeys array fails', () => {
  const ctx = { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles({}) };
  const problems = validateJourneysDoc({}, ctx);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /journeys.*array/);
});

test('duplicate journey ids fail', () => {
  const doc = { journeys: [validJourney(), validJourney()] };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('should log in', () => {});" }),
  };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /duplicate journey id/.test(p)));
});

test('invalid role/criticality/status/environment_strategy each fail', () => {
  const doc = {
    journeys: [
      validJourney({
        role: 'admin',
        criticality: 'critical',
        status: 'done',
        environment_strategy: { production: 'always', preview: 'sometimes' },
      }),
    ],
  };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('should log in', () => {});" }),
  };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /role must be one of/.test(p)));
  assert.ok(problems.some((p) => /criticality must be one of/.test(p)));
  assert.ok(problems.some((p) => /status must be one of/.test(p)));
  assert.ok(problems.some((p) => /environment_strategy\.production/.test(p)));
  assert.ok(problems.some((p) => /environment_strategy\.preview/.test(p)));
});

test('stage order must equal 1-based array position', () => {
  const journey = validJourney();
  journey.stages[0].order = 2;
  const doc = { journeys: [journey] };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('should log in', () => {});" }),
  };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /order must equal 1-based array position/.test(p)));
});

test('feature_id not present in the registry fails', () => {
  const journey = validJourney();
  journey.stages[0].feature_id = 'not_a_real_feature';
  const doc = { journeys: [journey] };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('should log in', () => {});" }),
  };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /is not a key under features:/.test(p)));
});

test('invariant_status MISSING with non-empty invariant_ids fails, and vice versa', () => {
  const j1 = validJourney();
  j1.stages[0].invariant_ids = ['INV-ROUND-001'];
  j1.stages[0].invariant_status = 'MISSING';

  const j2 = validJourney({ id: 'player_login_hub_2' });
  j2.stages[0].invariant_ids = [];
  j2.stages[0].invariant_status = 'LINKED';

  const doc = { journeys: [j1, j2] };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('should log in', () => {});" }),
  };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /MISSING but invariant_ids is non-empty/.test(p)));
  assert.ok(problems.some((p) => /LINKED but invariant_ids is empty/.test(p)));
});

test('empty observable_signals fails', () => {
  const journey = validJourney();
  journey.stages[0].observable_signals = [];
  const doc = { journeys: [journey] };
  const ctx = { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles({}) };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /observable_signals must be a non-empty array/.test(p)));
});

test('e2e signal: untracked spec_path fails', () => {
  const doc = { journeys: [validJourney()] };
  const ctx = { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles({}) };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /spec_path.*does not resolve to a tracked file/.test(p)));
});

test('e2e signal: test_name not found verbatim in spec_path fails (drift detection)', () => {
  const doc = { journeys: [validJourney()] };
  const ctx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'e2e/auth.spec.ts': "test('a completely different test', () => {});" }),
  };
  const problems = validateJourneysDoc(doc, ctx);
  assert.ok(problems.some((p) => /was not found verbatim.*citation has drifted/.test(p)));
});

test('flight_recorder signal: workflow/step_key must be found as quoted literals', () => {
  const journey = validJourney();
  journey.stages[0].observable_signals = [
    {
      type: 'flight_recorder',
      source_path: 'src/app/golf/actions/golf.ts',
      workflow: 'golf.round.submit',
      step_key: 'db.submit_round_atomic',
    },
  ];
  const doc = { journeys: [journey] };

  const passCtx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({
      'src/app/golf/actions/golf.ts': "workflow: 'golf.round.submit', step: 'db.submit_round_atomic'",
    }),
  };
  assert.deepEqual(validateJourneysDoc(doc, passCtx), []);

  const failCtx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'src/app/golf/actions/golf.ts': "workflow: 'something.else'" }),
  };
  const problems = validateJourneysDoc(doc, failCtx);
  assert.ok(problems.some((p) => /workflow.*was not found as a quoted string literal/.test(p)));
  assert.ok(problems.some((p) => /step_key.*was not found as a quoted string literal/.test(p)));
});

test('span signal requires `export const <symbol>` verbatim', () => {
  const journey = validJourney();
  journey.stages[0].observable_signals = [
    { type: 'span', source_path: 'src/lib/observability/spans.ts', symbol: 'OP_ROUND_STAGE' },
  ];
  const doc = { journeys: [journey] };

  const passCtx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'src/lib/observability/spans.ts': "export const OP_ROUND_STAGE = 'golf.round.stage';" }),
  };
  assert.deepEqual(validateJourneysDoc(doc, passCtx), []);

  const failCtx = {
    registryFeatureIds: REGISTRY_FEATURE_IDS,
    ...fakeFiles({ 'src/lib/observability/spans.ts': 'export const SOMETHING_ELSE = 1;' }),
  };
  const problems = validateJourneysDoc(doc, failCtx);
  assert.ok(problems.some((p) => /was not found as `export const OP_ROUND_STAGE`/.test(p)));
});

test('metric signal: planned_not_merged is exempt from file existence, live is not', () => {
  const journey = validJourney();
  journey.stages[0].observable_signals = [
    {
      type: 'metric',
      source_path: 'src/lib/observability/metrics.ts',
      symbol: 'helm.workflow.success',
      build_status: 'planned_not_merged',
    },
  ];
  const plannedDoc = { journeys: [journey] };
  const ctx = { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles({}) };
  assert.deepEqual(validateJourneysDoc(plannedDoc, ctx), []);

  const liveJourney = validJourney();
  liveJourney.stages[0].observable_signals = [
    {
      type: 'metric',
      source_path: 'src/lib/observability/metrics.ts',
      symbol: 'helm.workflow.success',
      build_status: 'live',
    },
  ];
  const liveDoc = { journeys: [liveJourney] };
  const problems = validateJourneysDoc(liveDoc, ctx);
  assert.ok(problems.some((p) => /does not resolve to a tracked file/.test(p)));
});

test('planned signal is only legal on a collecting journey, needs a reason, and no file citation', () => {
  const activeJourney = validJourney({ status: 'active' });
  activeJourney.stages[0].observable_signals = [{ type: 'planned', reason: 'no e2e yet' }];
  const activeDoc = { journeys: [activeJourney] };
  const ctx = { registryFeatureIds: REGISTRY_FEATURE_IDS, ...fakeFiles({}) };
  const activeProblems = validateJourneysDoc(activeDoc, ctx);
  assert.ok(activeProblems.some((p) => /only legal when the journey's status is "collecting"/.test(p)));

  const collectingJourney = validJourney({ status: 'collecting' });
  collectingJourney.stages[0].observable_signals = [{ type: 'planned' }];
  const collectingDoc = { journeys: [collectingJourney] };
  const collectingProblems = validateJourneysDoc(collectingDoc, ctx);
  assert.ok(collectingProblems.some((p) => /must carry a non-empty `reason`/.test(p)));

  const withCitation = validJourney({ status: 'collecting' });
  withCitation.stages[0].observable_signals = [
    { type: 'planned', reason: 'no e2e yet', spec_path: 'e2e/fake.spec.ts' },
  ];
  const withCitationDoc = { journeys: [withCitation] };
  const withCitationProblems = validateJourneysDoc(withCitationDoc, ctx);
  assert.ok(withCitationProblems.some((p) => /must not carry spec_path\/source_path/.test(p)));

  const clean = validJourney({ status: 'collecting' });
  clean.stages[0].observable_signals = [{ type: 'planned', reason: 'no e2e yet' }];
  const cleanDoc = { journeys: [clean] };
  assert.deepEqual(validateJourneysDoc(cleanDoc, ctx), []);
});
