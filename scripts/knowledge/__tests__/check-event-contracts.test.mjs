// node:test fixtures for scripts/knowledge/check-event-contracts.mjs's pure
// validator. Run directly: node --test scripts/knowledge/__tests__/check-event-contracts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEventContractsDoc } from '../check-event-contracts.mjs';

const JOURNEY_IDS = new Set(['player_login_hub']);

function fakeFiles(map) {
  return {
    fileTracked: (p) => Object.prototype.hasOwnProperty.call(map, p),
    readFileText: (p) => map[p],
  };
}

function validContract(overrides = {}) {
  return {
    event: 'player_login_hub.completed',
    journey_id: 'player_login_hub',
    stage_id: 'authenticate',
    platform: 'server',
    status: 'live',
    source_path: 'src/app/x.ts',
    allowed_properties: ['ip'],
    prohibited_properties: ['email'],
    ...overrides,
  };
}

const FILES = { 'src/app/x.ts': "captureServer('player_login_hub.completed', userId, {ip}).catch(() => {});" };

test('a minimal valid live contract passes with zero problems', () => {
  const problems = validateEventContractsDoc({ contracts: [validContract()] }, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.deepEqual(problems, []);
});

test('a planned contract with source_path: null passes', () => {
  const doc = { contracts: [validContract({ status: 'planned', source_path: null })] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.deepEqual(problems, []);
});

test('rejects a planned contract carrying a source_path', () => {
  const doc = { contracts: [validContract({ status: 'planned', source_path: 'src/app/x.ts' })] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('source_path: null')));
});

test('rejects a live contract whose event name is not found in source_path', () => {
  const files = { 'src/app/x.ts': 'nothing relevant here' };
  const doc = { contracts: [validContract()] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(files) });
  assert.ok(problems.some((p) => p.includes('not provably wired')));
});

test('rejects a journey_id that is not a real journey', () => {
  const doc = { contracts: [validContract({ journey_id: 'not_a_real_journey' })] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('journey_id')));
});

test('rejects a duplicate event name', () => {
  const doc = { contracts: [validContract(), validContract()] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('duplicate event name')));
});

test('rejects a property that is both allowed and prohibited', () => {
  const doc = { contracts: [validContract({ allowed_properties: ['ip'], prohibited_properties: ['ip'] })] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('both allowed and prohibited')));
});

test('rejects an invalid platform or status', () => {
  const doc = { contracts: [validContract({ platform: 'mobile' })] };
  const problems = validateEventContractsDoc(doc, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('platform must be one of')));
});

test('a doc without a top-level contracts array fails', () => {
  const problems = validateEventContractsDoc({}, { journeyIds: JOURNEY_IDS, ...fakeFiles(FILES) });
  assert.ok(problems.some((p) => p.includes('top-level `contracts` array')));
});
