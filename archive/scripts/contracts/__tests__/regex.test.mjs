// archived by the control-plane reset 2026-09-05; last used 2026-09-03;
// nothing referenced it (verified: no package.json/CI/hook/vitest/doc reference).

import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegExp } from '../lib/regex.mjs';

test('escapeRegExp makes metacharacters literal', () => {
  const id = 'golf_round.lifecycle+(v2)';
  const re = new RegExp(escapeRegExp(id));
  assert.equal(re.test('feature golf_round.lifecycle+(v2) here'), true);
  // Unescaped, "." would match any char and "+(v2)" would be a quantified group.
  assert.equal(re.test('feature golf_roundXlifecycle+(v2) here'), false);
  assert.equal(re.test('feature golf_round.lifecyclev2 here'), false);
});

test('escapeRegExp composes with word boundaries for dotted ids', () => {
  const re = new RegExp(`\\b${escapeRegExp('golf_round.lifecycle')}\\b`);
  assert.equal(re.test('see golf_round.lifecycle now'), true);
  assert.equal(re.test('see golf_round.lifecycles now'), false);
  assert.equal(re.test('see golf_roundXlifecycle now'), false);
});

test('escapeRegExp leaves plain identifiers unchanged', () => {
  assert.equal(escapeRegExp('admin_platform'), 'admin_platform');
});
