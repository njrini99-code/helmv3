import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegExp } from '../lib/regex.mjs';

test('escapeRegExp makes metacharacters literal', () => {
  const id = 'golf_round.lifecycle+(v2)';
  const re = new RegExp(`\\b${escapeRegExp(id)}\\b`);
  assert.equal(re.test(`feature golf_round.lifecycle+(v2) here`), true);
  assert.equal(re.test(`feature golf_roundXlifecycle+(v2) here`), false);
});

test('escapeRegExp leaves plain identifiers unchanged', () => {
  assert.equal(escapeRegExp('admin_platform'), 'admin_platform');
});
