import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compareRatchet, ratchetCounts } from '../css-quality.mjs';
import { GATE_LANES } from '../gate-lanes.mjs';

test('hex colours count everywhere but tokens.css, and fragment urls are not colours', () => {
  const css = '.a { color: #fff; background: url(#x) #123456; } .b { --own: #abc; }';
  assert.equal(ratchetCounts(css, 'src/clubhouse/styles/x.css').hex, 3);
  assert.equal(ratchetCounts(css, 'src/clubhouse/styles/tokens.css').hex, 0);
});

test('overflow: visible counts on a drawing, not on an ordinary box', () => {
  assert.equal(ratchetCounts('.holesvg { overflow: visible; }')['svg-overflow-visible'], 1);
  assert.equal(ratchetCounts('.row { overflow: visible; }')['svg-overflow-visible'], 0);
});

test("a negative inline margin counts under the lane's scope and in its stylesheets (the Home rows set it with no scope in the selector)", () => {
  assert.equal(ratchetCounts('.r { margin-inline: -12px; }', 'src/clubhouse/styles/home.css')['crh-negative-margin'], 1);
  assert.equal(ratchetCounts("[data-ch-crh='on'] .r { margin-inline: -12px; }")['crh-negative-margin'], 1);
  assert.equal(ratchetCounts('.r { margin-inline: -12px; }')['crh-negative-margin'], 0);
  assert.equal(ratchetCounts("[data-ch-crh='on'] .r { margin-inline: 12px; }")['crh-negative-margin'], 0);
});

test('the ratchet fails both ways: more than recorded, and less until the record is lowered', () => {
  const was = { 'a.css': { hex: 2 } };
  assert.deepEqual(compareRatchet({ 'a.css': { hex: 2 } }, was), []);
  assert.match(compareRatchet({ 'a.css': { hex: 3 } }, was)[0].reason, /Use a token/);
  assert.match(compareRatchet({ 'a.css': { hex: 1 } }, was)[0].reason, /--ratchet/);
  assert.match(compareRatchet({ 'b.css': { hex: 1 } }, {})[0].reason, /Use a token/);
});

test('the gate lanes script lists every screen the spec opens', () => {
  const screens = [...readFileSync('e2e/clubhouse-gate/screens.ts', 'utf8').matchAll(/s\('(\w+)', '([\w-]+)'/g)];
  assert.ok(screens.length > 20);
  for (const [, lane, id] of screens) assert.equal(GATE_LANES[id], lane, id);
  assert.equal(Object.keys(GATE_LANES).length, screens.length);
});

test('every known failure names a screen the gate opens and a bug', () => {
  const known = readFileSync('e2e/clubhouse-gate/known.ts', 'utf8');
  for (const [, key, bug] of known.matchAll(/'([\w-]+\|\d+\|(?:light|dark)\|[\w-]+)': '([\w-]+)'/g)) {
    assert.ok(GATE_LANES[key.split('|')[0]], key);
    assert.match(bug, /^(?:[A-Z]+-)+(?:\d+|[A-Z]+)$/, key);
  }
});
