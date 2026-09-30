import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorsOf, checkClassOwners } from '../css-owners.mjs';

test('a selector anchors on its first page class, after a shared scope', () => {
  const shared = new Set(['ch-root', 'ch-btn']);
  const css = '.ch-root .ch-rs{} .ch-rsu-tee > .ch-rd-tee{} .ch-btn.ch-ms-send{} .ch-root:has(.ch-sheet) .ch-z{} @media (max-width: 600px){.ch-root .ch-ph{}}';
  assert.deepEqual([...anchorsOf(css, shared)].sort(), ['ch-ms-send', 'ch-ph', 'ch-rs', 'ch-rsu-tee', 'ch-z']);
});

test('two page stylesheets anchoring one class are flagged (the Roster and Setup .ch-rs bug)', () => {
  const v = checkClassOwners({
    'shell.css': '.ch-root{}',
    'roster.css': '.ch-root .ch-rs{visibility:hidden}',
    'rounds-setup.css': '.ch-rs{display:grid}',
  });
  assert.equal(v.length, 1);
  assert.match(v[0], /roster\.css and .*rounds-setup\.css both anchor \.ch-rs/);
});

test("styling another page's class inside your own is not a collision, and shared classes are everyone's", () => {
  const v = checkClassOwners({
    'ui.css': '.ch-btn{}',
    'rounds.css': '.ch-rd-tee{width:10px}',
    'rounds-setup.css': '.ch-rsu-sw .ch-rd-tee{width:22px} .ch-btn{margin:0}',
    'hub.css': '.ch-btn{margin:0}',
  });
  assert.deepEqual(v, []);
});
